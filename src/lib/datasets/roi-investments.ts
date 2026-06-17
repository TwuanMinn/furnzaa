import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import type { SessionUser } from "@/lib/rbac/guards";
import type { CursorPage, ListQuery } from "@/lib/datatable/types";
import {
  buildPage,
  decodeCursor,
  ilikeAnyExpression,
  keysetOrExpression,
  type ParsedListQuery,
} from "@/lib/datatable/server";
import type { ExportDataset } from "@/lib/export/types";
import { centsToDecimalString, formatDate } from "@/lib/format";
import { breakEvenMeta } from "@/lib/roi/formulas";
import type { InvestmentListRow } from "@/lib/roi/types";

/**
 * Investments list dataset (Module 15). Runs on the SESSION client so RLS scopes
 * the caller (admin = all; granted staff = own/assigned). Keyset pagination on
 * the composite indexes from 0035; search rides the pg_trgm index on name.
 */

type RawRow = {
  id: string;
  name: string;
  category_id: string | null;
  project_id: string | null;
  total_capital_cents: number;
  recovered_cents: number;
  remaining_cents: number;
  roi_pct: number;
  recovery_pct: number;
  break_even_status: string;
  status: string;
  start_date: string;
  created_at: string;
  category: { name: string; color: string } | null;
  project: { name: string; color: string } | null;
};

const LIST_COLUMNS =
  "id, name, category_id, project_id, total_capital_cents, recovered_cents, remaining_cents, " +
  "roi_pct, recovery_pct, break_even_status, status, start_date, created_at, " +
  "category:investment_categories!investments_category_id_fkey(name, color), " +
  "project:investment_projects!investments_project_id_fkey(name, color)";

export const INVESTMENT_SORTABLE: Record<string, string> = {
  created_at: "created_at",
  roi_pct: "roi_pct",
  recovery_pct: "recovery_pct",
  total_capital_cents: "total_capital_cents",
  name: "name",
};

function toListRow(r: RawRow): InvestmentListRow {
  return {
    id: r.id,
    name: r.name,
    category_id: r.category_id,
    project_id: r.project_id,
    category_name: r.category?.name ?? null,
    category_color: r.category?.color ?? null,
    project_name: r.project?.name ?? null,
    project_color: r.project?.color ?? null,
    total_capital_cents: r.total_capital_cents,
    recovered_cents: r.recovered_cents,
    remaining_cents: r.remaining_cents,
    roi_pct: r.roi_pct,
    recovery_pct: r.recovery_pct,
    break_even_status: r.break_even_status,
    status: r.status,
    start_date: r.start_date,
    created_at: r.created_at,
  };
}

export async function fetchInvestmentsPage(
  parsed: ParsedListQuery,
): Promise<CursorPage<InvestmentListRow>> {
  const supabase = await createClient();

  let query = supabase
    .from("investments")
    .select(LIST_COLUMNS, parsed.cursor ? {} : { count: "estimated" })
    .is("deleted_at", null)
    .eq("is_active", true);

  if (parsed.q) query = query.or(ilikeAnyExpression(["name"], parsed.q));

  const eqFilters: Record<string, string> = {
    category: "category_id",
    project: "project_id",
    status: "status",
    break_even_status: "break_even_status",
  };
  for (const [filterId, column] of Object.entries(eqFilters)) {
    const value = parsed.filters[filterId];
    if (value) query = query.eq(column, value);
  }

  const from = parsed.filters["date_from"] ?? parsed.filters["start_date_from"];
  const to = parsed.filters["date_to"] ?? parsed.filters["start_date_to"];
  if (from) query = query.gte("start_date", from);
  if (to) query = query.lte("start_date", to);

  if (parsed.cursor) {
    query = query.or(keysetOrExpression(parsed.cursor, parsed.sort, parsed.ascending));
  }

  const { data, error, count } = await query
    .order(parsed.sort, { ascending: parsed.ascending })
    .order("id", { ascending: parsed.ascending })
    .limit(parsed.limit + 1);

  if (error) throw new Error(error.message);
  const rows = asRows<RawRow>(data).map(toListRow);
  return buildPage(rows, parsed.limit, parsed.sort, count ?? null);
}

async function fetchInvestmentsForExport(
  query: ListQuery,
  _user: SessionUser,
  limit: number,
): Promise<InvestmentListRow[]> {
  const all: InvestmentListRow[] = [];
  let cursor: string | null = null;
  while (all.length < limit) {
    const page = await fetchInvestmentsPage({
      q: (query.q ?? "").trim().slice(0, 200),
      sort: INVESTMENT_SORTABLE[query.sort ?? ""] ? (query.sort as string) : "created_at",
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

export const roiInvestmentsExportDataset: ExportDataset<InvestmentListRow> = {
  title: "Investments",
  slug: "roi-investments",
  module: "roi",
  permission: "roi.view",
  columns: [
    { header: "Name", value: (r) => r.name, width: 2 },
    { header: "Category", value: (r) => r.category_name ?? "", width: 1.2 },
    { header: "Project", value: (r) => r.project_name ?? "", width: 1.2 },
    { header: "Total invested", value: (r) => centsToDecimalString(r.total_capital_cents, "VND"), align: "right" },
    { header: "Recovered", value: (r) => centsToDecimalString(r.recovered_cents, "VND"), align: "right" },
    { header: "Remaining", value: (r) => centsToDecimalString(r.remaining_cents, "VND"), align: "right" },
    { header: "ROI %", value: (r) => r.roi_pct, align: "right", width: 0.7 },
    { header: "Recovery %", value: (r) => r.recovery_pct, align: "right", width: 0.8 },
    { header: "Break-even", value: (r) => breakEvenMeta(r.break_even_status).label, width: 1.1 },
    { header: "Start date", value: (r) => formatDate(r.start_date), width: 1.2 },
  ],
  fetchRows: fetchInvestmentsForExport,
};
