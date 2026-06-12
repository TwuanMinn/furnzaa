"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, dbInsert, dbUpdate } from "@/lib/supabase/types";
import { requirePermission, ForbiddenError, UnauthorizedError } from "@/lib/rbac/guards";
import { logActivity } from "@/lib/activity/log";
import { notifyTierUpgraded, notifyVoucherIssued } from "@/lib/notifications/service";
import type { SegmentFilter } from "@/lib/datasets/crm";

/**
 * CRM & Loyalty server actions (Module 5): vouchers, manual tier overrides,
 * tier/benefit configuration, segments. Pattern: permission guard → zod →
 * privileged write (admin client; the user client has no write grant on
 * loyalty tables by design) → activity log.
 */

export type CrmResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof UnauthorizedError) return { ok: false, error: "You are not signed in." };
  if (e instanceof ForbiddenError) return { ok: false, error: "You don't have permission to do that." };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

// ── Vouchers ─────────────────────────────────────────────────────────────────

const voucherSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9-]{2,40}$/, "Codes are 3–40 chars: letters, numbers, dashes")
      .optional()
      .or(z.literal("")),
    type: z.enum(["percentage", "fixed", "free_shipping"]),
    /** percent for percentage; major units for fixed. */
    value: z.coerce.number().min(0).max(1_000_000).default(0),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    usageLimit: z.coerce.number().int().min(1).max(1_000_000).optional().or(z.literal("")),
    assignedCustomerId: z.string().uuid().optional().or(z.literal("")),
    source: z.enum(["manual", "promotional"]).default("manual"),
    /** Generate N random codes (ignores `code`). */
    generateCount: z.coerce.number().int().min(1).max(500).default(1),
  })
  .refine((v) => v.type === "free_shipping" || v.value > 0, {
    message: "Value must be greater than zero",
    path: ["value"],
  })
  .refine((v) => v.type !== "percentage" || v.value <= 100, {
    message: "Percentage can’t exceed 100",
    path: ["value"],
  });
export type VoucherInput = z.infer<typeof voucherSchema>;

function randomCode(prefix: string): string {
  const block = () => crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `${prefix}-${block()}${block()}`;
}

export async function createVouchersAction(
  input: VoucherInput,
): Promise<CrmResult<{ created: number; firstCode: string }>> {
  try {
    const actor = await requirePermission("vouchers.create");
    const parsed = voucherSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;

    const explicitCode = (v.code ?? "").trim();
    const count = explicitCode ? 1 : v.generateCount;
    const codes = explicitCode
      ? [explicitCode]
      : Array.from({ length: count }, () => randomCode(v.source === "promotional" ? "PROMO" : "FZ"));

    const admin = createAdminClient();
    const rows = codes.map((code) => ({
      code,
      type: v.type,
      value_percent: v.type === "percentage" ? v.value : null,
      value_cents: v.type === "fixed" ? Math.round(v.value * 100) : null,
      start_date: v.startDate,
      end_date: v.endDate || null,
      usage_limit: v.usageLimit === "" || v.usageLimit == null ? null : Number(v.usageLimit),
      assigned_customer_id: v.assignedCustomerId || null,
      source: v.source,
      created_by: actor.id,
    }));

    const { data, error } = await admin
      .from("vouchers")
      .insert(dbInsert("vouchers", rows))
      .select("id, code");
    if (error) {
      if (error.code === "23505") return { ok: false, error: `Code "${codes[0]}" already exists.` };
      return { ok: false, error: error.message };
    }
    const created = (data ?? []) as { id: string; code: string }[];

    for (const voucher of created) {
      void logActivity({
        actor,
        action: "voucher.create",
        module: "crm",
        targetType: "voucher",
        targetId: voucher.id,
        summary: `Created ${v.source} voucher ${voucher.code} (${v.type})`,
        after: { code: voucher.code, type: v.type, value: v.value },
      });
    }
    if (v.assignedCustomerId && created[0]) {
      const { data: customer } = await admin
        .from("customers")
        .select("name")
        .eq("id", v.assignedCustomerId)
        .maybeSingle();
      void notifyVoucherIssued({
        customerName: asRow<{ name: string }>(customer)?.name ?? "Customer",
        voucherCode: created[0].code,
        reason: "manually issued",
      });
    }

    return { ok: true, data: { created: created.length, firstCode: created[0]?.code ?? "" } };
  } catch (e) {
    return fail(e);
  }
}

