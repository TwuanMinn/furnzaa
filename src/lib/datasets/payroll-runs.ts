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
import { runStatusMeta } from "@/lib/payroll/formulas";
import type { PayrollRunRow } from "@/lib/payroll/types";

/** Payroll runs list (admin / payroll.view_all only — RLS blocks staff). */

const LIST_COLUMNS =
  "id, period_month, name, status, run_type, headcount, total_gross_cents, total_net_cents, total_employer_cost_cents, created_at";

export const RUN_SORTABLE: Record<string, string> = {
  period_month: "period_month",
  created_at: "created_at",
};

export async function fetchRunsPage(parsed: ParsedListQuery): Promise<CursorPage<PayrollRunRow>> {
  const supabase = await createClient();
  let query = supabase.from("payroll_runs").select(LIST_COLUMNS, parsed.cursor ? {} : { count: "estimated" });

  const eqFilters: Record<string, string> = { status: "status", run_type: "run_type" };
  for (const [filterId, column] of Object.entries(eqFilters)) {
    const value = parsed.filters[filterId];
    if (value) query = query.eq(column, value);
  }
  if (parsed.cursor) query = query.or(keysetOrExpression(parsed.cursor, parsed.sort, parsed.ascending));

  const { data, error, count } = await query
    .order(parsed.sort, { ascending: parsed.ascending })
    .order("id", { ascending: parsed.ascending })
    .limit(parsed.limit + 1);
  if (error) throw new Error(error.message);
  return buildPage(asRows<PayrollRunRow>(data), parsed.limit, parsed.sort, count ?? null);
}

async function fetchRunsForExport(query: ListQuery, _user: SessionUser, limit: number): Promise<PayrollRunRow[]> {
  const all: PayrollRunRow[] = [];
  let cursor: string | null = null;
  while (all.length < limit) {
    const page = await fetchRunsPage({
      q: "",
      sort: RUN_SORTABLE[query.sort ?? ""] ? (query.sort as string) : "period_month",
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

export const payrollRunsExportDataset: ExportDataset<PayrollRunRow> = {
  title: "Payroll Runs",
  slug: "payroll-runs",
  module: "payroll",
  permission: "payroll.view_all",
  columns: [
    { header: "Period", value: (r) => formatDate(r.period_month, "MMM yyyy"), width: 1.1 },
    { header: "Name", value: (r) => r.name, width: 1.8 },
    { header: "Type", value: (r) => r.run_type, width: 1 },
    { header: "Status", value: (r) => runStatusMeta(r.status).label, width: 1 },
    { header: "Headcount", value: (r) => r.headcount, align: "right", width: 0.8 },
    { header: "Gross", value: (r) => centsToDecimalString(r.total_gross_cents, "VND"), align: "right" },
    { header: "Net", value: (r) => centsToDecimalString(r.total_net_cents, "VND"), align: "right" },
    { header: "Employer cost", value: (r) => centsToDecimalString(r.total_employer_cost_cents, "VND"), align: "right" },
  ],
  fetchRows: fetchRunsForExport,
};
