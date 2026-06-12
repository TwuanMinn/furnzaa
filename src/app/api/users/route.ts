import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { USER_SORTABLE, fetchUsersPage } from "@/lib/datasets/users";

/**
 * GET /api/users — cursor-paginated user directory for User Management.
 * Params: q, sort, dir, cursor, limit, f_role (role id), f_status,
 * f_created_at_from/_to.
 */
export const GET = withPermission("users.view", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: USER_SORTABLE,
    defaultSort: "created_at",
  });
  try {
    return jsonOk(await fetchUsersPage(parsed));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load users", 500);
  }
});
