import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { PO_SORTABLE, fetchPurchaseOrdersPage } from "@/lib/datasets/purchase-orders";

/**
 * GET /api/purchase-orders — cursor-paginated POs.
 * Params: q (PO number), sort, dir, cursor, limit, f_status, f_supplier,
 * f_order_date_from/_to.
 */
export const GET = withPermission("purchase_orders.view", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: PO_SORTABLE,
    defaultSort: "created_at",
  });
  try {
    return jsonOk(await fetchPurchaseOrdersPage(parsed));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load purchase orders", 500);
  }
});
