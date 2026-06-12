import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { parseListQuery } from "@/lib/datatable/server";
import { VOUCHER_SORTABLE, fetchVouchersPage } from "@/lib/datasets/crm";

/**
 * GET /api/crm/vouchers — cursor-paginated voucher list.
 * Params: q (code), sort, dir, cursor, limit, f_type, f_source, f_status.
 */
export const GET = withPermission("vouchers.view", async (req) => {
  const parsed = parseListQuery(new URL(req.url), {
    sortable: VOUCHER_SORTABLE,
    defaultSort: "created_at",
  });
  try {
    return jsonOk(await fetchVouchersPage(parsed));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load vouchers", 500);
  }
});
