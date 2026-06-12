"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows, dbInsert, dbUpdate, rpcParams } from "@/lib/supabase/types";
import {
  ForbiddenError,
  UnauthorizedError,
  requirePermission,
} from "@/lib/rbac/guards";
import { logActivity } from "@/lib/activity/log";
import { notifyLowStock } from "@/lib/notifications/service";
import { getOrgSettings } from "@/lib/settings/config";
import {
  adjustStockSchema,
  bomLineSchema,
  categorySchema,
  productSchema,
  productionOrderSchema,
  purchaseOrderSchema,
  supplierSchema,
  type AdjustStockInput,
  type CategoryInput,
  type ProductInput,
  type ProductionOrderInput,
  type PurchaseOrderInput,
  type SupplierInput,
} from "./schemas";

export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof UnauthorizedError) return { ok: false, error: "You are not signed in." };
  if (e instanceof ForbiddenError) return { ok: false, error: "You don't have permission to do that." };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

/** After a stock-out, alert admins once when stock crosses to/below minimum. */
async function maybeLowStockAlert(productId: string, previousStock: number) {
  try {
    const admin = createAdminClient();
    const [{ data: product }, { data: org }] = await Promise.all([
      admin.from("products").select("name, current_stock, minimum_stock").eq("id", productId).maybeSingle(),
      admin.from("organization_settings").select("low_stock_alerts_enabled").eq("id", "org").maybeSingle(),
    ]);
    const p = asRow<{ name: string; current_stock: number; minimum_stock: number }>(product);
    const enabled = asRow<{ low_stock_alerts_enabled: boolean }>(org)?.low_stock_alerts_enabled ?? true;
    if (!p || !enabled) return;
    // Fire only on the crossing edge — not on every movement below minimum.
    if (p.current_stock <= p.minimum_stock && previousStock > p.minimum_stock) {
      void notifyLowStock({
        productId,
        productName: p.name,
        newStock: p.current_stock,
        minimumStock: p.minimum_stock,
      });
    }
  } catch (e) {
    console.error("[inventory] low-stock check failed:", e);
  }
}

// ════════════════════════════ Products ══════════════════════════════════════

