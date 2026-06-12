import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows } from "@/lib/supabase/types";
import type { SessionUser } from "@/lib/rbac/guards";
import type { ListQuery } from "@/lib/datatable/types";
import type { ExportDataset } from "@/lib/export/types";
import { centsToDecimalString, formatDate } from "@/lib/format";

/**
 * Analytics (Module 10) — every figure is a rollup of the pg_cron-refreshed
 * matviews (0013/0021), NEVER a scan of orders/items. Reads go through the
 * service role AFTER the analytics.view permission check; staff without
 * analytics.view_team are pinned to assigned_staff_id = their own id — the
 * cube carries staff as a dimension precisely for this.
 */

export interface AnalyticsKpis {
  totalOrders: number;
  deliveredOrders: number;
  totalRevenueCents: number;
  avgOrderValueCents: number;
  ordersThisMonth: number;
  ordersLastMonth: number;
  // Company-wide extras (admin scope only):
  activeCustomers: number | null;
  inventoryValueCents: number | null;
  grossProfitCents: number | null;
  activeCampaigns: number | null;
  avgCustomerRating: number | null;
  feedbackResolvedPct: number | null;
}

export interface AnalyticsData {
  scope: "company" | "own";
  kpis: AnalyticsKpis;
  ordersOverTime: { day: string; orders: number; revenueCents: number }[];
  byStatus: { status: string; orders: number }[];
  byPriority: { priority: string; orders: number }[];
  printerUtilization: {
    brand: string; model: string; color: string; orders: number; printMinutes: number;
    /** Avg queued→started wait over the last 90 days of completed prints. */
    avgQueueWaitMinutes: number | null;
  }[];
  topStaff: { name: string; orders: number; revenueCents: number }[];
  topCustomers: { name: string; spendCents: number; orders: number; tier: string | null; tierColor: string | null }[];
  topProducts: { name: string; sku: string; revenueCents: number; units: number }[];
}

