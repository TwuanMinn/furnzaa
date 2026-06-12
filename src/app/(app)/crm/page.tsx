import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { getOrgBranding } from "@/lib/export/branding";
import { fetchSegments, fetchTiers } from "@/lib/datasets/crm";
import { PageHeader } from "@/components/states";
import { CrmClient } from "./crm-client";

export const metadata = { title: "CRM & Loyalty" };

/**
 * CRM & Loyalty (Module 5): customers with tier badges + segment filters,
 * tier & benefits management, vouchers, segments, per-customer rank history.
 * Customer aggregates are maintained incrementally by the order pipeline —
 * this module only reads them.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const [user, sp] = await Promise.all([getSessionUser(), searchParams]);
  if (!user) redirect("/login");
  if (!user.permissions.has("crm.view")) redirect("/dashboard");

  const [tiers, segments, branding] = await Promise.all([
    fetchTiers(),
    fetchSegments(),
    getOrgBranding(),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <PageHeader
        title="CRM & Loyalty"
        description="Customer segmentation, the 15-tier loyalty ladder, benefits and vouchers — driven by incrementally maintained spend aggregates."
      />
      <CrmClient
        tiers={tiers}
        segments={segments}
        currency={branding.currency}
        focusCustomerId={sp.customer ?? null}
      />
    </div>
  );
}
