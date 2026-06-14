import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { asRow } from "@/lib/supabase/types";
import { getOrgBranding } from "@/lib/export/branding";
import { getOrderConfig } from "@/lib/orders/config";
import { PageHeader } from "@/components/states";
import { ProfitTabs } from "./profit-tabs";
import type { ProfitSharingConfig } from "@/lib/profit/sharing";

export const metadata = { title: "Profit & Cost Analysis" };

/**
 * Profit & Cost Analysis (Module 4, spec v5). Two sections behind a segmented
 * control: the matview-backed Profitability Dashboard (company-wide, cached)
 * and the per-user Cost Calculator scratchpad. Gated by profit.view; the
 * calculator's history is additionally pinned to the caller by RLS.
 */
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("profit.view")) redirect("/dashboard");

  const supabase = await createClient();
  const [branding, config, prefsRes] = await Promise.all([
    getOrgBranding(),
    getOrderConfig(),
    supabase
      .from("user_preferences")
      .select("date_format, time_format, profit_sharing_config")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const prefs = asRow<{
    date_format: string;
    time_format: string;
    profit_sharing_config: ProfitSharingConfig | null;
  }>(prefsRes.data);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <PageHeader
        title="Profit & Cost Analysis"
        description="Company-wide profitability from cached aggregates, plus a quick per-print cost calculator."
      />
      <ProfitTabs
        currency={branding.currency}
        materials={config.materials.map((m) => ({
          key: m.key,
          label: m.label,
          cost_per_gram_cents: m.cost_per_gram_cents,
        }))}
        dateFormat={prefs?.date_format || "d/M/yyyy"}
        timeFormat={prefs?.time_format || "HH:mm:ss"}
        initialSharing={prefs?.profit_sharing_config ?? null}
      />
    </div>
  );
}
