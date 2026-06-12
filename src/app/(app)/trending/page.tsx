import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import { getOrgSettings } from "@/lib/settings/config";
import { getOrderConfig } from "@/lib/orders/config";
import { PageHeader } from "@/components/states";
import { TrendingClient } from "./trending-client";

export const metadata = { title: "Trending Products" };

/**
 * Trending Products (spec v6, Module 5): the research catalog the team fills
 * with product ideas before they become real products. Every active user can
 * browse and (with trends.create) add/upvote; manage/promote are Admin.
 */
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [settings, orderConfig, categoriesRes] = await Promise.all([
    getOrgSettings(),
    getOrderConfig(),
    (await createClient())
      .from("product_categories")
      .select("id, name")
      .order("name")
      .limit(500),
  ]);

  // Default per-gram cost: the cheapest configured material (calculator parity).
  const perGram = Math.min(
    ...orderConfig.materials.filter((m) => m.is_active).map((m) => m.cost_per_gram_cents),
    30000,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <PageHeader
        title="Trending Products"
        description="Collect, vote on and cost product ideas — promote winners straight into the catalog."
      />
      <TrendingClient
        config={{
          platforms: settings.trending.platforms,
          statuses: settings.trending.statuses,
          targetMarginPct: settings.trending.target_margin_pct,
          currency: settings.currency,
          categories: asRows<{ id: string; name: string }>(categoriesRes.data),
        }}
        materials={orderConfig.materials.map((m) => ({
          key: m.key,
          label: m.label,
          costPerGramCents: m.cost_per_gram_cents,
        }))}
        perGramCostCents={perGram}
        canCreate={user.permissions.has("trends.create")}
        canManage={user.permissions.has("trends.manage")}
        canPromote={user.permissions.has("trends.promote")}
      />
    </div>
  );
}
