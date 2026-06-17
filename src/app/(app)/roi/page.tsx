import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import { getOrgBranding } from "@/lib/export/branding";
import { PageHeader } from "@/components/states";
import { RoiClient } from "./roi-client";

export const metadata = { title: "ROI & Investment Recovery" };

/**
 * Module 15 — ROI & Investment Recovery Tracker. Sensitive financials: gated by
 * roi.view (admin-only by default). Every number on the dashboard comes from the
 * cached per-investment aggregates + monthly rollup (never a live ledger scan).
 */
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("roi.view")) redirect("/dashboard");

  const supabase = await createClient();
  const [branding, catRes, projRes, prodRes] = await Promise.all([
    getOrgBranding(),
    supabase.from("investment_categories").select("id, name, color").is("deleted_at", null).order("sort_order").order("name"),
    supabase.from("investment_projects").select("id, name, color").is("deleted_at", null).order("sort_order").order("name"),
    supabase.from("products").select("id, name, sku").is("deleted_at", null).eq("is_active", true).order("name").limit(1000),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <PageHeader
        title="ROI & Investment Recovery"
        description="Track capital, recovery and ROI across every investment — from cached aggregates, refreshed continuously."
      />
      <RoiClient
        currency={branding.currency}
        categories={asRows<{ id: string; name: string; color: string }>(catRes.data)}
        projects={asRows<{ id: string; name: string; color: string }>(projRes.data)}
        products={asRows<{ id: string; name: string; sku: string }>(prodRes.data)}
        canCreate={user.permissions.has("roi.create")}
        canDelete={user.permissions.has("roi.delete")}
      />
    </div>
  );
}
