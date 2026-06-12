import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { FEEDBACK_SORTABLE, fetchFeedbackPage } from "@/lib/datasets/feedback";

/**
 * GET /api/feedback — cursor-paginated feedback list. Runs on the SESSION
 * client inside fetchFeedbackPage so RLS scopes staff to records they
 * submitted or are assigned; feedback.view_all sees everything.
 * Params: q (FTS over comments + code), sort, dir, cursor, limit, f_status,
 * f_rating, f_category, f_severity, f_assigned, f_channel, f_customer,
 * f_date_from/_to.
 */
export const GET = withPermission("feedback.create", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: FEEDBACK_SORTABLE,
    defaultSort: "created_at",
  });
  try {
    return jsonOk(await fetchFeedbackPage(parsed));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load feedback", 500);
  }
});
