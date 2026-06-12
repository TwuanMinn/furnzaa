import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { CUSTOMER_SORTABLE, fetchCustomersPage } from "@/lib/datasets/customers";

/**
 * GET /api/customers — cursor-paginated customer list for the DataTable.
 * Params: q, sort, dir, cursor, limit, f_status, f_created_at_from/_to.
 */
export const GET = withPermission("customers.view", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: CUSTOMER_SORTABLE,
    defaultSort: "created_at",
  });
  try {
    return jsonOk(await fetchCustomersPage(parsed));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load customers", 500);
  }
});
