"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows, dbUpdate } from "@/lib/supabase/types";
import { requirePermission } from "@/lib/rbac/guards";
import { fail } from "@/lib/actions/result";
import { logActivity } from "@/lib/activity/log";
import { sendNotification } from "@/lib/notifications/service";

/**
 * Print tracking (spec v4, Module 2). A lightweight state machine that lives
 * ALONGSIDE the configurable order status list:
 *
 *   not_started ──start──▶ printing ──complete──▶ completed
 *                              │  ▲
 *                           fail│  │restart
 *                              ▼  │
 *                            failed
 *
 * "Start" stamps print_started_at (the live countdown runs to started +
 * estimated minutes; the cron runner notifies the assignee at zero via
 * claim_due_print_notifications). "Complete" auto-fills the actual printing
 * time from start→finish. Every transition is activity-logged.
 */

export type PrintActionResult =
  | { ok: true; printState: string; actualMinutes?: number }
  | { ok: false; error: string };

type PrintRow = {
  id: string;
  order_code: string;
  print_state: string;
  print_started_at: string | null;
  estimated_print_minutes: number | null;
  actual_print_minutes: number | null;
};

async function loadOrder(orderId: string): Promise<PrintRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, order_code, print_state, print_started_at, estimated_print_minutes, actual_print_minutes")
    .eq("id", orderId)
    .maybeSingle();
  return asRow<PrintRow>(data);
}

export async function startPrintAction(orderId: string): Promise<PrintActionResult> {
  try {
    const actor = await requirePermission("orders.update_status");
    if (!z.string().uuid().safeParse(orderId).success) return { ok: false, error: "Invalid order" };

    const order = await loadOrder(orderId);
    if (!order) return { ok: false, error: "Order not found" };
    if (order.print_state === "printing") return { ok: false, error: "Print already running" };
    if (order.print_state === "completed") return { ok: false, error: "Print already completed" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("orders")
      .update(dbUpdate("orders", {
        print_state: "printing",
        print_started_at: new Date().toISOString(),
        print_deadline_notified_at: null,   // re-arm the countdown notification
        updated_by: actor.id,
      }))
      .eq("id", orderId);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "order.print_start",
      module: "orders",
      targetType: "order",
      targetId: orderId,
      summary: `Started print for ${order.order_code}${order.estimated_print_minutes ? ` (est. ${order.estimated_print_minutes} min)` : ""}`,
      before: { print_state: order.print_state },
      after: { print_state: "printing" },
    });
    return { ok: true, printState: "printing" };
  } catch (e) {
    return fail(e);
  }
}

export async function completePrintAction(orderId: string): Promise<PrintActionResult> {
  try {
    const actor = await requirePermission("orders.update_status");
    if (!z.string().uuid().safeParse(orderId).success) return { ok: false, error: "Invalid order" };

    const order = await loadOrder(orderId);
    if (!order) return { ok: false, error: "Order not found" };
    if (order.print_state !== "printing") return { ok: false, error: "No print is running" };

    // Auto-fill actual printing time from start → now (minimum 1 minute).
    const startedAt = order.print_started_at ? new Date(order.print_started_at).getTime() : Date.now();
    const actualMinutes = Math.max(1, Math.round((Date.now() - startedAt) / 60_000));

    const supabase = await createClient();
    const { error } = await supabase
      .from("orders")
      .update(dbUpdate("orders", {
        print_state: "completed",
        actual_print_minutes: actualMinutes,
        updated_by: actor.id,
      }))
      .eq("id", orderId);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "order.print_complete",
      module: "orders",
      targetType: "order",
      targetId: orderId,
      summary: `Completed print for ${order.order_code} (actual ${actualMinutes} min)`,
      before: { print_state: "printing" },
      after: { print_state: "completed", actual_print_minutes: actualMinutes },
    });
    void notifyPrinterFreed(orderId);
    return { ok: true, printState: "completed", actualMinutes };
  } catch (e) {
    return fail(e);
  }
}

