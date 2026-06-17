import { withPermission } from "@/lib/api/with-permission";
import { jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { fetchInvestmentsPage, INVESTMENT_SORTABLE } from "@/lib/datasets/roi-investments";

/** GET /api/roi/investments — keyset page of the investments list (RLS-scoped). */
export const GET = withPermission("roi.view", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: INVESTMENT_SORTABLE,
    defaultSort: "created_at",
  });
  return jsonOk(await fetchInvestmentsPage(parsed));
});
