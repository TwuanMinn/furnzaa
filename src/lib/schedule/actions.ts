"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows, dbUpdate } from "@/lib/supabase/types";
import {
  ForbiddenError,
  UnauthorizedError,
  requirePermission,
} from "@/lib/rbac/guards";
import { logActivity } from "@/lib/activity/log";

/**
 * Production Schedule actions (spec v6, Module 3). The board DERIVES from the
 * orders print state machine — start/complete/fail/restart go through
 * lib/orders/print-actions and the sync_print_schedule trigger keeps the board
 * in the same transaction. The ONLY direct print_schedule writes are queue
 * reorders (queue_position lives nowhere else); authenticated has no write
 * grants on the table, so those go through the admin client AFTER the
 * permission check here.
 */

export type ScheduleActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof UnauthorizedError) return { ok: false, error: "You are not signed in." };
  if (e instanceof ForbiddenError)
    return { ok: false, error: "You don't have permission to do that." };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

type QueueRow = {
  order_id: string;
  printer_id: string | null;
  assigned_to: string | null;
  state: string;
  queue_position: number;
  orders: { order_code: string } | null;
};

/** Sparse-key step: fresh tails/repacks land 1024 apart so midpoints last. */
const STEP = 1024;

/**
 * Move a queued job between two neighbours in ITS printer's queue. Neighbour
 * order ids (not raw positions) so the math always runs on fresh DB state —
 * one UPDATE per reorder. When the midpoint gap collapses (< 1e-6 after ~50
 * halvings) the whole printer queue repacks once.
 */
