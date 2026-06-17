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
import { centsToDecimalString } from "@/lib/format";
import type { PayrollItemRow } from "@/lib/payroll/types";

/**
 * Payroll items within a run (the run-detail table). SESSION client — RLS lets
 * admins see all and staff see only their own item. Keyset on net_cents (NOT
 * NULL) + id. Filter f_run (run) is the usual access path.
 */

type RawRow = {
  id: string;
  employee_id: string;
  gross_cents: number;
  total_deductions_cents: number;
  total_tax_cents: number;
  net_cents: number;
  employer_cost_cents: number;
  overtime_pay_cents: number;
  status: string;
  employee: { full_name: string; employee_code: string; department: { name: string } | null } | null;
  run: { period_month: string; status: string } | null;
};

const LIST_COLUMNS =
  "id, employee_id, gross_cents, total_deductions_cents, total_tax_cents, net_cents, employer_cost_cents, overtime_pay_cents, status, " +
  "employee:employees!payroll_items_employee_id_fkey(full_name, employee_code, department:departments!employees_department_id_fkey(name)), " +
  "run:payroll_runs!payroll_items_payroll_run_id_fkey(period_month, status)";

export const ITEM_SORTABLE: Record<string, string> = {
  net_cents: "net_cents",
  gross_cents: "gross_cents",
};

function toListRow(r: RawRow): PayrollItemRow {
  return {
    id: r.id,
    employee_id: r.employee_id,
    employee_name: r.employee?.full_name ?? "—",
    employee_code: r.employee?.employee_code ?? "",
    department_name: r.employee?.department?.name ?? null,
    period_month: r.run?.period_month ?? "",
    run_status: r.run?.status ?? "",
    gross_cents: r.gross_cents,
    total_deductions_cents: r.total_deductions_cents,
    total_tax_cents: r.total_tax_cents,
    net_cents: r.net_cents,
    employer_cost_cents: r.employer_cost_cents,
    overtime_pay_cents: r.overtime_pay_cents,
    status: r.status,
  };
}

export async function fetchItemsPage(parsed: ParsedListQuery): Promise<CursorPage<PayrollItemRow>> {
  const supabase = await createClient();
  let query = supabase.from("payroll_items").select(LIST_COLUMNS, parsed.cursor ? {} : { count: "exact" });

  const run = parsed.filters["run"];
  if (run) query = query.eq("payroll_run_id", run);
  const employee = parsed.filters["employee"];
  if (employee) query = query.eq("employee_id", employee);

  if (parsed.cursor) query = query.or(keysetOrExpression(parsed.cursor, parsed.sort, parsed.ascending));

  const { data, error, count } = await query
    .order(parsed.sort, { ascending: parsed.ascending })
    .order("id", { ascending: parsed.ascending })
    .limit(parsed.limit + 1);
  if (error) throw new Error(error.message);
  return buildPage(asRows<RawRow>(data).map(toListRow), parsed.limit, parsed.sort, count ?? null);
}

async function fetchItemsForExport(query: ListQuery, _user: SessionUser, limit: number): Promise<PayrollItemRow[]> {
  const all: PayrollItemRow[] = [];
  let cursor: string | null = null;
  while (all.length < limit) {
    const page = await fetchItemsPage({
      q: "",
      sort: ITEM_SORTABLE[query.sort ?? ""] ? (query.sort as string) : "net_cents",
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

export const payrollItemsExportDataset: ExportDataset<PayrollItemRow> = {
  title: "Payroll Items",
  slug: "payroll-items",
  module: "payroll",
  permission: "payroll.view_all",
  columns: [
    { header: "Code", value: (r) => r.employee_code, width: 0.9 },
    { header: "Employee", value: (r) => r.employee_name, width: 1.8 },
    { header: "Department", value: (r) => r.department_name ?? "", width: 1.2 },
    { header: "Gross", value: (r) => centsToDecimalString(r.gross_cents, "VND"), align: "right" },
    { header: "Tax", value: (r) => centsToDecimalString(r.total_tax_cents, "VND"), align: "right" },
    { header: "Deductions", value: (r) => centsToDecimalString(r.total_deductions_cents, "VND"), align: "right" },
    { header: "Net", value: (r) => centsToDecimalString(r.net_cents, "VND"), align: "right" },
    { header: "Employer cost", value: (r) => centsToDecimalString(r.employer_cost_cents, "VND"), align: "right" },
  ],
  fetchRows: fetchItemsForExport,
};
