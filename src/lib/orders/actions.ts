"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows, dbInsert, dbUpdate, rpcParams, type Tables } from "@/lib/supabase/types";
import { requirePermission, type SessionUser } from "@/lib/rbac/guards";
import { fail, type ActionResult } from "@/lib/actions/result";
import { logActivity } from "@/lib/activity/log";
import { notifyLowStock, notifyOrderAssigned, notifyOrderDelivered } from "@/lib/notifications/service";
import { handleOrderCrm } from "@/lib/crm/hooks";
import { toCents } from "@/lib/format";
import { getOrderConfig, type OrderConfig } from "./config";
import {
  bulkOrderActionSchema,
  orderFormSchema,
  orderStatusChangeSchema,
  type BulkOrderActionInput,
  type OrderFormInput,
  type OrderStatusChangeInput,
} from "./schemas";

/**
 * Customer Orders Hub server actions. Pattern: permission guard → shared zod
 * validation → config-aware checks (status/priority keys come from Settings)
 * → RLS-scoped writes → order_status_history where relevant → activity log.
 */

export type OrderActionResult = { ok: true; orderId: string; orderCode: string } | { ok: false; error: string };
export type SimpleResult = ActionResult;

interface ComputedTotals {
  items: {
    name: string;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
    sort_order: number;
    product_id: string | null;
    variant_id: string | null;
  }[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

function computeTotals(input: OrderFormInput, taxRatePercent: number): ComputedTotals {
  const items = input.items.map((item, i) => {
    const unit = toCents(item.unitPrice);
    return {
      name: item.name,
      quantity: item.quantity,
      unit_price_cents: unit,
      line_total_cents: unit * item.quantity,
      sort_order: i,
      product_id: item.productId ?? null,
      variant_id: item.variantId ?? null,
    };
  });
  const subtotalCents = items.reduce((acc, item) => acc + item.line_total_cents, 0);
  const taxCents = Math.round((subtotalCents * taxRatePercent) / 100);
  return { items, subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

async function validateConfigKeys(
  input: Pick<OrderFormInput, "status" | "priority" | "printerId" | "materialType">,
) {
  const config = await getOrderConfig();
  if (!config.statuses.some((s) => s.key === input.status)) {
    throw new Error(`Unknown order status "${input.status}"`);
  }
  if (!config.priorities.some((p) => p.key === input.priority)) {
    throw new Error(`Unknown priority "${input.priority}"`);
  }
  if (input.printerId && !config.printers.some((p) => p.id === input.printerId)) {
    throw new Error("Unknown printer — pick one from the catalog");
  }
  if (input.materialType && !config.materials.some((m) => m.key === input.materialType)) {
    throw new Error(`Unknown material "${input.materialType}"`);
  }
  return config;
}

/** Material cost = filament grams × per-gram cost from Settings (cents). */
function materialCostCents(config: OrderConfig, materialType: string, grams: number): number {
  if (!materialType || grams <= 0) return 0;
  const material = config.materials.find((m) => m.key === materialType);
  return material ? Math.round(grams * material.cost_per_gram_cents) : 0;
}

/** Print-job + line-ref columns shared by create and update payloads. */
function printJobColumns(data: OrderFormInput, config: OrderConfig) {
  return {
    printer_id: data.printerId || null,
    estimated_print_minutes: data.estimatedPrintMinutes || 0,
    actual_print_minutes: data.actualPrintMinutes || 0,
    material_type: data.materialType || null,
    material_color: data.materialColor || null,
    filament_used_grams: data.filamentUsedGrams || 0,
    material_cost_cents: materialCostCents(config, data.materialType ?? "", data.filamentUsedGrams || 0),
    nozzle_size_mm: data.nozzleSizeMm ? Number(data.nozzleSizeMm) : null,
    layer_height_mm: data.layerHeightMm ? Number(data.layerHeightMm) : null,
    infill_percent: data.infillPercent ? Number(data.infillPercent) : null,
    post_processing: data.postProcessing || null,
    model_files: data.modelFiles as never,
  };
}

/**
 * Status-transition side effects (all idempotent at the DB layer):
 *   Shipped/Delivered → Sale movements (stamped once via sale_movements_at)
 *   Returned          → Return movements (restore stock)
 *   Delivered + Paid  → CRM aggregates + tier engine (crm_applied_at stamp)
 */
async function runOrderTransitionHooks(
  orderId: string,
  orderCode: string,
  status: string,
  paymentStatus: string,
  actor: SessionUser,
): Promise<void> {
  const supabase = await createClient();

  if (status === "shipped" || status === "delivered") {
    const { data: count, error } = await supabase.rpc(
      "apply_order_stock_movements",
      rpcParams("apply_order_stock_movements", { p_order_id: orderId, p_direction: "sale" }),
    );
    if (error) {
      console.error("[orders] sale movements failed:", error.message);
    } else if (Number(count ?? 0) > 0) {
      void logActivity({
        actor,
        action: "inventory.sale_movements",
        module: "inventory",
        targetType: "order",
        targetId: orderId,
        summary: `Recorded ${count} sale movement(s) for order ${orderCode}`,
      });
      await notifyLowStockForOrder(orderId);
    }
  }

  if (status === "returned") {
    const { data: count, error } = await supabase.rpc(
      "apply_order_stock_movements",
      rpcParams("apply_order_stock_movements", { p_order_id: orderId, p_direction: "return" }),
    );
    if (error) {
      console.error("[orders] return movements failed:", error.message);
    } else if (Number(count ?? 0) > 0) {
      void logActivity({
        actor,
        action: "inventory.return_movements",
        module: "inventory",
        targetType: "order",
        targetId: orderId,
        summary: `Restored stock for returned order ${orderCode} (${count} movement(s))`,
      });
    }
  }

  if (status === "delivered" && paymentStatus === "paid") {
    await handleOrderCrm(orderId, orderCode, actor);
  }
}

/** Low-stock alerts for any of this order's products at/below minimum. */
async function notifyLowStockForOrder(orderId: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("order_items")
    .select("products(id, name, current_stock, minimum_stock, low_stock)")
    .eq("order_id", orderId)
    .not("product_id", "is", null);
  const seen = new Set<string>();
  for (const row of asRows<{
    products: { id: string; name: string; current_stock: number; minimum_stock: number; low_stock: boolean } | null;
  }>(data)) {
    const p = row.products;
    if (p?.low_stock && !seen.has(p.id)) {
      seen.add(p.id);
      void notifyLowStock({
        productId: p.id,
        productName: p.name,
        newStock: p.current_stock,
        minimumStock: p.minimum_stock,
      });
    }
  }
}

/** Resolve the customer reference, creating a new customer when asked. */
async function resolveCustomer(input: OrderFormInput["customer"]): Promise<{ id: string; name: string }> {
  const supabase = await createClient();
  if (input.mode === "existing") {
    const { data } = await supabase
      .from("customers")
      .select("id, name")
      .eq("id", input.id)
      .maybeSingle();
    const row = asRow<{ id: string; name: string }>(data);
    if (!row) throw new Error("Customer not found");
    return row;
  }
  const { data, error } = await supabase
    .from("customers")
    .insert(dbInsert("customers", { name: input.name }))
    .select("id, name")
    .single();
  if (error) throw new Error(error.message);
  return asRow<{ id: string; name: string }>(data)!;
}

/** Staff without orders.assign always self-assign; admins assign anyone. */
function resolveAssignee(input: OrderFormInput, actor: SessionUser): string | null {
  if (actor.permissions.has("orders.assign")) {
    return input.assignedStaffId || null;
  }
  return actor.id;
}

export async function createOrderAction(input: OrderFormInput): Promise<OrderActionResult> {
  try {
    const actor = await requirePermission("orders.create");
    const parsed = orderFormSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const data = parsed.data;
    const config = await validateConfigKeys(data);
    const customer = await resolveCustomer(data.customer);
    const totals = computeTotals(data, config.defaultTaxRate);
    const supabase = await createClient();

    // Atomic, gap-tolerant code generation when the user leaves it blank.
    let orderCode = (data.orderCode ?? "").trim();
    if (!orderCode) {
      const { data: generated, error } = await supabase.rpc("next_order_code");
      if (error || !generated) throw new Error(error?.message ?? "Could not generate an order code");
      orderCode = String(generated);
    }

    const { data: orderRaw, error: orderError } = await supabase
      .from("orders")
      .insert(
        dbInsert("orders", {
          order_code: orderCode,
          customer_id: customer.id,
          buying_date: data.buyingDate,
          priority: data.priority,
          status: data.status,
          phone: data.phone || null,
          email: data.email || null,
          shipping_address: data.shippingAddress || null,
          delivery_date: data.deliveryDate || null,
          payment_method: data.paymentMethod || null,
          payment_status: data.paymentStatus,
          notes: data.notes || null,
          receipt_url: data.receiptPath || null,
          subtotal_cents: totals.subtotalCents,
          tax_cents: totals.taxCents,
          total_cents: totals.totalCents,
          currency: config.currency,
          assigned_staff_id: resolveAssignee(data, actor),
          created_by: actor.id,
          updated_by: actor.id,
          ...printJobColumns(data, config),
        }),
      )
      .select("id")
      .single();
    if (orderError) {
      if (orderError.code === "23505") {
        return { ok: false, error: `Order code "${orderCode}" is already in use.` };
      }
      throw new Error(orderError.message);
    }
    const orderId = asRow<{ id: string }>(orderRaw)!.id;

    // Voucher: validated + redeemed atomically by the engine RPC. If the code
    // is invalid the just-created order is rolled back (cascade delete) so the
    // user gets all-or-nothing behaviour.
    let discountCents = 0;
    if (data.voucherCode) {
      const { data: redeemRaw, error: redeemError } = await supabase.rpc(
        "redeem_voucher",
        rpcParams("redeem_voucher", {
          p_code: data.voucherCode.trim(),
          p_customer_id: customer.id,
          p_order_id: orderId,
          p_order_total_cents: totals.totalCents,
        }),
      );
      if (redeemError) {
        const admin = createAdminClient();
        await admin.from("orders").delete().eq("id", orderId);
        return { ok: false, error: redeemError.message.replace(/^.*?:\s*/, "") };
      }
      const redeemed = (Array.isArray(redeemRaw) ? redeemRaw[0] : redeemRaw) as
        | { redemption_id: string; discount_cents: number; voucher_id: string }
        | undefined;
      if (redeemed) {
        discountCents = Number(redeemed.discount_cents ?? 0);
        await supabase
          .from("orders")
          .update(
            dbUpdate("orders", {
              voucher_id: redeemed.voucher_id,
              discount_cents: discountCents,
              total_cents: Math.max(totals.totalCents - discountCents, 0),
            }),
          )
          .eq("id", orderId);
        void logActivity({
          actor,
          action: "voucher.redeem",
          module: "crm",
          targetType: "voucher",
          targetId: redeemed.voucher_id,
          summary: `Voucher ${data.voucherCode.trim().toUpperCase()} redeemed on order ${orderCode} (−${(discountCents / 100).toFixed(2)})`,
          after: { order_id: orderId, discount_cents: discountCents },
        });
      }
    }

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(dbInsert("order_items", totals.items.map((item) => ({ ...item, order_id: orderId }))));
    if (itemsError) throw new Error(itemsError.message);

    await supabase.from("order_status_history").insert(
      dbInsert("order_status_history", {
        order_id: orderId,
        from_status: null,
        to_status: data.status,
        comment: "Order created",
        changed_by: actor.id,
      }),
    );

    void logActivity({
      actor,
      action: "order.create",
      module: "orders",
      targetType: "order",
      targetId: orderId,
      summary: `Created order ${orderCode} for ${customer.name} (${totals.items.length} item(s))`,
      after: {
        order_code: orderCode,
        customer: customer.name,
        status: data.status,
        priority: data.priority,
        total_cents: totals.totalCents,
      },
    });

    const assignee = resolveAssignee(data, actor);
    if (assignee) {
      void notifyOrderAssigned({
        orderId,
        orderCode,
        assigneeId: assignee,
        actorId: actor.id,
        actorName: actor.fullName,
      });
    }

    // Orders created directly in Shipped/Delivered/Returned still move stock
    // and feed CRM — e.g. historical entries keyed in by hand.
    await runOrderTransitionHooks(orderId, orderCode, data.status, data.paymentStatus, actor);

    return { ok: true, orderId, orderCode };
  } catch (e) {
    return fail(e);
  }
}

type OrderSnapshot = Pick<
  Tables<"orders">,
  | "id"
  | "order_code"
  | "customer_id"
  | "buying_date"
  | "priority"
  | "status"
  | "phone"
  | "email"
  | "shipping_address"
  | "delivery_date"
  | "payment_method"
  | "payment_status"
  | "notes"
  | "receipt_url"
  | "total_cents"
  | "assigned_staff_id"
  | "created_by"
  | "is_active"
>;

const SNAPSHOT_COLUMNS =
  "id, order_code, customer_id, buying_date, priority, status, phone, email, shipping_address, delivery_date, payment_method, payment_status, notes, receipt_url, total_cents, assigned_staff_id, created_by, is_active";

async function getOrderSnapshot(id: string): Promise<OrderSnapshot | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select(SNAPSHOT_COLUMNS).eq("id", id).maybeSingle();
  return asRow<OrderSnapshot>(data);
}

export async function updateOrderAction(
  orderId: string,
  input: OrderFormInput,
): Promise<OrderActionResult> {
  try {
    const actor = await requirePermission("orders.edit");
    const parsed = orderFormSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const data = parsed.data;
    const config = await validateConfigKeys(data);

    // RLS also hides rows staff can't touch; this yields a clean 404 instead.
    const before = await getOrderSnapshot(orderId);
    if (!before) return { ok: false, error: "Order not found." };

    const customer = await resolveCustomer(data.customer);
    const totals = computeTotals(data, config.defaultTaxRate);
    const supabase = await createClient();

    const orderCode = (data.orderCode ?? "").trim() || before.order_code;

    const { error: updateError } = await supabase
      .from("orders")
      .update(
        dbUpdate("orders", {
          order_code: orderCode,
          customer_id: customer.id,
          buying_date: data.buyingDate,
          priority: data.priority,
          status: data.status,
          phone: data.phone || null,
          email: data.email || null,
          shipping_address: data.shippingAddress || null,
          delivery_date: data.deliveryDate || null,
          payment_method: data.paymentMethod || null,
          payment_status: data.paymentStatus,
          notes: data.notes || null,
          receipt_url: data.receiptPath || before.receipt_url,
          subtotal_cents: totals.subtotalCents,
          tax_cents: totals.taxCents,
          total_cents: totals.totalCents,
          assigned_staff_id: actor.permissions.has("orders.assign")
            ? data.assignedStaffId || null
            : before.assigned_staff_id,
          updated_by: actor.id,
          ...printJobColumns(data, config),
        }),
      )
      .eq("id", orderId);
    if (updateError) {
      if (updateError.code === "23505") {
        return { ok: false, error: `Order code "${orderCode}" is already in use.` };
      }
      throw new Error(updateError.message);
    }

    // Replace line items wholesale (simplest correct diff for ≤200 rows).
    const { error: deleteError } = await supabase.from("order_items").delete().eq("order_id", orderId);
    if (deleteError) throw new Error(deleteError.message);
    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(dbInsert("order_items", totals.items.map((item) => ({ ...item, order_id: orderId }))));
    if (itemsError) throw new Error(itemsError.message);

    if (before.status !== data.status) {
      await supabase.from("order_status_history").insert(
        dbInsert("order_status_history", {
          order_id: orderId,
          from_status: before.status,
          to_status: data.status,
          comment: "Changed while editing the order",
          changed_by: actor.id,
        }),
      );
    }

    void logActivity({
      actor,
      action: "order.update",
      module: "orders",
      targetType: "order",
      targetId: orderId,
      summary: `Updated order ${orderCode}`,
      before: {
        status: before.status,
        priority: before.priority,
        payment_status: before.payment_status,
        total_cents: before.total_cents,
        assigned_staff_id: before.assigned_staff_id,
      },
      after: {
        status: data.status,
        priority: data.priority,
        payment_status: data.paymentStatus,
        total_cents: totals.totalCents,
        assigned_staff_id: data.assignedStaffId || null,
      },
    });

    const newAssignee = actor.permissions.has("orders.assign")
      ? data.assignedStaffId || null
      : before.assigned_staff_id;
    if (newAssignee && newAssignee !== before.assigned_staff_id) {
      void notifyOrderAssigned({
        orderId,
        orderCode,
        assigneeId: newAssignee,
        actorId: actor.id,
        actorName: actor.fullName,
      });
    }
    if (data.status === "delivered" && before.status !== "delivered") {
      void notifyOrderDelivered({
        orderId,
        orderCode,
        actorId: actor.id,
        actorName: actor.fullName,
        assigneeId: newAssignee,
        creatorId: before.created_by,
      });
    }

    // Stock + CRM hooks react to whatever the edit changed (status and/or
    // payment status) — each is idempotent, so re-running is safe.
    await runOrderTransitionHooks(orderId, orderCode, data.status, data.paymentStatus, actor);

    return { ok: true, orderId, orderCode };
  } catch (e) {
    return fail(e);
  }
}

/** Change status with an optional comment → history + activity log. */
export async function updateOrderStatusAction(input: OrderStatusChangeInput): Promise<SimpleResult> {
  try {
    const actor = await requirePermission("orders.update_status");
    const parsed = orderStatusChangeSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { orderId, status, comment } = parsed.data;

    const config = await getOrderConfig();
    if (!config.statuses.some((s) => s.key === status)) {
      return { ok: false, error: `Unknown order status "${status}"` };
    }

    const before = await getOrderSnapshot(orderId);
    if (!before) return { ok: false, error: "Order not found." };
    if (before.status === status) return { ok: false, error: "The order already has that status." };

    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from("orders")
      .update(dbUpdate("orders", { status, updated_by: actor.id }))
      .eq("id", orderId);
    if (updateError) throw new Error(updateError.message);

    const { error: historyError } = await supabase.from("order_status_history").insert(
      dbInsert("order_status_history", {
        order_id: orderId,
        from_status: before.status,
        to_status: status,
        comment: comment || null,
        changed_by: actor.id,
      }),
    );
    if (historyError) throw new Error(historyError.message);

    void logActivity({
      actor,
      action: "order.status_change",
      module: "orders",
      targetType: "order",
      targetId: orderId,
      summary: `Order ${before.order_code}: ${before.status} → ${status}${comment ? ` (“${comment}”)` : ""}`,
      before: { status: before.status },
      after: { status, comment: comment || null },
    });

    if (status === "delivered") {
      void notifyOrderDelivered({
        orderId,
        orderCode: before.order_code,
        actorId: actor.id,
        actorName: actor.fullName,
        assigneeId: before.assigned_staff_id,
        creatorId: before.created_by,
      });
    }

    // Shipped/Delivered → sale movements · Returned → restock · Delivered+Paid → CRM.
    await runOrderTransitionHooks(orderId, before.order_code, status, before.payment_status, actor);

    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Soft delete (orders.delete — Admin). The row stays for history/analytics. */
export async function softDeleteOrderAction(orderId: string): Promise<SimpleResult> {
  try {
    const actor = await requirePermission("orders.delete");
    const before = await getOrderSnapshot(orderId);
    if (!before) return { ok: false, error: "Order not found." };
    if (!before.is_active) return { ok: false, error: "Order is already deleted." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("orders")
      .update(
        dbUpdate("orders", { is_active: false, deleted_at: new Date().toISOString(), updated_by: actor.id }),
      )
      .eq("id", orderId);
    if (error) throw new Error(error.message);

    void logActivity({
      actor,
      action: "order.delete",
      module: "orders",
      targetType: "order",
      targetId: orderId,
      summary: `Deleted order ${before.order_code}`,
      before: { status: before.status, total_cents: before.total_cents, is_active: true },
      after: { is_active: false },
    });

    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Restore a soft-deleted order (orders.delete — the inverse of soft delete). */
export async function restoreOrderAction(orderId: string): Promise<SimpleResult> {
  try {
    const actor = await requirePermission("orders.delete");
    const before = await getOrderSnapshot(orderId);
    if (!before) return { ok: false, error: "Order not found." };
    if (before.is_active) return { ok: false, error: "Order is not deleted." };

    const supabase = await createClient();
    const { error } = await supabase
      .from("orders")
      .update(dbUpdate("orders", { is_active: true, deleted_at: null, updated_by: actor.id }))
      .eq("id", orderId);
    if (error) throw new Error(error.message);

    void logActivity({
      actor,
      action: "order.restore",
      module: "orders",
      targetType: "order",
      targetId: orderId,
      summary: `Restored order ${before.order_code}`,
      before: { is_active: false },
      after: { is_active: true },
    });

    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

type BulkOrderRow = {
  id: string;
  order_code: string;
  is_active: boolean;
  assigned_staff_id: string | null;
};

/**
 * Bulk actions over a checkbox selection in the Orders list:
 *   delete → SOFT delete (orders.delete): is_active=false + deleted_at. The
 *            idempotency stamps (sale_movements_at / crm_applied_at) are left
 *            untouched, so stock/CRM effects are never re-run or reversed —
 *            same contract as the per-order delete.
 *   assign → set assigned_staff_id (orders.assign); null = unassign. The new
 *            assignee is notified per order, exactly like editing one order.
 * RLS scopes which rows the actor can touch; ids they can't see are skipped.
 * One activity-log row per affected order (mirrors the Users bulk pattern).
 */
export async function bulkOrderActionsAction(
  input: BulkOrderActionInput,
): Promise<{ ok: true; affected: number; skipped: string[] } | { ok: false; error: string }> {
  try {
    const parsed = bulkOrderActionSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { action, orderIds, assignedStaffId } = parsed.data;
    // Restore is the inverse of delete, so it shares the orders.delete gate.
    const actor = await requirePermission(action === "assign" ? "orders.assign" : "orders.delete");

    const supabase = await createClient();
    const { data: rowsRaw, error: readError } = await supabase
      .from("orders")
      .select("id, order_code, is_active, assigned_staff_id")
      .in("id", orderIds);
    if (readError) throw new Error(readError.message);

    const rows = asRows<BulkOrderRow>(rowsRaw);
    const visible = new Set(rows.map((r) => r.id));
    const skipped: string[] = [];
    for (const id of orderIds) if (!visible.has(id)) skipped.push("an order you can’t access");

    if (action === "delete") {
      for (const r of rows) if (!r.is_active) skipped.push(`${r.order_code} (already deleted)`);
      const targets = rows.filter((r) => r.is_active);
      if (targets.length > 0) {
        const { error } = await supabase
          .from("orders")
          .update(
            dbUpdate("orders", {
              is_active: false,
              deleted_at: new Date().toISOString(),
              updated_by: actor.id,
            }),
          )
          .in("id", targets.map((r) => r.id));
        if (error) throw new Error(error.message);
        for (const r of targets) {
          void logActivity({
            actor,
            action: "order.bulk_delete",
            module: "orders",
            targetType: "order",
            targetId: r.id,
            summary: `Bulk-deleted order ${r.order_code}`,
            before: { is_active: true },
            after: { is_active: false },
          });
        }
      }
      return { ok: true, affected: targets.length, skipped };
    }

    if (action === "restore") {
      for (const r of rows) if (r.is_active) skipped.push(`${r.order_code} (not deleted)`);
      const targets = rows.filter((r) => !r.is_active);
      if (targets.length > 0) {
        const { error } = await supabase
          .from("orders")
          .update(dbUpdate("orders", { is_active: true, deleted_at: null, updated_by: actor.id }))
          .in("id", targets.map((r) => r.id));
        if (error) throw new Error(error.message);
        for (const r of targets) {
          void logActivity({
            actor,
            action: "order.bulk_restore",
            module: "orders",
            targetType: "order",
            targetId: r.id,
            summary: `Restored order ${r.order_code}`,
            before: { is_active: false },
            after: { is_active: true },
          });
        }
      }
      return { ok: true, affected: targets.length, skipped };
    }

    // action === "assign"
    const newAssignee = assignedStaffId ?? null;
    if (newAssignee) {
      const { data: staffRaw } = await supabase
        .from("users")
        .select("id, is_active")
        .eq("id", newAssignee)
        .maybeSingle();
      const staff = asRow<{ id: string; is_active: boolean }>(staffRaw);
      if (!staff || !staff.is_active) {
        return { ok: false, error: "Pick an active staff member to assign." };
      }
    }
    if (rows.length > 0) {
      const { error } = await supabase
        .from("orders")
        .update(dbUpdate("orders", { assigned_staff_id: newAssignee, updated_by: actor.id }))
        .in("id", rows.map((r) => r.id));
      if (error) throw new Error(error.message);
      for (const r of rows) {
        void logActivity({
          actor,
          action: "order.bulk_assign",
          module: "orders",
          targetType: "order",
          targetId: r.id,
          summary: newAssignee
            ? `Bulk-assigned order ${r.order_code}`
            : `Bulk-unassigned order ${r.order_code}`,
          before: { assigned_staff_id: r.assigned_staff_id },
          after: { assigned_staff_id: newAssignee },
        });
        if (newAssignee && newAssignee !== r.assigned_staff_id) {
          void notifyOrderAssigned({
            orderId: r.id,
            orderCode: r.order_code,
            assigneeId: newAssignee,
            actorId: actor.id,
            actorName: actor.fullName,
          });
        }
      }
    }
    return { ok: true, affected: rows.length, skipped };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Signed URL (10 min) for one of an order's 3D model files. Same access rule
 * as receipts: the caller must be able to SEE the order under RLS, then the
 * admin client signs the private object.
 */
export async function getModelFileUrlAction(
  orderId: string,
  path: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    await requirePermission("orders.view");
    const supabase = await createClient();
    const { data } = await supabase
      .from("orders")
      .select("id, model_files")
      .eq("id", orderId)
      .maybeSingle();
    const order = asRow<{ id: string; model_files: { path: string }[] }>(data);
    if (!order) return { ok: false, error: "Order not found." };
    const files = Array.isArray(order.model_files) ? order.model_files : [];
    if (!files.some((f) => f.path === path)) {
      return { ok: false, error: "That file does not belong to this order." };
    }

    const admin = createAdminClient();
    const { data: signed, error } = await admin.storage.from("models").createSignedUrl(path, 600);
    if (error || !signed) return { ok: false, error: error?.message ?? "Could not sign the URL" };
    return { ok: true, url: signed.signedUrl };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Signed receipt URL (10 min). Access rule: the caller must be able to SEE the
 * order (RLS-scoped read above) — then the admin client signs the private
 * object regardless of who uploaded it.
 */
export async function getReceiptUrlAction(orderId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    await requirePermission("orders.view");
    const order = await getOrderSnapshot(orderId);
    if (!order) return { ok: false, error: "Order not found." };
    if (!order.receipt_url) return { ok: false, error: "This order has no receipt." };

    const admin = createAdminClient();
    const { data, error } = await admin.storage.from("receipts").createSignedUrl(order.receipt_url, 600);
    if (error || !data) return { ok: false, error: error?.message ?? "Could not sign the receipt URL" };
    return { ok: true, url: data.signedUrl };
  } catch (e) {
    return fail(e);
  }
}
