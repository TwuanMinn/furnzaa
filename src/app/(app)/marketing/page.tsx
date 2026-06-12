import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import { fetchSegments, fetchTiers } from "@/lib/datasets/crm";
import { fetchAutomationRules } from "@/lib/datasets/marketing";
import { PageHeader } from "@/components/states";
import { MarketingClient } from "./marketing-client";

export const metadata = { title: "Marketing Automation" };

export interface VoucherOption {
  id: string;
  code: string;
}

/**
 * Marketing Automation (Module 6): campaigns with a batched, resumable,
 * idempotent send pipeline (driven by /api/cron) + automation rules with
 * execution-level dedupe. Staff view; Admin creates/sends/configures.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const [user, sp] = await Promise.all([getSessionUser(), searchParams]);
  if (!user) redirect("/login");
  if (!user.permissions.has("campaigns.view")) redirect("/dashboard");

  const supabase = await createClient();
  const [segments, tiers, rules, vouchersRes] = await Promise.all([
    fetchSegments(),
    fetchTiers(),
    fetchAutomationRules(),
    supabase
      .from("vouchers")
      .select("id, code")
      .eq("is_active", true)
      .is("assigned_customer_id", null)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <PageHeader
        title="Marketing Automation"
        description="Campaigns over indexed audiences with an idempotent, batched send pipeline — plus event-driven automation rules on the shared cron runner."
      />
      <MarketingClient
        segments={segments}
        tiers={tiers}
        rules={rules}
        vouchers={asRows<VoucherOption>(vouchersRes.data)}
        focusCampaignId={sp.campaign ?? null}
      />
    </div>
  );
}
