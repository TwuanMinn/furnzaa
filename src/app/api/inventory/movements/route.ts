import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { MOVEMENT_SORTABLE, fetchMovementsPage } from "@/lib/datasets/inventory";

/**
 * GET /api/inventory/movements — cursor-paginated stock ledger.
 * Params: q (notes), sort=created_at, dir, cursor, limit,
 * f_product (product id), f_movement_type, f_created_at_from/_to.
 */
export const GET = withPermission("inventory.view", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: MOVEMENT_SORTABLE,
    defaultSort: "created_at",
  });
  try {
    return jsonOk(await fetchMovementsPage(parsed));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load movements", 500);
  }
});