type CubeRow = {
  day: string;
  assigned_staff_id: string | null;
  status: string;
  priority: string;
  orders_count: number;
  paid_orders_count: number;
  revenue_cents: number | null;
  material_cost_cents: number | null;
  print_minutes: number | null;
};

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function fetchAnalytics(
  user: SessionUser,
  from: string | null,
  to: string | null,
): Promise<AnalyticsData> {
  const admin = createAdminClient();
  const companyWide = user.permissions.has("analytics.view_team");
  const scope: AnalyticsData["scope"] = companyWide ? "company" : "own";

  // ── Cube slice for the selected range (+ MoM months, fetched in one query) ─
  const now = new Date();
  const thisMonthStart = iso(monthStart(now));
  const lastMonthStart = iso(monthStart(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
  const lowerBound = [from, lastMonthStart].filter(Boolean).sort()[0] ?? lastMonthStart;

  let cubeQuery = admin
    .from("mv_orders_daily")
    .select(
      "day, assigned_staff_id, status, priority, orders_count, paid_orders_count, revenue_cents, material_cost_cents, print_minutes",
    )
    .gte("day", lowerBound);
  if (to) cubeQuery = cubeQuery.lte("day", to);
  if (!companyWide) cubeQuery = cubeQuery.eq("assigned_staff_id", user.id);
  const { data: cubeData, error: cubeError } = await cubeQuery.limit(50_000);
  if (cubeError) throw new Error(cubeError.message);
  const cube = asRows<CubeRow>(cubeData);

  const inRange = (r: CubeRow) => (!from || r.day >= from) && (!to || r.day <= to);

  // ── KPI rollups ─────────────────────────────────────────────────────────────
  let totalOrders = 0, deliveredOrders = 0, paidOrders = 0, revenue = 0;
  let ordersThisMonth = 0, ordersLastMonth = 0;
  const byDay = new Map<string, { orders: number; revenueCents: number }>();
  const byStatus = new Map<string, number>();
  const byPriority = new Map<string, number>();
  const byStaff = new Map<string, { orders: number; revenueCents: number }>();

  for (const r of cube) {
    if (r.day >= thisMonthStart) ordersThisMonth += r.orders_count;
    else if (r.day >= lastMonthStart && r.day < thisMonthStart) ordersLastMonth += r.orders_count;

    if (!inRange(r)) continue;
    totalOrders += r.orders_count;
    if (r.status === "delivered") deliveredOrders += r.orders_count;
    paidOrders += r.paid_orders_count;
    revenue += r.revenue_cents ?? 0;

    const d = byDay.get(r.day) ?? { orders: 0, revenueCents: 0 };
    d.orders += r.orders_count;
    d.revenueCents += r.revenue_cents ?? 0;
    byDay.set(r.day, d);
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + r.orders_count);
    byPriority.set(r.priority, (byPriority.get(r.priority) ?? 0) + r.orders_count);
    if (r.assigned_staff_id) {
      const s = byStaff.get(r.assigned_staff_id) ?? { orders: 0, revenueCents: 0 };
      s.orders += r.orders_count;
      s.revenueCents += r.revenue_cents ?? 0;
      byStaff.set(r.assigned_staff_id, s);
    }
  }

  // ── Company-wide widgets (admin scope) ──────────────────────────────────────
  let activeCustomers: number | null = null;
  let inventoryValueCents: number | null = null;
  let grossProfitCents: number | null = null;
  let activeCampaigns: number | null = null;
  let avgCustomerRating: number | null = null;
  let feedbackResolvedPct: number | null = null;
  let topCustomers: AnalyticsData["topCustomers"] = [];
  let topProducts: AnalyticsData["topProducts"] = [];
  let topStaff: AnalyticsData["topStaff"] = [];
  let printerUtilization: AnalyticsData["printerUtilization"] = [];

  // Printer utilization is shown in both scopes... the daily printer view has
  // no staff dimension, so staff scope derives theirs from nothing — show it
  // company-wide for admins only (spec lists it under the admin dashboard).
  if (companyWide) {
    let printerQuery = admin
      .from("mv_printer_daily")
      .select("printer_id, brand, model, badge_color, orders_count, print_minutes");
    if (from) printerQuery = printerQuery.gte("day", from);
    if (to) printerQuery = printerQuery.lte("day", to);
    const [printerRes, summaryRes, inventoryRes, revenueDailyRes, campaignsRes, topCustomersRes, topProductsRes, staffNamesRes, feedbackSummaryRes] =
      await Promise.all([
        printerQuery.limit(20_000),
        admin.from("mv_summary_stats").select("active_customers_90d").maybeSingle(),
        admin.from("mv_inventory_value").select("value_cost_cents").maybeSingle(),
        (() => {
          let q = admin.from("mv_revenue_daily").select("day, revenue_cents, cogs_cents");
          if (from) q = q.gte("day", from);
          if (to) q = q.lte("day", to);
          return q.limit(20_000);
        })(),
        admin
          .from("marketing_campaigns")
          .select("id", { count: "exact", head: true })
          .in("status", ["scheduled", "running"])
          .is("deleted_at", null),
        admin
          .from("mv_top_customers")
          .select("name, lifetime_spend_cents, order_count, tier_name, tier_color")
          .limit(8),
        admin
          .from("mv_product_profitability")
          .select("name, sku, revenue_cents, units_sold")
          .order("revenue_cents", { ascending: false })
          .limit(8),
        byStaff.size > 0
          ? admin.from("users").select("id, full_name").in("id", [...byStaff.keys()])
          : Promise.resolve({ data: [] }),
        // Feedback KPIs (Module 11): single-row matview, permission-gated.
        user.permissions.has("feedback.analytics_view")
          ? admin.from("mv_feedback_summary").select("avg_rating, total_feedback, resolved_count").maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

    // Queue wait: queued→started gap on completed prints, last 90 days only —
    // rides idx_schedule_started and stays bounded; a matview column can take
    // over if print history ever makes this hot.
    const { data: waitRaw } = await admin
      .from("print_schedule")
      .select("printer_id, scheduled_at, print_started_at")
      .eq("state", "completed")
      .not("printer_id", "is", null)
      .not("print_started_at", "is", null)
      .gte("print_started_at", new Date(Date.now() - 90 * 86_400_000).toISOString())
      .limit(5_000);
    const waitAgg = new Map<string, { totalMin: number; n: number }>();
    for (const w of asRows<{ printer_id: string; scheduled_at: string; print_started_at: string }>(waitRaw)) {
      const minutes =
        (new Date(w.print_started_at).getTime() - new Date(w.scheduled_at).getTime()) / 60_000;
      if (minutes < 0) continue;
      const cur = waitAgg.get(w.printer_id) ?? { totalMin: 0, n: 0 };
      cur.totalMin += minutes;
      cur.n += 1;
      waitAgg.set(w.printer_id, cur);
    }

    const printerAgg = new Map<string, AnalyticsData["printerUtilization"][number]>();
    for (const p of asRows<{ printer_id: string; brand: string; model: string; badge_color: string; orders_count: number; print_minutes: number }>(printerRes.data)) {
      const wait = waitAgg.get(p.printer_id);
      const cur = printerAgg.get(p.printer_id) ?? {
        brand: p.brand, model: p.model, color: p.badge_color, orders: 0, printMinutes: 0,
        avgQueueWaitMinutes: wait && wait.n > 0 ? Math.round(wait.totalMin / wait.n) : null,
      };
      cur.orders += p.orders_count;
      cur.printMinutes += p.print_minutes ?? 0;
      printerAgg.set(p.printer_id, cur);
    }
    printerUtilization = [...printerAgg.values()].sort((a, b) => b.printMinutes - a.printMinutes);

    activeCustomers = asRow<{ active_customers_90d: number }>(summaryRes.data)?.active_customers_90d ?? 0;
    inventoryValueCents = asRow<{ value_cost_cents: number }>(inventoryRes.data)?.value_cost_cents ?? 0;
    grossProfitCents = asRows<{ revenue_cents: number | null; cogs_cents: number | null }>(
      revenueDailyRes.data,
    ).reduce((s, r) => s + (r.revenue_cents ?? 0) - (r.cogs_cents ?? 0), 0);
    activeCampaigns = (campaignsRes as { count: number | null }).count ?? 0;

    const fb = asRow<{ avg_rating: number | null; total_feedback: number | null; resolved_count: number | null }>(
      (feedbackSummaryRes as { data: unknown }).data,
    );
    avgCustomerRating = fb?.avg_rating != null ? Number(fb.avg_rating) : null;
    const fbTotal = Number(fb?.total_feedback ?? 0);
    feedbackResolvedPct = fbTotal > 0 ? Math.round((Number(fb?.resolved_count ?? 0) / fbTotal) * 100) : null;

    topCustomers = asRows<{ name: string; lifetime_spend_cents: number; order_count: number; tier_name: string | null; tier_color: string | null }>(
      topCustomersRes.data,
    ).map((c) => ({
      name: c.name, spendCents: c.lifetime_spend_cents, orders: c.order_count,
      tier: c.tier_name, tierColor: c.tier_color,
    }));
    topProducts = asRows<{ name: string; sku: string; revenue_cents: number; units_sold: number }>(
      topProductsRes.data,
    ).map((p) => ({ name: p.name, sku: p.sku, revenueCents: p.revenue_cents, units: p.units_sold }));

    const names = new Map(
      asRows<{ id: string; full_name: string }>((staffNamesRes as { data: unknown }).data).map(
        (u) => [u.id, u.full_name],
      ),
    );
    topStaff = [...byStaff.entries()]
      .map(([id, s]) => ({ name: names.get(id) ?? "Unknown", ...s }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 8);
  }

  return {
    scope,
    kpis: {
      totalOrders,
      deliveredOrders,
      totalRevenueCents: revenue,
      avgOrderValueCents: paidOrders > 0 ? Math.round(revenue / paidOrders) : 0,
      ordersThisMonth,
      ordersLastMonth,
      activeCustomers,
      inventoryValueCents,
      grossProfitCents,
      activeCampaigns,
      avgCustomerRating,
      feedbackResolvedPct,
    },
    ordersOverTime: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, ...v })),
    byStatus: [...byStatus.entries()].map(([status, orders]) => ({ status, orders })),
    byPriority: [...byPriority.entries()].map(([priority, orders]) => ({ priority, orders })),
    printerUtilization,
    topStaff,
    topCustomers,
    topProducts,
  };
}

// ── Export (CSV/PDF via the shared service): KPI + breakdown rows ────────────
type AnalyticsExportRow = { section: string; label: string; value: string; extra: string };

async function fetchAnalyticsForExport(
  query: ListQuery,
  user: SessionUser,
  _limit: number,
): Promise<AnalyticsExportRow[]> {
  const from = query.filters?.["from"] ?? null;
  const to = query.filters?.["to"] ?? null;
  const d = await fetchAnalytics(user, from, to);
  const money = (c: number | null) => (c == null ? "" : centsToDecimalString(c, "VND"));

  const rows: AnalyticsExportRow[] = [
    { section: "KPI", label: "Total orders", value: String(d.kpis.totalOrders), extra: "" },
    { section: "KPI", label: "Delivered orders", value: String(d.kpis.deliveredOrders), extra: "" },
    { section: "KPI", label: "Total revenue (₫)", value: money(d.kpis.totalRevenueCents), extra: "" },
    { section: "KPI", label: "Avg order value (₫)", value: money(d.kpis.avgOrderValueCents), extra: "" },
    { section: "KPI", label: "Orders this month", value: String(d.kpis.ordersThisMonth), extra: `last month: ${d.kpis.ordersLastMonth}` },
  ];
  if (d.scope === "company") {
    rows.push(
      { section: "KPI", label: "Active customers (90d)", value: String(d.kpis.activeCustomers ?? 0), extra: "" },
      { section: "KPI", label: "Inventory value (₫)", value: money(d.kpis.inventoryValueCents), extra: "at cost" },
      { section: "KPI", label: "Gross profit (₫)", value: money(d.kpis.grossProfitCents), extra: "" },
      { section: "KPI", label: "Active campaigns", value: String(d.kpis.activeCampaigns ?? 0), extra: "" },
    );
  }
  for (const s of d.byStatus) rows.push({ section: "Orders by status", label: s.status, value: String(s.orders), extra: "" });
  for (const p of d.byPriority) rows.push({ section: "Orders by priority", label: p.priority, value: String(p.orders), extra: "" });
  for (const t of d.ordersOverTime) rows.push({ section: "Orders over time", label: formatDate(t.day), value: String(t.orders), extra: money(t.revenueCents) });
  for (const s of d.topStaff) rows.push({ section: "Top staff", label: s.name, value: String(s.orders), extra: money(s.revenueCents) });
  for (const c of d.topCustomers) rows.push({ section: "Top customers", label: c.name, value: money(c.spendCents), extra: `${c.orders} orders · ${c.tier ?? ""}` });
  for (const p of d.topProducts) rows.push({ section: "Top products", label: `${p.name} (${p.sku})`, value: money(p.revenueCents), extra: `${p.units} units` });
  for (const u of d.printerUtilization) rows.push({ section: "Printer utilization", label: `${u.brand} ${u.model}`, value: `${u.orders} orders`, extra: `${(u.printMinutes / 60).toFixed(1)}h printed` });
  return rows;
}

export const analyticsExportDataset: ExportDataset<AnalyticsExportRow> = {
  title: "Analytics",
  slug: "analytics",
  module: "analytics",
  permission: "analytics.export",
  columns: [
    { header: "Section", value: (r) => r.section, width: 1.3 },
    { header: "Metric", value: (r) => r.label, width: 2 },
    { header: "Value", value: (r) => r.value, align: "right", width: 1.2 },
    { header: "Detail", value: (r) => r.extra, width: 1.6 },
  ],
  fetchRows: fetchAnalyticsForExport,
};
