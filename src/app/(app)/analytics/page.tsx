import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { getOrgBranding } from "@/lib/export/branding";
import { getOrderConfig } from "@/lib/orders/config";
import { PageHeader } from "@/components/states";
import { AnalyticsClient } from "./analytics-client";

export const metadata = { title: "Analytics" };

/**
 * Analytics (Module 10). Role-scoped: staff without analytics.view_team see
 * only their own figures; admins see company-wide KPIs, top lists and printer
 * utilization. Every number is a rollup of pg_cron-refreshed matviews (0021) —
 * the page never scans orders.
 */
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("analytics.view")) redirect("/dashboard");

  const [branding, config] = await Promise.all([getOrgBranding(), getOrderConfig()]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        title="Analytics"
        description={
          user.permissions.has("analytics.view_team")
            ? "Company-wide KPIs, trends and team performance — from cached aggregates refreshed every 5 minutes."
            : "Your orders, revenue and trends — from cached aggregates refreshed every 5 minutes."
        }
      />
      <div className="mt-6">
        <AnalyticsClient
          currency={branding.currency}
          statuses={config.statuses.map((s) => ({ key: s.key, label: s.label, color: s.color }))}
          priorities={config.priorities.map((p) => ({ key: p.key, label: p.label, color: p.color }))}
        />
      </div>
    </div>
  );
}
