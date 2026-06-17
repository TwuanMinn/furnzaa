import { withPermission } from "@/lib/api/with-permission";
import { jsonOk, jsonError } from "@/lib/api/response";
import { readRoiData } from "@/lib/datasets/roi";

/**
 * GET /api/roi — dashboard aggregates (KPIs, monthly series, category/project
 * breakdowns) for the portfolio or a single investment. RLS-scoped via the
 * session client inside readRoiData (admin = all; granted staff = own/assigned).
 */
export const GET = withPermission("roi.view", async (req) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const investment = url.searchParams.get("investment");
  const data = await readRoiData(from, to, investment);
  if (!data) return jsonError("Investment not found", 404, "not_found");
  return jsonOk(data);
});
