import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { readProfitData } from "@/lib/datasets/profit";

/**
 * GET /api/profit?from=YYYY-MM-DD&to=YYYY-MM-DD — Profit & Cost Analysis
 * data, served entirely from the pg_cron-refreshed materialized views
 * (≤5-minute freshness, zero raw-table scans). profit.view is Admin-only.
 */
export const GET = withPermission("profit.view", async (req) => {
  const url = new URL(req.url);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const from = fromRaw && dateRe.test(fromRaw) ? fromRaw : null;
  const to = toRaw && dateRe.test(toRaw) ? toRaw : null;

  try {
    return jsonOk(await readProfitData(from, to));
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load profit data", 500);
  }
});
