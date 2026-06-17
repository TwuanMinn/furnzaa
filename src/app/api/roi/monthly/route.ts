import { withPermission } from "@/lib/api/with-permission";
import { jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { fetchMonthlyPage, MONTHLY_SORTABLE } from "@/lib/datasets/roi-monthly";

/** GET /api/roi/monthly — keyset page of one investment's monthly recovery. */
export const GET = withPermission("roi.view", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: MONTHLY_SORTABLE,
    defaultSort: "period_month",
    defaultDir: "desc",
  });
  return jsonOk(await fetchMonthlyPage(parsed));
});
