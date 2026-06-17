import { withPermission } from "@/lib/api/with-permission";
import { jsonOk } from "@/lib/api/response";
import { readPayrollData } from "@/lib/datasets/payroll";

/** GET /api/payroll — salary-cost analytics (from the rollup, never a live scan). */
export const GET = withPermission("payroll.analytics_view", async () => {
  return jsonOk(await readPayrollData());
});
