import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import type { SessionUser } from "@/lib/rbac/guards";
import type { CursorPage, ListQuery } from "@/lib/datatable/types";
import {
  buildPage,
  decodeCursor,
  keysetOrExpression,
  type ParsedListQuery,
} from "@/lib/datatable/server";
import type { ExportDataset } from "@/lib/export/types";
import { centsToDecimalString, formatDate } from "@/lib/format";
import type { InvestmentMonthlyRow } from "@/lib/roi/types";

/**
 * Monthly analysis dataset (Module 15) — served from the security_invoker view
 * v_investment_monthly, so the rollup's RLS applies on the SESSION client and
 * cumulatives come pre-computed (no client-side running sums across pages). The
 * table is filtered to one investment (f_investment); keyset on period_month.
 */

const LIST_COLUMNS =
  "id, investment_id, period_month, capital_cents, revenue_cents, cost_cents, profit_cents, " +
  "cumulative_invested_cents, cumulative_profit_cents, remaining_recovery_cents, " +
  "roi_to_date_pct, recovery_to_date_pct";

export const MONTHLY_SORTABLE: Record<string, string> = {
  period_month: "period_month",
};

export async function fetchMonthlyPage(
  parsed: ParsedListQuery,
): Promise<CursorPage<InvestmentMonthlyRow>> {
  const supabase = await createClient();

  let query = supabase
    .from("v_investment_monthly")
    .select(LIST_COLUMNS, parsed.cursor ? {} : { count: "exact" });

  const investment = parsed.filters["investment"];
  if (investment) query = query.eq("investment_id", investment);

  const from = parsed.filters["date_from"] ?? parsed.filters["period_month_from"];
  const to = parsed.filters["date_to"] ?? parsed.filters["period_month_to"];
  if (from) query = query.gte("period_month", from);
  if (to) query = query.lte("period_month", to);

  if (parsed.cursor) {
    query = query.or(keysetOrExpression(parsed.cursor, parsed.sort, parsed.ascending));
  }

  const { data, error, count } = await query
    .order(parsed.sort, { ascending: parsed.ascending })
    .order("id", { ascending: parsed.ascending })
    .limit(parsed.limit + 1);

  if (error) throw new Error(error.message);
  const rows = asRows<InvestmentMonthlyRow>(data);
  return buildPage(rows, parsed.limit, parsed.sort, count ?? null);
}

async function fetchMonthlyForExport(
  query: ListQuery,
  _user: SessionUser,
  limit: number,
): Promise<InvestmentMonthlyRow[]> {
  const all: InvestmentMonthlyRow[] = [];
  let cursor: string | null = null;
  while (all.length < limit) {
    const page = await fetchMonthlyPage({
      q: "",
      sort: "period_month",
      ascending: query.dir === "asc",
      cursor: decodeCursor(cursor),
      limit: Math.min(1_000, limit - all.length),
      filters: query.filters ?? {},
    });
    all.push(...page.rows);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return all;
}

export const roiMonthlyExportDataset: ExportDataset<InvestmentMonthlyRow> = {
  title: "Monthly Recovery",
  slug: "roi-monthly",
  module: "roi",
  permission: "roi.view",
  columns: [
    { header: "Month", value: (r) => formatDate(r.period_month, "MMM yyyy"), width: 1.2 },
    { header: "Amount invested", value: (r) => centsToDecimalString(r.capital_cents, "VND"), align: "right" },
    { header: "Revenue", value: (r) => centsToDecimalString(r.revenue_cents, "VND"), align: "right" },
    { header: "Profit", value: (r) => centsToDecimalString(r.profit_cents, "VND"), align: "right" },
    { header: "Cumulative profit", value: (r) => centsToDecimalString(r.cumulative_profit_cents, "VND"), align: "right" },
    { header: "Remaining recovery", value: (r) => centsToDecimalString(r.remaining_recovery_cents, "VND"), align: "right" },
  ],
  fetchRows: fetchMonthlyForExport,
};
