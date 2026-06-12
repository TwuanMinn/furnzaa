import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { PRODUCTION_SORTABLE, fetchProductionPage } from "@/lib/datasets/production";

/**
 * GET /api/production — cursor-paginated production orders.
 * Params: q (code), sort, dir, cursor, limit, f_status, f_product.
 */
export const GET = withPermission("production.view", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: PRODUCTION_SORTABLE,
    defaultSort: "created_at",
  });
  try {
    return jsonOk(await fetchProductionPage(parsed));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load production orders", 500);
  }
});
