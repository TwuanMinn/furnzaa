import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { CAMPAIGN_SORTABLE, fetchCampaignsPage } from "@/lib/datasets/marketing";

/**
 * GET /api/marketing/campaigns — cursor-paginated campaign list.
 * Params: q (name), sort, dir, cursor, limit, f_status, f_channel.
 */
export const GET = withPermission("campaigns.view", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: CAMPAIGN_SORTABLE,
    defaultSort: "created_at",
  });
  try {
    return jsonOk(await fetchCampaignsPage(parsed));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load campaigns", 500);
  }
});
