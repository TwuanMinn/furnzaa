import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { CRM_CUSTOMER_SORTABLE, fetchCrmCustomersPage } from "@/lib/datasets/crm";

/**
 * GET /api/crm/customers — cursor-paginated CRM customer list over the
 * incrementally-maintained aggregates. Params: q, sort, dir, cursor, limit,
 * f_tier, f_segment, f_region, f_spend_min/_max (major units), f_orders_min,
 * f_last_purchase_from/_to.
 */
export const GET = withPermission("crm.view", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: CRM_CUSTOMER_SORTABLE,
    defaultSort: "lifetime_spend_cents",
  });
  try {
    return jsonOk(await fetchCrmCustomersPage(parsed));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load customers", 500);
  }
});
