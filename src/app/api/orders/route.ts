import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { ORDER_SORTABLE, fetchOrdersPage } from "@/lib/datasets/orders";

/**
 * GET /api/orders — cursor-paginated orders list. RLS scopes staff to
 * own/assigned rows. Params: q, sort, dir, cursor, limit, f_status,
 * f_priority, f_payment_status, f_assigned, f_customer, f_buying_date_from/_to.
 */
export const GET = withPermission("orders.view", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: ORDER_SORTABLE,
    defaultSort: "created_at",
  });
  try {
    return jsonOk(await fetchOrdersPage(parsed));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load orders", 500);
  }
});
