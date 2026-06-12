import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { PRODUCT_SORTABLE, fetchProductsPage } from "@/lib/datasets/products";

/**
 * GET /api/products — cursor-paginated product catalog.
 * Params: q (name/sku/barcode trigram), sort, dir, cursor, limit,
 * f_category (category id), f_status, f_stock=low, f_created_at_from/_to.
 */
export const GET = withPermission("products.view", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: PRODUCT_SORTABLE,
    defaultSort: "created_at",
  });
  try {
    return jsonOk(await fetchProductsPage(parsed));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load products", 500);
  }
});
