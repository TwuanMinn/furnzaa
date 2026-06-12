import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows } from "@/lib/supabase/types";

/**
 * GET /api/feedback/analytics?days=90 — the Module 8 analytics sub-tab.
 * Every number comes from the 0031 materialized views (pg_cron-refreshed);
 * the MVs carry no API-role grants, so this route reads them via the service
 * role BEHIND feedback.analytics_view — never live scans of the raw table.
 */

export interface FeedbackDailyRow {
  day: string;
  category: string;
  severity: string;
  source_channel: string;
  rating: number;
  feedback_count: number;
  resolved_count: number;
}

export const GET = withPermission("feedback.analytics_view", async (req) => {
  const daysParam = Number(new URL(req.url).searchParams.get("days"));
  const days = [30, 90, 365].includes(daysParam) ? daysParam : 90;
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const admin = createAdminClient();
  try {
    const [summaryRes, dailyRes, productsRes, staffRes, repeatRes] = await Promise.all([
      admin.from("mv_feedback_summary").select("*").maybeSingle(),
      admin
        .from("mv_feedback_daily")
        .select("*")
        .gte("day", since)
        .order("day", { ascending: true })
        .limit(5000),
      admin.from("mv_feedback_products").select("*").limit(10),
      admin.from("mv_feedback_staff").select("*").limit(10),
      admin.from("mv_feedback_repeat_negative").select("*").limit(10),
    ]);
    for (const res of [summaryRes, dailyRes, productsRes, staffRes, repeatRes]) {
      if (res.error) return jsonError(res.error.message, 500);
    }

    return jsonOk({
      days,
      summary: asRow<Record<string, unknown>>(summaryRes.data),
      daily: asRows<FeedbackDailyRow>(dailyRes.data),
      products: asRows<Record<string, unknown>>(productsRes.data),
      staff: asRows<Record<string, unknown>>(staffRes.data),
      repeatNegative: asRows<Record<string, unknown>>(repeatRes.data),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed to load feedback analytics", 500);
  }
});
