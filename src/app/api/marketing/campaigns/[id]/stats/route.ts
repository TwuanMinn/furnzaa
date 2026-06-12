import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { fetchCampaignStats } from "@/lib/datasets/marketing";

/** GET /api/marketing/campaigns/[id]/stats — pre-aggregated campaign metrics. */
export const GET = withPermission("campaigns.view", async (_req, ctx) => {
  const params = await ctx.params;
  const id = params?.id;
  if (!id) return jsonError("Missing campaign id", 400);
  try {
    return jsonOk({ stats: await fetchCampaignStats(id) });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load stats", 500);
  }
});
