import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRow, asRows } from "@/lib/supabase/types";
import type { RoiData, RoiKpis, RoiBreakdown, RoiSeriesPoint } from "@/lib/roi/types";

/**
 * ROI dashboard reader (Module 15). Reads the PRE-AGGREGATED per-investment
 * headline columns + the monthly rollup on the SESSION client — RLS scopes the
 * caller to investments they may see (admin = all; granted staff = own/assigned),
 * so the portfolio totals are correct per user and never leak company-wide
 * figures. No live scan over the cash-flow ledger: the headline aggregates and
 * the rollup are the cache (maintained O(1) by apply_investment_cash_flow).
 */

type InvAgg = {
  id: string;
  total_capital_cents: number;
  total_revenue_cents: number;
  total_cost_cents: number;
  recovered_cents: number;
  remaining_cents: number;
  break_even_status: string;
  category_id: string | null;
  project_id: string | null;
};

type RollupRow = { period_month: string; capital_cents: number; revenue_cents: number; cost_cents: number };

const pct = (numerator: number, capital: number) =>
  capital <= 0 ? 0 : Math.round((numerator / capital) * 100 * 100) / 100;

function kpisFromInvestments(invs: InvAgg[]): RoiKpis {
  const t = invs.reduce(
    (a, i) => ({
      capital: a.capital + i.total_capital_cents,
      revenue: a.revenue + i.total_revenue_cents,
      cost: a.cost + i.total_cost_cents,
      recovered: a.recovered + i.recovered_cents,
      remaining: a.remaining + i.remaining_cents,
    }),
    { capital: 0, revenue: 0, cost: 0, recovered: 0, remaining: 0 },
  );
  return {
    investmentCount: invs.length,
    totalCapitalCents: t.capital,
    totalRevenueCents: t.revenue,
    totalCostCents: t.cost,
    recoveredCents: t.recovered,
    remainingCents: t.remaining,
    roiPct: pct(t.recovered - t.capital, t.capital),
    recoveryPct: Math.min(100, pct(t.recovered, t.capital)),
    recoveredCount: invs.filter((i) => i.break_even_status === "recovered").length,
    inProgressCount: invs.filter((i) => i.break_even_status === "pending" || i.break_even_status === "in_progress").length,
    underperformingCount: invs.filter((i) => i.break_even_status === "underperforming").length,
  };
}

/** Aggregate raw monthly rollup rows into a cumulative series. */
function seriesFromRollup(rows: RollupRow[]): RoiSeriesPoint[] {
  const byMonth = new Map<string, { invested: number; profit: number }>();
  for (const r of rows) {
    const m = byMonth.get(r.period_month) ?? { invested: 0, profit: 0 };
    m.invested += r.capital_cents;
    m.profit += r.revenue_cents - r.cost_cents;
    byMonth.set(r.period_month, m);
  }
  const months = [...byMonth.keys()].sort();
  let cumInv = 0;
  let cumRec = 0;
  return months.map((month) => {
    const v = byMonth.get(month)!;
    cumInv += v.invested;
    cumRec += v.profit;
    return {
      month,
      investedCents: v.invested,
      profitCents: v.profit,
      cumulativeInvestedCents: cumInv,
      cumulativeRecoveredCents: cumRec,
      roiPct: pct(cumRec - cumInv, cumInv),
    };
  });
}

const INV_COLS =
  "id, total_capital_cents, total_revenue_cents, total_cost_cents, recovered_cents, remaining_cents, break_even_status, category_id, project_id";

export async function readRoiData(
  from: string | null,
  to: string | null,
  investmentId: string | null,
): Promise<RoiData | null> {
  const supabase = await createClient();

  // ── Single-investment scope ────────────────────────────────────────────────
  if (investmentId) {
    const { data: invRaw } = await supabase
      .from("investments")
      .select(`${INV_COLS}, name, expected_payback_months, start_date`)
      .eq("id", investmentId)
      .is("deleted_at", null)
      .maybeSingle();
    const inv = asRow<InvAgg & { name: string; expected_payback_months: number | null; start_date: string }>(invRaw);
    if (!inv) return null; // not visible to this caller / not found

    let mq = supabase
      .from("v_investment_monthly")
      .select("period_month, capital_cents, revenue_cents, cost_cents")
      .eq("investment_id", investmentId)
      .order("period_month", { ascending: true })
      .limit(600);
    if (from) mq = mq.gte("period_month", from);
    if (to) mq = mq.lte("period_month", to);
    const { data: monthsData } = await mq;

    return {
      scope: "investment",
      investmentName: inv.name,
      expectedPaybackMonths: inv.expected_payback_months,
      startDate: inv.start_date,
      breakEvenStatus: inv.break_even_status,
      kpis: kpisFromInvestments([inv]),
      series: seriesFromRollup(asRows<RollupRow>(monthsData)),
      categories: [],
      projects: [],
    };
  }

  // ── Portfolio scope ─────────────────────────────────────────────────────────
  let rq = supabase
    .from("investment_monthly_rollup")
    .select("period_month, capital_cents, revenue_cents, cost_cents")
    .order("period_month", { ascending: true })
    .limit(20_000);
  if (from) rq = rq.gte("period_month", from);
  if (to) rq = rq.lte("period_month", to);

  const [invRes, catRes, projRes, rollupRes] = await Promise.all([
    supabase.from("investments").select(INV_COLS).is("deleted_at", null).eq("is_active", true).limit(5_000),
    supabase.from("investment_categories").select("id, name, color").is("deleted_at", null),
    supabase.from("investment_projects").select("id, name, color").is("deleted_at", null),
    rq,
  ]);

  const invs = asRows<InvAgg>(invRes.data);
  const cats = new Map(
    asRows<{ id: string; name: string; color: string }>(catRes.data).map((c) => [c.id, c]),
  );
  const projs = new Map(
    asRows<{ id: string; name: string; color: string }>(projRes.data).map((p) => [p.id, p]),
  );

  const breakdown = (dim: "category_id" | "project_id", lookup: Map<string, { name: string; color: string }>) => {
    const groups = new Map<string | null, InvAgg[]>();
    for (const i of invs) {
      const key = i[dim];
      const arr = groups.get(key) ?? [];
      arr.push(i);
      groups.set(key, arr);
    }
    const out: RoiBreakdown[] = [];
    for (const [key, group] of groups) {
      const meta = key ? lookup.get(key) : null;
      const k = kpisFromInvestments(group);
      out.push({
        id: key,
        name: meta?.name ?? "Uncategorized",
        color: meta?.color ?? "slate",
        investmentCount: group.length,
        totalCapitalCents: k.totalCapitalCents,
        recoveredCents: k.recoveredCents,
        remainingCents: k.remainingCents,
        roiPct: k.roiPct,
        recoveryPct: k.recoveryPct,
      });
    }
    return out.sort((a, b) => b.totalCapitalCents - a.totalCapitalCents);
  };

  return {
    scope: "portfolio",
    kpis: kpisFromInvestments(invs),
    series: seriesFromRollup(asRows<RollupRow>(rollupRes.data)),
    categories: breakdown("category_id", cats),
    projects: breakdown("project_id", projs),
  };
}
