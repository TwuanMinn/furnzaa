import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { fetchRankHistory } from "@/lib/datasets/crm";

/** GET /api/crm/rank-history/[id] — a customer's tier-change timeline. */
export const GET = withPermission("crm.view", async (_req, ctx) => {
  const params = await ctx.params;
  const id = params?.id;
  if (!id) return jsonError("Missing customer id", 400);
  try {
    return jsonOk({ history: await fetchRankHistory(id) });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load rank history", 500);
  }
});