export async function setVoucherActiveAction(voucherId: string, active: boolean): Promise<CrmResult> {
  try {
    const actor = await requirePermission("vouchers.create");
    if (!z.string().uuid().safeParse(voucherId).success) return { ok: false, error: "Invalid voucher" };

    const admin = createAdminClient();
    const { data: beforeRaw } = await admin
      .from("vouchers")
      .select("code, is_active")
      .eq("id", voucherId)
      .maybeSingle();
    const before = asRow<{ code: string; is_active: boolean }>(beforeRaw);
    if (!before) return { ok: false, error: "Voucher not found" };

    const { error } = await admin
      .from("vouchers")
      .update(dbUpdate("vouchers", { is_active: active }))
      .eq("id", voucherId);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: active ? "voucher.activate" : "voucher.deactivate",
      module: "crm",
      targetType: "voucher",
      targetId: voucherId,
      summary: `${active ? "Activated" : "Deactivated"} voucher ${before.code}`,
      before: { is_active: before.is_active },
      after: { is_active: active },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Manual tier override ─────────────────────────────────────────────────────

export async function overrideTierAction(customerId: string, tierId: string): Promise<CrmResult> {
  try {
    const actor = await requirePermission("crm.manage_tiers");
    if (!z.string().uuid().safeParse(customerId).success || !z.string().uuid().safeParse(tierId).success) {
      return { ok: false, error: "Invalid customer or tier" };
    }

    const admin = createAdminClient();
    const [{ data: customerRaw }, { data: tierRaw }] = await Promise.all([
      admin
        .from("customers")
        .select(
          "id, name, current_tier_id, lifetime_spend_cents, annual_spend_cents, order_count, customer_score, tier:customer_tiers(name)",
        )
        .eq("id", customerId)
        .maybeSingle(),
      admin.from("customer_tiers").select("id, name").eq("id", tierId).maybeSingle(),
    ]);
    const customer = asRow<{
      id: string;
      name: string;
      current_tier_id: string | null;
      lifetime_spend_cents: number;
      annual_spend_cents: number;
      order_count: number;
      customer_score: number;
      tier: { name: string } | null;
    }>(customerRaw);
    const tier = asRow<{ id: string; name: string }>(tierRaw);
    if (!customer) return { ok: false, error: "Customer not found" };
    if (!tier) return { ok: false, error: "Tier not found" };
    if (customer.current_tier_id === tierId) {
      return { ok: false, error: "The customer already has that tier." };
    }

    const { error: updateError } = await admin
      .from("customers")
      .update(dbUpdate("customers", { current_tier_id: tierId }))
      .eq("id", customerId);
    if (updateError) return { ok: false, error: updateError.message };

    const { error: historyError } = await admin.from("customer_rank_history").insert(
      dbInsert("customer_rank_history", {
        customer_id: customerId,
        previous_tier_id: customer.current_tier_id,
        new_tier_id: tierId,
        reason: "manual",
        qualifying_snapshot: {
          lifetime_spend_cents: customer.lifetime_spend_cents,
          annual_spend_cents: customer.annual_spend_cents,
          order_count: customer.order_count,
          customer_score: customer.customer_score,
        } as never,
        changed_by: actor.id,
      }),
    );
    if (historyError) return { ok: false, error: historyError.message };

    void notifyTierUpgraded({ customerId, customerName: customer.name, tierName: tier.name });
    void logActivity({
      actor,
      action: "crm.tier_override",
      module: "crm",
      targetType: "customer",
      targetId: customerId,
      summary: `${customer.name}: ${customer.tier?.name ?? "—"} → ${tier.name} (manual override)`,
      before: { tier: customer.tier?.name ?? null },
      after: { tier: tier.name },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Tier thresholds + benefits ───────────────────────────────────────────────

const tierUpdateSchema = z.object({
  tierId: z.string().uuid(),
  lifetimeSpendThreshold: z.coerce.number().min(0).max(1_000_000_000),
  benefits: z.object({
    discountPercent: z.coerce.number().min(0).max(100),
    voucherAmount: z.coerce.number().min(0).max(1_000_000),
    freeShipping: z.boolean(),
    prioritySupport: z.boolean(),
    exclusivePromotions: z.boolean(),
    cashbackPercent: z.coerce.number().min(0).max(100),
  }),
});
export type TierUpdateInput = z.infer<typeof tierUpdateSchema>;

export async function updateTierAction(input: TierUpdateInput): Promise<CrmResult> {
  try {
    const actor = await requirePermission("crm.manage_tiers");
    const parsed = tierUpdateSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;

    const admin = createAdminClient();
    const { data: beforeRaw } = await admin
      .from("customer_tiers")
      .select("name, lifetime_spend_threshold_cents, tier_benefits(discount_percent, voucher_amount_cents)")
      .eq("id", v.tierId)
      .maybeSingle();
    const before = asRow<{ name: string; lifetime_spend_threshold_cents: number }>(beforeRaw);
    if (!before) return { ok: false, error: "Tier not found" };

    const { error: tierError } = await admin
      .from("customer_tiers")
      .update(
        dbUpdate("customer_tiers", {
          lifetime_spend_threshold_cents: Math.round(v.lifetimeSpendThreshold * 100),
        }),
      )
      .eq("id", v.tierId);
    if (tierError) return { ok: false, error: tierError.message };

    const { error: benefitError } = await admin
      .from("tier_benefits")
      .update(
        dbUpdate("tier_benefits", {
          discount_percent: v.benefits.discountPercent,
          voucher_amount_cents: Math.round(v.benefits.voucherAmount * 100),
          free_shipping: v.benefits.freeShipping,
          priority_support: v.benefits.prioritySupport,
          exclusive_promotions: v.benefits.exclusivePromotions,
          cashback_percent: v.benefits.cashbackPercent,
        }),
      )
      .eq("tier_id", v.tierId);
    if (benefitError) return { ok: false, error: benefitError.message };

    void logActivity({
      actor,
      action: "crm.tier_config_change",
      module: "crm",
      targetType: "customer_tier",
      targetId: v.tierId,
      summary: `Updated tier “${before.name}” (threshold ${v.lifetimeSpendThreshold.toLocaleString()})`,
      before: { lifetime_spend_threshold_cents: before.lifetime_spend_threshold_cents },
      after: {
        lifetime_spend_threshold_cents: Math.round(v.lifetimeSpendThreshold * 100),
        benefits: v.benefits,
      },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Segments ─────────────────────────────────────────────────────────────────

const segmentSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Name the segment").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  filter: z.object({
    spend_min_cents: z.number().int().min(0).optional(),
    spend_max_cents: z.number().int().min(0).optional(),
    order_count_min: z.number().int().min(0).optional(),
    tier_keys: z.array(z.string()).max(20).optional(),
    last_purchase_before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    last_purchase_after: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    regions: z.array(z.string().max(80)).max(50).optional(),
    product_id: z.string().uuid().optional(),
  }),
});
export type SegmentInput = z.infer<typeof segmentSchema>;

export async function saveSegmentAction(input: SegmentInput): Promise<CrmResult<{ id: string }>> {
  try {
    const actor = await requirePermission("crm.manage_tiers");
    const parsed = segmentSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;

    // Strip empty keys so the stored definition only contains real predicates.
    const filter = Object.fromEntries(
      Object.entries(v.filter).filter(([, value]) =>
        Array.isArray(value) ? value.length > 0 : value !== undefined && value !== "",
      ),
    ) as SegmentFilter;

    const supabase = await createClient(); // RLS: admin-only writes
    if (v.id) {
      const { error } = await supabase
        .from("customer_segments")
        .update(
          dbUpdate("customer_segments", {
            name: v.name,
            description: v.description || null,
            filter: filter as never,
          }),
        )
        .eq("id", v.id);
      if (error) return { ok: false, error: error.message };
      void logActivity({
        actor,
        action: "crm.segment_update",
        module: "crm",
        targetType: "customer_segment",
        targetId: v.id,
        summary: `Updated segment “${v.name}”`,
        after: { filter },
      });
      return { ok: true, data: { id: v.id } };
    }

    const { data, error } = await supabase
      .from("customer_segments")
      .insert(
        dbInsert("customer_segments", {
          name: v.name,
          description: v.description || null,
          filter: filter as never,
          created_by: actor.id,
        }),
      )
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Failed to save segment" };
    const id = (data as { id: string }).id;

    void logActivity({
      actor,
      action: "crm.segment_create",
      module: "crm",
      targetType: "customer_segment",
      targetId: id,
      summary: `Created segment “${v.name}”`,
      after: { filter },
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSegmentAction(segmentId: string): Promise<CrmResult> {
  try {
    const actor = await requirePermission("crm.manage_tiers");
    if (!z.string().uuid().safeParse(segmentId).success) return { ok: false, error: "Invalid segment" };

    const admin = createAdminClient();
    const { data: beforeRaw } = await admin
      .from("customer_segments")
      .select("name")
      .eq("id", segmentId)
      .maybeSingle();
    const before = asRow<{ name: string }>(beforeRaw);
    if (!before) return { ok: false, error: "Segment not found" };

    const { error } = await admin
      .from("customer_segments")
      .update(
        dbUpdate("customer_segments", {
          is_active: false,
          deleted_at: new Date().toISOString(),
        }),
      )
      .eq("id", segmentId);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "crm.segment_delete",
      module: "crm",
      targetType: "customer_segment",
      targetId: segmentId,
      summary: `Deleted segment “${before.name}”`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
