import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, dbInsert, rpcParams } from "@/lib/supabase/types";
import type { SessionUser } from "@/lib/rbac/guards";
import { logActivity } from "@/lib/activity/log";
import { notifyTierUpgraded, notifyVoucherIssued } from "@/lib/notifications/service";

/**
 * CRM integration hooks called from the orders module.
 *
 * When an order becomes Delivered + Paid, apply_order_to_crm() updates the
 * customer's incremental aggregates O(1) and runs the idempotent tier engine
 * (orders.crm_applied_at guarantees exactly-once counting; the engine only
 * writes history on a real change). On an upgrade this hook fires the
 * notification, issues the tier's rank-upgrade voucher (dedupe_key makes
 * re-issuance impossible) and writes the activity log entry.
 */

interface CrmApplyRow {
  applied: boolean;
  customer_id: string;
  tier_changed: boolean;
  previous_tier_id: string | null;
  new_tier_id: string | null;
}

export async function handleOrderCrm(
  orderId: string,
  orderCode: string,
  actor: SessionUser,
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "apply_order_to_crm",
      rpcParams("apply_order_to_crm", { p_order_id: orderId }),
    );
    if (error) {
      console.error("[crm] apply_order_to_crm failed:", error.message);
      return;
    }
    const result = (Array.isArray(data) ? data[0] : data) as CrmApplyRow | undefined;
    if (!result?.applied) return;

    void logActivity({
      actor,
      action: "crm.order_counted",
      module: "crm",
      targetType: "customer",
      targetId: result.customer_id,
      summary: `Order ${orderCode} counted into customer lifetime aggregates`,
    });

    if (result.tier_changed && result.new_tier_id) {
      await handleTierUpgrade(result.customer_id, result.previous_tier_id, result.new_tier_id, actor);
    }
  } catch (e) {
    console.error("[crm] handleOrderCrm failed:", e);
  }
}

/** Tier upgrade side-effects: notification + benefit voucher + activity log. */
export async function handleTierUpgrade(
  customerId: string,
  previousTierId: string | null,
  newTierId: string,
  actor: SessionUser | null,
): Promise<void> {
  const admin = createAdminClient();

  const [customerRes, tierRes, prevTierRes, settingsRes] = await Promise.all([
    admin.from("customers").select("id, name").eq("id", customerId).maybeSingle(),
    admin
      .from("customer_tiers")
      .select("id, key, name, tier_benefits(voucher_amount_cents)")
      .eq("id", newTierId)
      .maybeSingle(),
    previousTierId
      ? admin.from("customer_tiers").select("name").eq("id", previousTierId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("organization_settings").select("voucher_defaults").eq("id", "org").maybeSingle(),
  ]);

  const customer = asRow<{ id: string; name: string }>(customerRes.data);
  const tier = asRow<{
    id: string;
    key: string;
    name: string;
    tier_benefits: { voucher_amount_cents: number } | { voucher_amount_cents: number }[] | null;
  }>(tierRes.data);
  if (!customer || !tier) return;

  const previousName = asRow<{ name: string }>(prevTierRes.data ?? null)?.name ?? "—";

  void notifyTierUpgraded({
    customerId: customer.id,
    customerName: customer.name,
    tierName: tier.name,
  });

  void logActivity({
    actor,
    action: "crm.tier_upgrade",
    module: "crm",
    targetType: "customer",
    targetId: customer.id,
    summary: `${customer.name}: ${previousName} → ${tier.name} (auto)`,
    before: { tier: previousName },
    after: { tier: tier.name },
  });

  // Rank-upgrade voucher when the tier's benefits define one. The unique
  // dedupe_key makes this exactly-once even if the engine path re-runs.
  const benefits = Array.isArray(tier.tier_benefits) ? tier.tier_benefits[0] : tier.tier_benefits;
  const amountCents = benefits?.voucher_amount_cents ?? 0;
  if (amountCents <= 0) return;

  const defaults = asRow<{ voucher_defaults: { valid_days?: number } | null }>(
    settingsRes.data,
  )?.voucher_defaults;
  const validDays = defaults?.valid_days ?? 30;
  const endDate = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const code = `RANK-${tier.key.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)}-${crypto
    .randomUUID()
    .slice(0, 6)
    .toUpperCase()}`;

  const { data: inserted, error } = await admin
    .from("vouchers")
    .insert(
      dbInsert("vouchers", {
        code,
        type: "fixed",
        value_cents: amountCents,
        end_date: endDate,
        usage_limit: 1,
        assigned_customer_id: customer.id,
        source: "rank_upgrade",
        dedupe_key: `rank_upgrade:${customer.id}:${tier.id}`,
      }),
    )
    .select("id, code")
    .maybeSingle();

  if (error) {
    // 23505 = dedupe_key already exists → voucher was issued previously. Fine.
    if (error.code !== "23505") console.error("[crm] voucher issue failed:", error.message);
    return;
  }
  if (!inserted) return;

  void notifyVoucherIssued({
    customerName: customer.name,
    voucherCode: code,
    reason: `reached ${tier.name}`,
  });
  void logActivity({
    actor,
    action: "voucher.issue",
    module: "crm",
    targetType: "voucher",
    targetId: (inserted as { id: string }).id,
    summary: `Issued rank-upgrade voucher ${code} to ${customer.name} (${tier.name})`,
    after: { code, value_cents: amountCents, end_date: endDate },
  });
}
