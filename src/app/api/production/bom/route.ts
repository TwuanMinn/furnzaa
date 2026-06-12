import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { fetchBomLines } from "@/lib/datasets/production";

/** GET /api/production/bom?product=<id> — BOM lines for the editor/preview. */
export const GET = withPermission("production.view", async (req) => {
  const productId = new URL(req.url).searchParams.get("product");
  if (!productId) return jsonError("Missing product id", 400);
  try {
    return jsonOk({ lines: await fetchBomLines(productId) });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load BOM", 500);
  }
});
