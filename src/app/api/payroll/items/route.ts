import { withPermission } from "@/lib/api/with-permission";
import { jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { fetchItemsPage, ITEM_SORTABLE } from "@/lib/datasets/payroll-items";

/**
 * GET /api/payroll/items — keyset page of payroll items. Gated on
 * payroll.view_own so admins (who hold it via "*") see all and staff see only
 * their own via RLS — powering both the run-detail table and "My Payslips".
 */
export const GET = withPermission("payroll.view_own", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: ITEM_SORTABLE,
    defaultSort: "net_cents",
    defaultDir: "desc",
  });
  return jsonOk(await fetchItemsPage(parsed));
});
