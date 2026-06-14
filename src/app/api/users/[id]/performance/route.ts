import { withAuth } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows } from "@/lib/supabase/types";
import { getOrgSettings } from "@/lib/settings/config";

/**
 * GET /api/users/[id]/performance — the user-detail Performance tab.
 * Access mirrors the heatmap: Admin (users.view) sees anyone, staff only
 * themselves. Every figure comes from the cached layer — the per-staff orders
 * cube (mv_orders_daily), the order-scale print_schedule via its assignee
 * index, the feedback resolver matview and the incremental activity rollup —
 * NEVER live scans over the raw orders table.
 */

export interface UserPerformance {
  currency: string;
  orders: {
    total: number;
    delivered: number;
    revenueCents: number;
    printMinutes: number;
    thisMonth: number;
    lastMonth: number;
    monthly: { month: string; orders: number; revenueCents: number }[];
  };
  prints: {
    completed: number;
    failed: number;
    successRatePct: number | null;
    /** estimated ÷ actual × 100 on completed prints — >100 beats the estimate. */
    efficiencyPct: number | null;
  };
  feedback: { resolved: number; medianResolutionHours: number | null };
  tasks: { total: number; completed: number };
  activity30d: { logins: number; actions: number; activeDays: number };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withAuth(async (_req, ctx) => {
  const params = await ctx.params;
  const id = params?.id;
  if (!id || !UUID_RE.test(id)) return jsonError("Invalid user id", 400);

  const { user } = ctx;
  if (id !== user.id && !user.permissions.has("users.view")) {
    return jsonError("You can only view your own performance", 403, "forbidden");
  }

  const admin = createAdminClient();
  const monthsBack = 6;
  // LOCAL-date month keys throughout — toISOString() would shift "Jun 1 00:00"
  // in UTC+7 back to May 31 and put every bucket off by one.
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const seriesStart = new Date();
  seriesStart.setDate(1);
  seriesStart.setMonth(seriesStart.getMonth() - (monthsBack - 1));
  const seriesStartIso = `${monthKey(seriesStart)}-01`;

  try {
    const [settings, ordersRes, printsRes, feedbackRes, tasksRes, activityRes] = await Promise.all([
      getOrgSettings(),
      admin
        .from("mv_orders_daily")
        .select("day, status, orders_count, revenue_cents, print_minutes")
        .eq("assigned_staff_id", id)
        .limit(20_000),
      admin
        .from("print_schedule")
        .select("state, estimated_minutes, actual_minutes")
        .eq("assigned_to", id)
        .in("state", ["completed", "failed"])
        .limit(5_000),
      admin
        .from("mv_feedback_staff")
        .select("resolved_count, median_resolution_hours")
        .eq("resolved_by", id)
        .maybeSingle(),
      admin
        .from("staff_tasks")
        .select("done")
        .eq("assigned_to", id)
        .eq("is_active", true)
        .limit(2_000),
      admin
        .from("user_activity_daily")
        .select("day, logins, actions")
        .eq("user_id", id)
        .gte("day", new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
        .limit(40),
    ]);
    for (const res of [ordersRes, printsRes, tasksRes, activityRes]) {
      if (res.error) return jsonError(res.error.message, 500);
    }

    // ── Orders (per-staff cube) ──────────────────────────────────────────────
    const now = new Date();
    const thisMonthKey = monthKey(now);
    const lastMonthDate = new Date(now);
    lastMonthDate.setDate(1);
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonthKey = monthKey(lastMonthDate);

    let total = 0;
    let delivered = 0;
    let revenueCents = 0;
    let printMinutes = 0;
    let thisMonth = 0;
    let lastMonth = 0;
    const byMonth = new Map<string, { orders: number; revenueCents: number }>();
    for (const r of asRows<{
      day: string;
      status: string;
      orders_count: number;
      revenue_cents: number | null;
      print_minutes: number | null;
    }>(ordersRes.data)) {
      total += r.orders_count;
      if (r.status === "delivered") delivered += r.orders_count;
      revenueCents += r.revenue_cents ?? 0;
      printMinutes += r.print_minutes ?? 0;
      const month = r.day.slice(0, 7);
      if (month === thisMonthKey) thisMonth += r.orders_count;
      if (month === lastMonthKey) lastMonth += r.orders_count;
      if (r.day >= seriesStartIso) {
        const cur = byMonth.get(month) ?? { orders: 0, revenueCents: 0 };
        cur.orders += r.orders_count;
        cur.revenueCents += r.revenue_cents ?? 0;
        byMonth.set(month, cur);
      }
    }
    // Dense series: every month in the window, zeros included.
    const monthly: UserPerformance["orders"]["monthly"] = [];
    for (let i = 0; i < monthsBack; i++) {
      const d = new Date(seriesStart);
      d.setMonth(d.getMonth() + i);
      const key = monthKey(d);
      monthly.push({ month: key, ...(byMonth.get(key) ?? { orders: 0, revenueCents: 0 }) });
    }

    // ── Prints ───────────────────────────────────────────────────────────────
    let completed = 0;
    let failed = 0;
    let estSum = 0;
    let actSum = 0;
    for (const p of asRows<{
      state: string;
      estimated_minutes: number | null;
      actual_minutes: number | null;
    }>(printsRes.data)) {
      if (p.state === "completed") {
        completed += 1;
        if (p.estimated_minutes && p.actual_minutes) {
          estSum += p.estimated_minutes;
          actSum += p.actual_minutes;
        }
      } else {
        failed += 1;
      }
    }
    const printsTotal = completed + failed;

    const fb = asRow<{ resolved_count: number; median_resolution_hours: number | null }>(
      feedbackRes.data,
    );

    const taskRows = asRows<{ done: boolean }>(tasksRes.data);
    const tasksTotal = taskRows.length;
    const tasksCompleted = taskRows.filter((t) => t.done).length;

    let logins = 0;
    let actions = 0;
    let activeDays = 0;
    for (const a of asRows<{ logins: number; actions: number }>(activityRes.data)) {
      logins += a.logins;
      actions += a.actions;
      if (a.logins + a.actions > 0) activeDays += 1;
    }

    const payload: UserPerformance = {
      currency: settings.currency,
      orders: { total, delivered, revenueCents, printMinutes, thisMonth, lastMonth, monthly },
      prints: {
        completed,
        failed,
        successRatePct: printsTotal > 0 ? Math.round((completed / printsTotal) * 100) : null,
        efficiencyPct: actSum > 0 ? Math.round((estSum / actSum) * 100) : null,
      },
      feedback: {
        resolved: fb?.resolved_count ?? 0,
        medianResolutionHours:
          fb?.median_resolution_hours != null ? Number(fb.median_resolution_hours) : null,
      },
      tasks: { total: tasksTotal, completed: tasksCompleted },
      activity30d: { logins, actions, activeDays },
    };
    return jsonOk(payload);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load performance", 500);
  }
});
