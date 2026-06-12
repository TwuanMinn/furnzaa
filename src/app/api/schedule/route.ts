import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRows } from "@/lib/supabase/types";

/**
 * GET /api/schedule — the Production Schedule board (spec v6, Module 3).
 *
 * Loads ONLY active (archived_at IS NULL) entries, per-column limited with
 * load-more, plus the per-printer capacity header and the unassigned tray.
 * Reads go through the admin client ON PURPOSE: holders of schedule.view see
 * the whole board (staff get a read-only "view all" toggle) while orders RLS
 * would scope their embeds to own/assigned rows. Writes stay locked down —
 * authenticated has no print_schedule write grants at all.
 */

type CardRaw = {
  order_id: string;
  printer_id: string | null;
  assigned_to: string | null;
  state: "queued" | "printing" | "completed" | "failed";
  queue_position: number;
  scheduled_at: string;
  print_started_at: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  completed_at: string | null;
  updated_at: string;
  orders: {
    order_code: string;
    priority: string;
    material_type: string | null;
    customers: { name: string } | null;
    order_items: { name: string; products: { image_url: string | null } | null }[];
  } | null;
  printers: { brand: string; model: string; badge_color: string } | null;
  assignee: { full_name: string; avatar_url: string | null } | null;
};

export interface ScheduleCard {
  orderId: string;
  orderCode: string;
  customerName: string | null;
  productName: string | null;
  productImage: string | null;
  priority: string;
  material: string | null;
  printerId: string | null;
  printerLabel: string | null;
  printerColor: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  state: CardRaw["state"];
  queuePosition: number;
  scheduledAt: string;
  printStartedAt: string | null;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  completedAt: string | null;
}

const CARD_SELECT =
  `order_id, printer_id, assigned_to, state, queue_position, scheduled_at,
   print_started_at, estimated_minutes, actual_minutes, completed_at, updated_at,
   orders!inner(order_code, priority, material_type, customers(name),
     order_items(name, products(image_url))),
   printers(brand, model, badge_color),
   assignee:users!print_schedule_assigned_to_fkey(full_name, avatar_url)`;

function toCard(r: CardRaw): ScheduleCard {
  const firstItem = r.orders?.order_items?.[0] ?? null;
  return {
    orderId: r.order_id,
    orderCode: r.orders?.order_code ?? "—",
    customerName: r.orders?.customers?.name ?? null,
    productName: firstItem?.name ?? null,
    productImage:
      r.orders?.order_items?.find((i) => i.products?.image_url)?.products?.image_url ?? null,
    priority: r.orders?.priority ?? "medium",
    material: r.orders?.material_type ?? null,
    printerId: r.printer_id,
    printerLabel: r.printers ? `${r.printers.brand} ${r.printers.model}` : null,
    printerColor: r.printers?.badge_color ?? null,
    assignedTo: r.assigned_to,
    assigneeName: r.assignee?.full_name ?? null,
    assigneeAvatar: r.assignee?.avatar_url ?? null,
    state: r.state,
    queuePosition: r.queue_position,
    scheduledAt: r.scheduled_at,
    printStartedAt: r.print_started_at,
    estimatedMinutes: r.estimated_minutes,
    actualMinutes: r.actual_minutes,
    completedAt: r.completed_at,
  };
}

function clampLimit(v: string | null, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 200) : fallback;
}

