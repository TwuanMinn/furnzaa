import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { ACTIVITY_SORTABLE, fetchActivityPage } from "@/lib/datasets/activity";

/**
 * GET /api/activity — cursor-paginated activity feed. RLS scopes staff to
 * their own rows; admins see all. Params: q, cursor, limit, f_module,
 * f_action, f_actor, f_created_at_from/_to.
 */
export const GET = withPermission("logs.view", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: ACTIVITY_SORTABLE,
    defaultSort: "created_at",
  });
  try {
    return jsonOk(await fetchActivityPage(parsed));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load activity", 500);
  }
});
