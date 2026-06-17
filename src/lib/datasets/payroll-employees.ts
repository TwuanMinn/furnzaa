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
import { formatDate } from "@/lib/format";
import { employeeStatusMeta, employmentTypeMeta } from "@/lib/payroll/formulas";
import type { EmployeeListRow } from "@/lib/payroll/types";

/**
 * Employees list (Module 16). SESSION client — RLS scopes the caller (admin =
 * all; staff payroll.view_own = only their own employee row). Keyset on the
 * 0038 composite indexes; name search rides the pg_trgm index.
 */

type RawRow = Omit<EmployeeListRow, "department_name" | "department_color"> & {
  department: { name: string; color: string } | null;
};

const LIST_COLUMNS =
  "id, employee_code, full_name, position, department_id, employment_type, status, hire_date, created_at, " +
  "department:departments!employees_department_id_fkey(name, color)";

export const EMPLOYEE_SORTABLE: Record<string, string> = {
  created_at: "created_at",
  full_name: "full_name",
};

function toListRow(r: RawRow): EmployeeListRow {
  return {
    id: r.id,
    employee_code: r.employee_code,
    full_name: r.full_name,
    position: r.position,
    department_id: r.department_id,
    department_name: r.department?.name ?? null,
    department_color: r.department?.color ?? null,
    employment_type: r.employment_type,
    status: r.status,
    hire_date: r.hire_date,
    created_at: r.created_at,
  };
}

export async function fetchEmployeesPage(parsed: ParsedListQuery): Promise<CursorPage<EmployeeListRow>> {
  const supabase = await createClient();
  let query = supabase
    .from("employees")
    .select(LIST_COLUMNS, parsed.cursor ? {} : { count: "estimated" })
    .is("deleted_at", null);

  if (parsed.q) query = query.or(ilikeAnyExpression(["full_name", "employee_code"], parsed.q));

  const eqFilters: Record<string, string> = {
    department: "department_id",
    employment_type: "employment_type",
    status: "status",
  };
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
  return buildPage(asRows<RawRow>(data).map(toListRow), parsed.limit, parsed.sort, count ?? null);
}

async function fetchEmployeesForExport(query: ListQuery, _user: SessionUser, limit: number): Promise<EmployeeListRow[]> {
  const all: EmployeeListRow[] = [];
  let cursor: string | null = null;
  while (all.length < limit) {
    const page = await fetchEmployeesPage({
      q: (query.q ?? "").trim().slice(0, 200),
      sort: EMPLOYEE_SORTABLE[query.sort ?? ""] ? (query.sort as string) : "created_at",
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

export const employeesExportDataset: ExportDataset<EmployeeListRow> = {
  title: "Employees",
  slug: "payroll-employees",
  module: "payroll",
  permission: "payroll.view_all",
  columns: [
    { header: "Code", value: (r) => r.employee_code, width: 0.9 },
    { header: "Name", value: (r) => r.full_name, width: 1.8 },
    { header: "Position", value: (r) => r.position, width: 1.4 },
    { header: "Department", value: (r) => r.department_name ?? "", width: 1.2 },
    { header: "Type", value: (r) => employmentTypeMeta(r.employment_type).label, width: 1 },
    { header: "Status", value: (r) => employeeStatusMeta(r.status).label, width: 1 },
    { header: "Hire date", value: (r) => (r.hire_date ? formatDate(r.hire_date) : ""), width: 1.2 },
  ],
  fetchRows: fetchEmployeesForExport,
};