export const GET = withPermission("schedule.view", async (req) => {
  const url = new URL(req.url);
  const printer = url.searchParams.get("printer");
  const staff = url.searchParams.get("staff");
  const priority = url.searchParams.get("priority");
  const material = url.searchParams.get("material");
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const qLimit = clampLimit(url.searchParams.get("qLimit"), 30);
  const cLimit = clampLimit(url.searchParams.get("cLimit"), 20);
  const fLimit = clampLimit(url.searchParams.get("fLimit"), 20);

  const admin = createAdminClient();

  function baseQuery() {
    let query = admin.from("print_schedule").select(CARD_SELECT).is("archived_at", null);
    if (printer === "none") query = query.is("printer_id", null);
    else if (printer) query = query.eq("printer_id", printer);
    if (staff) query = query.eq("assigned_to", staff);
    if (priority) query = query.eq("orders.priority", priority);
    if (material) query = query.eq("orders.material_type", material);
    return query;
  }

  // Keyword search matches code / product / customer AFTER the fetch — the
  // active board is small by design (completed cards auto-archive), so the
  // bumped fetch window stays cheap and the filtering exact.
  const searchFactor = q ? 4 : 1;

  try {
    const [queuedRes, printingRes, completedRes, failedRes] = await Promise.all([
      baseQuery()
        .eq("state", "queued")
        .order("queue_position", { ascending: true })
        .limit(qLimit * searchFactor),
      baseQuery().eq("state", "printing").order("print_started_at", { ascending: true }).limit(60),
      baseQuery()
        .eq("state", "completed")
        .order("completed_at", { ascending: false })
        .limit(cLimit * searchFactor),
      baseQuery()
        .eq("state", "failed")
        .order("updated_at", { ascending: false })
        .limit(fLimit * searchFactor),
    ]);
    for (const res of [queuedRes, printingRes, completedRes, failedRes]) {
      if (res.error) return jsonError(res.error.message, 500);
    }

    const matches = (c: ScheduleCard) =>
      !q ||
      c.orderCode.toLowerCase().includes(q) ||
      (c.productName ?? "").toLowerCase().includes(q) ||
      (c.customerName ?? "").toLowerCase().includes(q);

    const queuedAll = asRows<CardRaw>(queuedRes.data).map(toCard).filter(matches);
    const completedAll = asRows<CardRaw>(completedRes.data).map(toCard).filter(matches);
    const failedAll = asRows<CardRaw>(failedRes.data).map(toCard).filter(matches);

    const columns = {
      queued: queuedAll.slice(0, qLimit),
      printing: asRows<CardRaw>(printingRes.data).map(toCard).filter(matches),
      completed: completedAll.slice(0, cLimit),
      failed: failedAll.slice(0, fLimit),
    };
    const hasMore = {
      queued: queuedAll.length > qLimit,
      completed: completedAll.length > cLimit,
      failed: failedAll.length > fLimit,
    };

    // ── Capacity header: small indexed aggregates over the ACTIVE queue ──────
    const [printersRes, queueAggRes, printingAggRes, trayRes] = await Promise.all([
      admin
        .from("printers")
        .select("id, brand, model, badge_color")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("brand")
        .order("model")
        .limit(100),
      admin
        .from("print_schedule")
        .select("printer_id, estimated_minutes")
        .eq("state", "queued")
        .is("archived_at", null)
        .limit(1000),
      admin
        .from("print_schedule")
        .select("printer_id, print_started_at, estimated_minutes")
        .eq("state", "printing")
        .is("archived_at", null)
        .limit(200),
      // Unassigned tray: print-ready orders (estimate set) with no printer yet.
      admin
        .from("orders")
        .select("id, order_code, priority, estimated_print_minutes, material_type, customers(name)")
        .eq("print_state", "not_started")
        .is("printer_id", null)
        .eq("is_active", true)
        .not("estimated_print_minutes", "is", null)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    for (const res of [printersRes, queueAggRes, printingAggRes, trayRes]) {
      if (res.error) return jsonError(res.error.message, 500);
    }

    const now = Date.now();
    const queuedByPrinter = new Map<string, { jobs: number; minutes: number }>();
    for (const r of asRows<{ printer_id: string | null; estimated_minutes: number | null }>(
      queueAggRes.data,
    )) {
      const key = r.printer_id ?? "none";
      const agg = queuedByPrinter.get(key) ?? { jobs: 0, minutes: 0 };
      agg.jobs += 1;
      agg.minutes += r.estimated_minutes ?? 0;
      queuedByPrinter.set(key, agg);
    }
    const printingByPrinter = new Map<string, number>();
    for (const r of asRows<{
      printer_id: string | null;
      print_started_at: string | null;
      estimated_minutes: number | null;
    }>(printingAggRes.data)) {
      if (!r.printer_id) continue;
      const elapsedMin = r.print_started_at ? (now - new Date(r.print_started_at).getTime()) / 60_000 : 0;
      const remaining = Math.max(0, (r.estimated_minutes ?? 0) - elapsedMin);
      printingByPrinter.set(r.printer_id, (printingByPrinter.get(r.printer_id) ?? 0) + remaining);
    }

    const capacity = asRows<{ id: string; brand: string; model: string; badge_color: string }>(
      printersRes.data,
    ).map((p) => {
      const queued = queuedByPrinter.get(p.id) ?? { jobs: 0, minutes: 0 };
      const printingRemaining = Math.round(printingByPrinter.get(p.id) ?? 0);
      const backlogMinutes = queued.minutes + printingRemaining;
      return {
        printerId: p.id,
        label: `${p.brand} ${p.model}`,
        color: p.badge_color,
        queuedJobs: queued.jobs,
        queuedMinutes: queued.minutes,
        printingRemainingMinutes: printingRemaining,
        busy: printingByPrinter.has(p.id),
        freeBy: new Date(now + backlogMinutes * 60_000).toISOString(),
      };
    });

    const tray = asRows<{
      id: string;
      order_code: string;
      priority: string;
      estimated_print_minutes: number | null;
      material_type: string | null;
      customers: { name: string } | null;
    }>(trayRes.data).map((o) => ({
      orderId: o.id,
      orderCode: o.order_code,
      priority: o.priority,
      estimatedMinutes: o.estimated_print_minutes,
      material: o.material_type,
      customerName: o.customers?.name ?? null,
    }));

    return jsonOk({ columns, hasMore, capacity, tray, serverNow: new Date(now).toISOString() });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load the schedule", 500);
  }
});