export async function reorderQueueAction(
  orderId: string,
  beforeOrderId: string | null,
  afterOrderId: string | null,
): Promise<ScheduleActionResult> {
  try {
    const actor = await requirePermission("schedule.view");
    const ids = [orderId, beforeOrderId, afterOrderId].filter((v): v is string => v !== null);
    if (ids.some((v) => !z.string().uuid().safeParse(v).success))
      return { ok: false, error: "Invalid job reference" };

    const admin = createAdminClient();
    const { data: rowsRaw, error: loadError } = await admin
      .from("print_schedule")
      .select("order_id, printer_id, assigned_to, state, queue_position, orders(order_code)")
      .in("order_id", ids);
    if (loadError) return { ok: false, error: loadError.message };
    const rows = asRows<QueueRow>(rowsRaw);

    const job = rows.find((r) => r.order_id === orderId);
    if (!job) return { ok: false, error: "Job not found on the board" };
    if (job.state !== "queued") return { ok: false, error: "Only queued jobs can be reordered" };
    if (!actor.permissions.has("schedule.manage") && job.assigned_to !== actor.id)
      return { ok: false, error: "You can only reorder your own jobs" };

    const before = beforeOrderId ? rows.find((r) => r.order_id === beforeOrderId) : null;
    const after = afterOrderId ? rows.find((r) => r.order_id === afterOrderId) : null;
    for (const n of [before, after]) {
      if (n && (n.state !== "queued" || (n.printer_id ?? null) !== (job.printer_id ?? null)))
        return { ok: false, error: "The queue changed underneath you — try again" };
    }

    let position: number;
    if (before && after) position = (before.queue_position + after.queue_position) / 2;
    else if (after) position = after.queue_position - STEP; // dropped at the head
    else if (before) position = before.queue_position + STEP; // dropped at the tail
    else position = STEP;

    const collapsed =
      (before && Math.abs(position - before.queue_position) < 1e-6) ||
      (after && Math.abs(position - after.queue_position) < 1e-6);

    if (collapsed) {
      // Repack this printer's queue 1024 apart, slotting the job at its target.
      const { data: queueRaw, error: queueError } = await admin
        .from("print_schedule")
        .select("order_id, queue_position")
        .eq("state", "queued")
        .is("archived_at", null)
        .filter("printer_id", job.printer_id ? "eq" : "is", job.printer_id)
        .order("queue_position", { ascending: true });
      if (queueError) return { ok: false, error: queueError.message };
      const queue = asRows<{ order_id: string; queue_position: number }>(queueRaw)
        .filter((r) => r.order_id !== orderId)
        .map((r) => r.order_id);
      const at = after ? queue.indexOf(after.order_id) : queue.length;
      queue.splice(at === -1 ? queue.length : at, 0, orderId);
      for (let i = 0; i < queue.length; i++) {
        const { error } = await admin
          .from("print_schedule")
          .update(dbUpdate("print_schedule", { queue_position: (i + 1) * STEP, updated_by: actor.id }))
          .eq("order_id", queue[i] as string);
        if (error) return { ok: false, error: error.message };
      }
    } else {
      const { error } = await admin
        .from("print_schedule")
        .update(dbUpdate("print_schedule", { queue_position: position, updated_by: actor.id }))
        .eq("order_id", orderId)
        .eq("state", "queued");
      if (error) return { ok: false, error: error.message };
    }

    void logActivity({
      actor,
      action: "schedule.queue_reorder",
      module: "schedule",
      targetType: "order",
      targetId: orderId,
      summary: `Reordered ${job.orders?.order_code ?? "job"} in the print queue`,
      before: { queue_position: job.queue_position },
      after: { queue_position: collapsed ? "repacked" : position },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Assign a printer (and optionally an estimate) to an order — the tray→lane
 * drag and the cross-lane move. The ORDER row is the source of truth: updating
 * it makes sync_print_schedule queue the job in the same transaction.
 */
export async function assignPrinterAction(
  orderId: string,
  printerId: string | null,
  estimatedMinutes?: number | null,
): Promise<ScheduleActionResult> {
  try {
    const actor = await requirePermission("schedule.manage");
    if (!z.string().uuid().safeParse(orderId).success)
      return { ok: false, error: "Invalid order" };
    if (printerId !== null && !z.string().uuid().safeParse(printerId).success)
      return { ok: false, error: "Invalid printer" };
    if (estimatedMinutes != null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0))
      return { ok: false, error: "Estimate must be a positive number of minutes" };

    const supabase = await createClient();
    const { data: orderRaw, error: loadError } = await supabase
      .from("orders")
      .select("id, order_code, print_state, printer_id, estimated_print_minutes")
      .eq("id", orderId)
      .maybeSingle();
    if (loadError) return { ok: false, error: loadError.message };
    const order = asRow<{
      id: string;
      order_code: string;
      print_state: string;
      printer_id: string | null;
      estimated_print_minutes: number | null;
    }>(orderRaw);
    if (!order) return { ok: false, error: "Order not found" };
    if (order.print_state === "printing")
      return { ok: false, error: "Can't move a job while it is printing" };

    const patch: Record<string, unknown> = { printer_id: printerId, updated_by: actor.id };
    if (estimatedMinutes !== undefined) patch.estimated_print_minutes = estimatedMinutes;

    const { error } = await supabase
      .from("orders")
      .update(dbUpdate("orders", patch))
      .eq("id", orderId);
    if (error) return { ok: false, error: error.message };

    let printerLabel = "unassigned";
    if (printerId) {
      const { data: printerRaw } = await supabase
        .from("printers")
        .select("brand, model")
        .eq("id", printerId)
        .maybeSingle();
      const printer = asRow<{ brand: string; model: string }>(printerRaw);
      if (printer) printerLabel = `${printer.brand} ${printer.model}`;
    }

    void logActivity({
      actor,
      action: "schedule.assign_printer",
      module: "schedule",
      targetType: "order",
      targetId: orderId,
      summary: `Assigned ${order.order_code} to ${printerLabel}${
        estimatedMinutes ? ` (est. ${estimatedMinutes} min)` : ""
      }`,
      before: { printer_id: order.printer_id, estimated_print_minutes: order.estimated_print_minutes },
      after: { printer_id: printerId, estimated_print_minutes: estimatedMinutes ?? order.estimated_print_minutes },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
