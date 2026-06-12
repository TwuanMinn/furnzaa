import { withAuth } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { TREND_SORTABLE, fetchTrendsPage } from "@/lib/datasets/trends";

/**
 * GET /api/trends — cursor-paginated trending-product research catalog.
 * Every active user can read (RLS mirrors this); rows carry my_vote for the
 * CALLER only — other voters' identities are never exposed in the list.
 * Params: q, sort, dir, cursor, limit, f_status, f_platform, f_category,
 * f_tag, f_added_by, f_created_at_from/_to.
 */
export const GET = withAuth(async (req, { user }) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: TREND_SORTABLE,
    defaultSort: "created_at",
  });
  try {
    return jsonOk(await fetchTrendsPage(parsed, user.id));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load trends", 500);
  }
});
