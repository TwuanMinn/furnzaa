import { withPermission } from "@/lib/api/with-permission";
import { jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { fetchEmployeesPage, EMPLOYEE_SORTABLE } from "@/lib/datasets/payroll-employees";

/** GET /api/payroll/employees — keyset page of employees (RLS-scoped). */
export const GET = withPermission("payroll.view_all", async (req) => {
  const parsed = parseListQuery(new URL(req.url), { sortable: EMPLOYEE_SORTABLE, defaultSort: "created_at" });
  return jsonOk(await fetchEmployeesPage(parsed));
});
