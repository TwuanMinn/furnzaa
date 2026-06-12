import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { fetchAnalytics } from "@/lib/datasets/analytics";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Role-scoped dashboard data from cached matviews: staff without
 * analytics.view_team get only their own figures (cube filtered to their id);
 * admins get company-wide KPIs + top lists + printer utilization.
 */
export const GET = withPermission("analytics.view", async (req, { user }) => {
  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const from = fromRaw && DATE_RE.test(fromRaw) ? fromRaw : null;
  const to = toRaw && DATE_RE.test(toRaw) ? toRaw : null;
  try {
    return jsonOk(await fetchAnalytics(user, from, to));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load analytics", 500);
  }
});
