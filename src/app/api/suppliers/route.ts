import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { SUPPLIER_SORTABLE, fetchSuppliersPage } from "@/lib/datasets/suppliers";

/** GET /api/suppliers — cursor-paginated supplier directory. Params: q, sort, dir, cursor, limit. */
export const GET = withPermission("suppliers.view", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: SUPPLIER_SORTABLE,
    defaultSort: "company_name",
    defaultDir: "asc",
  });
  try {
    return jsonOk(await fetchSuppliersPage(parsed));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load suppliers", 500);
  }
});