export async function createProductAction(
  input: ProductInput,
): Promise<ActionResult<{ id: string; sku: string }>> {
  try {
    const actor = await requirePermission("products.create");
    const parsed = productSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;

    const supabase = await createClient();
    // SKU prefix is configured in Settings → Inventory (falls back to "SKU").
    const skuPrefix = (await getOrgSettings()).skuPrefix.trim() || "SKU";
    const { data: skuData, error: skuError } = await supabase.rpc(
      "next_document_number",
      rpcParams("next_document_number", { p_prefix: skuPrefix }),
    );
    if (skuError) return { ok: false, error: skuError.message };
    const sku = skuData as string;

    const { data, error } = await supabase
      .from("products")
      .insert(
        dbInsert("products", {
          sku,
          name: v.name,
          category_id: v.categoryId ?? null,
          barcode: v.barcode || null,
          description: v.description || null,
          image_url: v.imageUrl ?? null,
          cost_price_cents: v.costPriceCents,
          selling_price_cents: v.sellingPriceCents,
          labor_cost_cents: v.laborCostCents,
          packaging_cost_cents: v.packagingCostCents,
          overhead_cost_cents: v.overheadCostCents,
          minimum_stock: v.minimumStock,
          status: v.status,
          created_by: actor.id,
          updated_by: actor.id,
        }),
      )
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Failed to create product" };
    const id = (data as { id: string }).id;

    void logActivity({
      actor,
      action: "product.create",
      module: "products",
      targetType: "product",
      targetId: id,
      summary: `Created product “${v.name}” (${sku})`,
      after: { name: v.name, sku, selling_price_cents: v.sellingPriceCents },
    });
    return { ok: true, data: { id, sku } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateProductAction(
  productId: string,
  input: ProductInput,
): Promise<ActionResult> {
  try {
    const actor = await requirePermission("products.edit");
    if (!z.string().uuid().safeParse(productId).success) return { ok: false, error: "Invalid product" };
    const parsed = productSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;

    const supabase = await createClient();
    const { data: beforeData } = await supabase
      .from("products")
      .select("name, sku, selling_price_cents, cost_price_cents, status, minimum_stock")
      .eq("id", productId)
      .maybeSingle();
    const before = asRow<Record<string, unknown>>(beforeData);
    if (!before) return { ok: false, error: "Product not found" };

    const { error } = await supabase
      .from("products")
      .update(
        dbUpdate("products", {
          name: v.name,
          category_id: v.categoryId ?? null,
          barcode: v.barcode || null,
          description: v.description || null,
          image_url: v.imageUrl ?? null,
          cost_price_cents: v.costPriceCents,
          selling_price_cents: v.sellingPriceCents,
          labor_cost_cents: v.laborCostCents,
          packaging_cost_cents: v.packagingCostCents,
          overhead_cost_cents: v.overheadCostCents,
          minimum_stock: v.minimumStock,
          status: v.status,
          updated_by: actor.id,
        }),
      )
      .eq("id", productId);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "product.update",
      module: "products",
      targetType: "product",
      targetId: productId,
      summary: `Updated product “${v.name}”`,
      before,
      after: { name: v.name, selling_price_cents: v.sellingPriceCents, status: v.status },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function softDeleteProductAction(productId: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("products.delete");
    if (!z.string().uuid().safeParse(productId).success) return { ok: false, error: "Invalid product" };

    const supabase = await createClient();
    const { data: prodData } = await supabase
      .from("products").select("name, sku").eq("id", productId).maybeSingle();
    const prod = asRow<{ name: string; sku: string }>(prodData);
    if (!prod) return { ok: false, error: "Product not found" };

    const { error } = await supabase
      .from("products")
      .update(dbUpdate("products", {
        is_active: false,
        deleted_at: new Date().toISOString(),
        status: "discontinued",
        updated_by: actor.id,
      }))
      .eq("id", productId);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "product.delete",
      module: "products",
      targetType: "product",
      targetId: productId,
      summary: `Deleted (soft) product “${prod.name}” (${prod.sku})`,
      before: prod,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function createCategoryAction(
  input: CategoryInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requirePermission("products.create");
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("product_categories")
      .insert(dbInsert("product_categories", {
        name: parsed.data.name,
        description: parsed.data.description || null,
      }))
      .select("id")
      .single();
    if (error || !data) {
      const msg = /duplicate|unique/i.test(error?.message ?? "")
        ? `A category named “${parsed.data.name}” already exists`
        : (error?.message ?? "Failed to create category");
      return { ok: false, error: msg };
    }
    const id = (data as { id: string }).id;

    void logActivity({
      actor,
      action: "category.create",
      module: "products",
      targetType: "product_category",
      targetId: id,
      summary: `Created category “${parsed.data.name}”`,
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

// ════════════════════════════ Inventory ═════════════════════════════════════

/** Manual stock adjustment — goes through the atomic ledger RPC, never direct. */
export async function adjustStockAction(
  input: AdjustStockInput,
): Promise<ActionResult<{ newStock: number }>> {
  try {
    const actor = await requirePermission("inventory.adjust");
    const parsed = adjustStockSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;

    const supabase = await createClient();
    const { data: beforeData } = await supabase
      .from("products").select("name, current_stock").eq("id", v.productId).maybeSingle();
    const before = asRow<{ name: string; current_stock: number }>(beforeData);
    if (!before) return { ok: false, error: "Product not found" };

    const { error } = await supabase.rpc(
      "apply_inventory_movement",
      rpcParams("apply_inventory_movement", {
        p_product_id: v.productId,
        p_movement_type: v.movementType,
        p_quantity: v.quantity,
        p_warehouse_id: v.warehouseId ?? undefined,
        p_notes: v.notes || undefined,
      }),
    );
    if (error) return { ok: false, error: error.message };

    const newStock = before.current_stock + v.quantity;
    void logActivity({
      actor,
      action: "inventory.adjust",
      module: "inventory",
      targetType: "product",
      targetId: v.productId,
      summary: `${v.movementType === "purchase" ? "Stock in" : v.movementType === "return" ? "Return" : "Adjustment"}: ${v.quantity > 0 ? "+" : ""}${v.quantity} × “${before.name}” (${before.current_stock} → ${newStock})`,
      before: { current_stock: before.current_stock },
      after: { current_stock: newStock, movement_type: v.movementType, notes: v.notes || null },
    });

    if (v.quantity < 0) await maybeLowStockAlert(v.productId, before.current_stock);
    return { ok: true, data: { newStock } };
  } catch (e) {
    return fail(e);
  }
}

// ════════════════════════════ Suppliers ═════════════════════════════════════

export async function createSupplierAction(
  input: SupplierInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requirePermission("suppliers.view"); // staff may add suppliers while purchasing
    const parsed = supplierSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("suppliers")
      .insert(dbInsert("suppliers", {
        company_name: v.companyName,
        contact_name: v.contactName || null,
        email: v.email || null,
        phone: v.phone || null,
        address: v.address || null,
        notes: v.notes || null,
      }))
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Failed to create supplier" };
    const id = (data as { id: string }).id;

    void logActivity({
      actor,
      action: "supplier.create",
      module: "inventory",
      targetType: "supplier",
      targetId: id,
      summary: `Created supplier “${v.companyName}”`,
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateSupplierAction(
  supplierId: string,
  input: SupplierInput,
): Promise<ActionResult> {
  try {
    const actor = await requirePermission("suppliers.manage");
    if (!z.string().uuid().safeParse(supplierId).success) return { ok: false, error: "Invalid supplier" };
    const parsed = supplierSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;

    const supabase = await createClient();
    const { error } = await supabase
      .from("suppliers")
      .update(dbUpdate("suppliers", {
        company_name: v.companyName,
        contact_name: v.contactName || null,
        email: v.email || null,
        phone: v.phone || null,
        address: v.address || null,
        notes: v.notes || null,
      }))
      .eq("id", supplierId);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "supplier.update",
      module: "inventory",
      targetType: "supplier",
      targetId: supplierId,
      summary: `Updated supplier “${v.companyName}”`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ════════════════════════ Purchase orders ═══════════════════════════════════

export async function createPurchaseOrderAction(
  input: PurchaseOrderInput,
): Promise<ActionResult<{ id: string; poNumber: string }>> {
  try {
    const actor = await requirePermission("purchase_orders.create");
    const parsed = purchaseOrderSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;

    const supabase = await createClient();
    const { data: poNumData, error: poNumError } = await supabase.rpc(
      "next_document_number",
      rpcParams("next_document_number", { p_prefix: "PO" }),
    );
    if (poNumError) return { ok: false, error: poNumError.message };
    const poNumber = poNumData as string;

    const total = v.items.reduce((s, it) => s + it.quantity * it.unitCostCents, 0);
    const { data, error } = await supabase
      .from("purchase_orders")
      .insert(dbInsert("purchase_orders", {
        po_number: poNumber,
        supplier_id: v.supplierId,
        order_date: v.orderDate,
        expected_date: v.expectedDate ?? null,
        status: "ordered",
        total_cost_cents: total,
        notes: v.notes || null,
        created_by: actor.id,
      }))
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Failed to create purchase order" };
    const id = (data as { id: string }).id;

    const { error: itemsError } = await supabase.from("purchase_order_items").insert(
      dbInsert(
        "purchase_order_items",
        v.items.map((it, idx) => ({
          purchase_order_id: id,
          product_id: it.productId,
          quantity: it.quantity,
          unit_cost_cents: it.unitCostCents,
          line_total_cents: it.quantity * it.unitCostCents,
          sort_order: idx,
        })),
      ),
    );
    if (itemsError) return { ok: false, error: itemsError.message };

    void logActivity({
      actor,
      action: "purchase_order.create",
      module: "inventory",
      targetType: "purchase_order",
      targetId: id,
      summary: `Created purchase order ${poNumber} (${v.items.length} line(s))`,
      after: { po_number: poNumber, total_cost_cents: total },
    });
    return { ok: true, data: { id, poNumber } };
  } catch (e) {
    return fail(e);
  }
}

/** Receive a PO: atomic stock-in for every line via the SQL RPC. */
export async function receivePurchaseOrderAction(
  purchaseOrderId: string,
): Promise<ActionResult<{ lines: number }>> {
  try {
    const actor = await requirePermission("purchase_orders.receive");
    if (!z.string().uuid().safeParse(purchaseOrderId).success) return { ok: false, error: "Invalid PO" };

    const supabase = await createClient();
    const { data: poData } = await supabase
      .from("purchase_orders").select("po_number, status").eq("id", purchaseOrderId).maybeSingle();
    const po = asRow<{ po_number: string; status: string }>(poData);
    if (!po) return { ok: false, error: "Purchase order not found" };

    const { data, error } = await supabase.rpc(
      "receive_purchase_order",
      rpcParams("receive_purchase_order", { p_po_id: purchaseOrderId }),
    );
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "purchase_order.receive",
      module: "inventory",
      targetType: "purchase_order",
      targetId: purchaseOrderId,
      summary: `Received purchase order ${po.po_number} (${Number(data ?? 0)} line(s) → stock)`,
      before: { status: po.status },
      after: { status: "received" },
    });
    return { ok: true, data: { lines: Number(data ?? 0) } };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelPurchaseOrderAction(purchaseOrderId: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("purchase_orders.create");
    if (!z.string().uuid().safeParse(purchaseOrderId).success) return { ok: false, error: "Invalid PO" };

    const supabase = await createClient();
    const { data: poData } = await supabase
      .from("purchase_orders").select("po_number, status").eq("id", purchaseOrderId).maybeSingle();
    const po = asRow<{ po_number: string; status: string }>(poData);
    if (!po) return { ok: false, error: "Purchase order not found" };
    if (po.status === "received") return { ok: false, error: "Received POs cannot be cancelled" };

    const { error } = await supabase
      .from("purchase_orders")
      .update(dbUpdate("purchase_orders", { status: "cancelled" }))
      .eq("id", purchaseOrderId);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "purchase_order.cancel",
      module: "inventory",
      targetType: "purchase_order",
      targetId: purchaseOrderId,
      summary: `Cancelled purchase order ${po.po_number}`,
      before: { status: po.status },
      after: { status: "cancelled" },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ════════════════════════ Production + BOM ══════════════════════════════════

export async function createProductionOrderAction(
  input: ProductionOrderInput,
): Promise<ActionResult<{ id: string; code: string }>> {
  try {
    const actor = await requirePermission("production.manage");
    const parsed = productionOrderSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;

    const supabase = await createClient();
    // A production order is meaningless without a BOM to consume.
    const { data: bomRows } = await supabase
      .from("bill_of_materials").select("id").eq("finished_product_id", v.productId).limit(1);
    if (asRows(bomRows).length === 0) {
      return { ok: false, error: "This product has no bill of materials yet — define its components first." };
    }

    const { data: codeData, error: codeError } = await supabase.rpc(
      "next_document_number",
      rpcParams("next_document_number", { p_prefix: "PRD" }),
    );
    if (codeError) return { ok: false, error: codeError.message };
    const code = codeData as string;

    const { data, error } = await supabase
      .from("production_orders")
      .insert(dbInsert("production_orders", {
        code,
        product_id: v.productId,
        quantity: v.quantity,
        status: "in_progress",
        labor_cost_cents: v.laborCostCents,
        packaging_cost_cents: v.packagingCostCents,
        overhead_cost_cents: v.overheadCostCents,
        notes: v.notes || null,
        created_by: actor.id,
        started_at: new Date().toISOString(),
      }))
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Failed to create production order" };
    const id = (data as { id: string }).id;

    void logActivity({
      actor,
      action: "production_order.create",
      module: "inventory",
      targetType: "production_order",
      targetId: id,
      summary: `Started production order ${code} (${v.quantity} unit(s))`,
    });
    return { ok: true, data: { id, code } };
  } catch (e) {
    return fail(e);
  }
}

/** Complete production: consume BOM components, produce finished goods. */
export async function completeProductionOrderAction(
  productionOrderId: string,
): Promise<ActionResult<{ totalCostCents: number }>> {
  try {
    const actor = await requirePermission("production.manage");
    if (!z.string().uuid().safeParse(productionOrderId).success) {
      return { ok: false, error: "Invalid production order" };
    }

    const supabase = await createClient();
    const { data: poData } = await supabase
      .from("production_orders").select("code, status").eq("id", productionOrderId).maybeSingle();
    const po = asRow<{ code: string; status: string }>(poData);
    if (!po) return { ok: false, error: "Production order not found" };

    const { data, error } = await supabase.rpc(
      "complete_production_order",
      rpcParams("complete_production_order", { p_id: productionOrderId }),
    );
    if (error) return { ok: false, error: error.message };
    const totalCostCents = Number(data ?? 0);

    void logActivity({
      actor,
      action: "production_order.complete",
      module: "inventory",
      targetType: "production_order",
      targetId: productionOrderId,
      summary: `Completed production order ${po.code} (total cost ${(totalCostCents / 100).toFixed(2)})`,
      before: { status: po.status },
      after: { status: "completed", total_cost_cents: totalCostCents },
    });
    return { ok: true, data: { totalCostCents } };
  } catch (e) {
    return fail(e);
  }
}

/** Replace the BOM lines for a finished product. */
export async function setBomAction(
  finishedProductId: string,
  lines: Array<{ componentProductId: string; quantityPerUnit: number }>,
): Promise<ActionResult> {
  try {
    const actor = await requirePermission("production.manage");
    if (!z.string().uuid().safeParse(finishedProductId).success) {
      return { ok: false, error: "Invalid product" };
    }
    const parsedLines = lines.map((l) =>
      bomLineSchema.safeParse({ ...l, finishedProductId }),
    );
    const bad = parsedLines.find((p) => !p.success);
    if (bad && !bad.success) return { ok: false, error: bad.error.issues[0]?.message ?? "Invalid BOM line" };

    const admin = createAdminClient(); // delete+insert as one logical replace
    const { error: delError } = await admin
      .from("bill_of_materials").delete().eq("finished_product_id", finishedProductId);
    if (delError) return { ok: false, error: delError.message };

    if (lines.length > 0) {
      const { error: insError } = await admin.from("bill_of_materials").insert(
        dbInsert(
          "bill_of_materials",
          lines.map((l) => ({
            finished_product_id: finishedProductId,
            component_product_id: l.componentProductId,
            quantity_per_unit: l.quantityPerUnit,
          })),
        ),
      );
      if (insError) return { ok: false, error: insError.message };
    }

    void logActivity({
      actor,
      action: "bom.update",
      module: "inventory",
      targetType: "product",
      targetId: finishedProductId,
      summary: `Updated bill of materials (${lines.length} component(s))`,
      after: { components: lines.length },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
