import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { fetchPurchaseOrderItems } from "@/lib/datasets/purchase-orders";

/** GET /api/purchase-orders/[id]/items — line items for the PO detail sheet. */
export const GET = withPermission("purchase_orders.view", async (_req, ctx) => {
  const params = await ctx.params;
  const id = params?.id;
  if (!id) return jsonError("Missing purchase order id", 400);
  try {
    return jsonOk({ items: await fetchPurchaseOrderItems(id) });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load items", 500);
  }
});
