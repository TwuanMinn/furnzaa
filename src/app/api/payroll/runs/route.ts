import { withPermission } from "@/lib/api/with-permission";
import { jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { fetchRunsPage, RUN_SORTABLE } from "@/lib/datasets/payroll-runs";

/** GET /api/payroll/runs — keyset page of payroll runs (admin only via RLS). */
export const GET = withPermission("payroll.view_all", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: RUN_SORTABLE,
    defaultSort: "period_month",
    defaultDir: "desc",
  });
  return jsonOk(await fetchRunsPage(parsed));
});