/**
 * "Printer freed — next job in queue ready" (spec v6, Module 3). Fires after a
 * completed print: the next queued job on the SAME printer (lowest
 * queue_position) notifies its assignee. Admin client — print_schedule has no
 * authenticated write/read-all grants and this must see the whole queue.
 */
async function notifyPrinterFreed(completedOrderId: string) {
  try {
    const admin = createAdminClient();
    const { data: doneRaw } = await admin
      .from("print_schedule")
      .select("printer_id")
      .eq("order_id", completedOrderId)
      .maybeSingle();
    const printerId = asRow<{ printer_id: string | null }>(doneRaw)?.printer_id;
    if (!printerId) return;

    const { data: nextRaw } = await admin
      .from("print_schedule")
      .select("order_id, assigned_to, orders(order_code), printers(brand, model)")
      .eq("printer_id", printerId)
      .eq("state", "queued")
      .is("archived_at", null)
      .order("queue_position", { ascending: true })
      .limit(1);
    const next = asRows<{
      order_id: string;
      assigned_to: string | null;
      orders: { order_code: string } | null;
      printers: { brand: string; model: string } | null;
    }>(nextRaw)[0];
    if (!next?.assigned_to) return;

    const printer = next.printers ? `${next.printers.brand} ${next.printers.model}` : "The printer";
    await sendNotification({
      type: "system",
      category: "printer_freed",
      title: `Printer freed — ${next.orders?.order_code ?? "your job"} is next`,
      body: `${printer} just finished its print. ${next.orders?.order_code ?? "Your job"} is first in its queue and ready to start.`,
      audience: { type: "users", userIds: [next.assigned_to] },
      linkUrl: "/schedule",
    });
  } catch (e) {
    console.error("[print] printer-freed notification failed:", e);
  }
}

export async function failPrintAction(orderId: string, reason?: string): Promise<PrintActionResult> {
  try {
    const actor = await requirePermission("orders.update_status");
    if (!z.string().uuid().safeParse(orderId).success) return { ok: false, error: "Invalid order" };
    const note = (reason ?? "").trim().slice(0, 500);

    const order = await loadOrder(orderId);
    if (!order) return { ok: false, error: "Order not found" };
    if (order.print_state !== "printing") return { ok: false, error: "No print is running" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("orders")
      .update(dbUpdate("orders", { print_state: "failed", updated_by: actor.id }))
      .eq("id", orderId);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "order.print_fail",
      module: "orders",
      targetType: "order",
      targetId: orderId,
      summary: `Print failed for ${order.order_code}${note ? ` — ${note}` : ""}`,
      before: { print_state: "printing" },
      after: { print_state: "failed", reason: note || null },
    });
    return { ok: true, printState: "failed" };
  } catch (e) {
    return fail(e);
  }
}

/** Restart a FAILED print: back to printing with a fresh countdown. */
export async function restartPrintAction(orderId: string): Promise<PrintActionResult> {
  try {
    const actor = await requirePermission("orders.update_status");
    if (!z.string().uuid().safeParse(orderId).success) return { ok: false, error: "Invalid order" };

    const order = await loadOrder(orderId);
    if (!order) return { ok: false, error: "Order not found" };
    if (order.print_state !== "failed") return { ok: false, error: "Only failed prints can be restarted" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("orders")
      .update(dbUpdate("orders", {
        print_state: "printing",
        print_started_at: new Date().toISOString(),
        print_deadline_notified_at: null,
        updated_by: actor.id,
      }))
      .eq("id", orderId);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "order.print_restart",
      module: "orders",
      targetType: "order",
      targetId: orderId,
      summary: `Restarted print for ${order.order_code}`,
      before: { print_state: "failed" },
      after: { print_state: "printing" },
    });
    return { ok: true, printState: "printing" };
  } catch (e) {
    return fail(e);
  }
}
