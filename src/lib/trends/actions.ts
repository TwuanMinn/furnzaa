"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, dbInsert, dbUpdate, rpcParams } from "@/lib/supabase/types";
import {
  ForbiddenError,
  UnauthorizedError,
  requirePermission,
} from "@/lib/rbac/guards";
import { logActivity } from "@/lib/activity/log";
import { getOrgSettings } from "@/lib/settings/config";
import { trendSchema, type TrendInput } from "./schemas";

/**
 * Trending Products actions (spec v6, Module 5). RLS is the second layer:
 * inserts require trends.create + added_by = auth.uid(); updates require
 * trends.manage; votes are own-row only with the incremental count trigger.
 */

export type TrendResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof UnauthorizedError) return { ok: false, error: "You are not signed in." };
  if (e instanceof ForbiddenError)
    return { ok: false, error: "You don't have permission to do that." };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

function toRowPatch(v: TrendInput) {
  return {
    name: v.name,
    source_platform: v.sourcePlatform,
    source_url: v.sourceUrl || null,
    category_id: v.categoryId,
    description: v.description || null,
    images: v.images,
    est_print_minutes: v.estPrintMinutes,
    suggested_material: v.suggestedMaterial || null,
    est_filament_grams: v.estFilamentGrams,
    est_selling_cents: v.estSellingCents,
    est_cost_cents: v.estCostCents,
    popularity_score: v.popularityScore,
    tags: [...new Set(v.tags)],
    notes: v.notes || null,
  };
}

export async function createTrendAction(input: TrendInput): Promise<TrendResult<{ id: string }>> {
  try {
    const actor = await requirePermission("trends.create");
    const parsed = trendSchema.safeParse(input);
    if (!parsed.success)
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("trending_products")
      .insert(dbInsert("trending_products", {
        ...toRowPatch(parsed.data),
        added_by: actor.id,
        updated_by: actor.id,
      }))
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    const id = (data as { id: string }).id;

    void logActivity({
      actor,
      action: "trend.create",
      module: "trends",
      targetType: "trending_product",
      targetId: id,
      summary: `Added trending product "${parsed.data.name}" (${parsed.data.sourcePlatform})`,
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateTrendAction(id: string, input: TrendInput): Promise<TrendResult> {
  try {
    const actor = await requirePermission("trends.manage");
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid entry" };
    const parsed = trendSchema.safeParse(input);
    if (!parsed.success)
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("trending_products")
      .update(dbUpdate("trending_products", { ...toRowPatch(parsed.data), updated_by: actor.id }))
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "trend.update",
      module: "trends",
      targetType: "trending_product",
      targetId: id,
      summary: `Updated trending product "${parsed.data.name}"`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** One vote per user per entry (PK enforces it); the trigger keeps the count. */
export async function toggleTrendVoteAction(
  id: string,
): Promise<TrendResult<{ voted: boolean }>> {
  try {
    const actor = await requirePermission("trends.create");
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid entry" };

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("trending_product_votes")
      .select("trending_product_id")
      .eq("trending_product_id", id)
      .eq("user_id", actor.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("trending_product_votes")
        .delete()
        .eq("trending_product_id", id)
        .eq("user_id", actor.id);
      if (error) return { ok: false, error: error.message };
      void logActivity({
        actor,
        action: "trend.unvote",
        module: "trends",
        targetType: "trending_product",
        targetId: id,
        summary: "Removed their upvote from a trending product",
      });
      return { ok: true, data: { voted: false } };
    }

    const { error } = await supabase
      .from("trending_product_votes")
      .insert(dbInsert("trending_product_votes", { trending_product_id: id, user_id: actor.id }));
    if (error) {
      // PK race (double-click): the vote already exists — idempotent outcome.
      if (error.code === "23505") return { ok: true, data: { voted: true } };
      return { ok: false, error: error.message };
    }
    void logActivity({
      actor,
      action: "trend.vote",
      module: "trends",
      targetType: "trending_product",
      targetId: id,
      summary: "Upvoted a trending product",
    });
    return { ok: true, data: { voted: true } };
  } catch (e) {
    return fail(e);
  }
}

export async function setTrendStatusAction(id: string, statusKey: string): Promise<TrendResult> {
  try {
    const actor = await requirePermission("trends.manage");
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid entry" };
    const settings = await getOrgSettings();
    const status = settings.trending.statuses.find((s) => s.key === statusKey);
    if (!status) return { ok: false, error: "Unknown trend status" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("trending_products")
      .update(dbUpdate("trending_products", { trend_status: status.key, updated_by: actor.id }))
      .eq("id", id)
      .select("name, trend_status")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    const row = asRow<{ name: string }>(data);

    void logActivity({
      actor,
      action: "trend.status_change",
      module: "trends",
      targetType: "trending_product",
      targetId: id,
      summary: `Moved "${row?.name ?? "trend"}" to ${status.label}`,
      after: { trend_status: status.key },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Promote a trend entry to a REAL product (spec: idempotent — promoting twice
 * never creates a duplicate). The conditional UPDATE ... IS NULL is the claim;
 * a lost race deletes the freshly created product again and reports the winner.
 */
export async function promoteTrendAction(
  id: string,
): Promise<TrendResult<{ productId: string; sku: string | null; already: boolean }>> {
  try {
    const actor = await requirePermission("trends.promote");
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid entry" };

    const admin = createAdminClient();
    const { data: trendRaw, error: loadError } = await admin
      .from("trending_products")
      .select("id, name, category_id, images, est_selling_cents, est_cost_cents, promoted_product_id")
      .eq("id", id)
      .maybeSingle();
    if (loadError) return { ok: false, error: loadError.message };
    const trend = asRow<{
      id: string;
      name: string;
      category_id: string | null;
      images: string[] | null;
      est_selling_cents: number | null;
      est_cost_cents: number | null;
      promoted_product_id: string | null;
    }>(trendRaw);
    if (!trend) return { ok: false, error: "Entry not found" };
    if (trend.promoted_product_id)
      return { ok: true, data: { productId: trend.promoted_product_id, sku: null, already: true } };

    const { data: skuData, error: skuError } = await admin.rpc(
      "next_document_number",
      rpcParams("next_document_number", { p_prefix: "SKU" }),
    );
    if (skuError) return { ok: false, error: skuError.message };
    const sku = skuData as string;

    const { data: productRaw, error: productError } = await admin
      .from("products")
      .insert(dbInsert("products", {
        sku,
        name: trend.name,
        category_id: trend.category_id,
        image_url: trend.images?.[0] ?? null, // copied by reference, not re-uploaded
        cost_price_cents: trend.est_cost_cents ?? 0,
        selling_price_cents: trend.est_selling_cents ?? 0,
        status: "active",
        created_by: actor.id,
        updated_by: actor.id,
      }))
      .select("id")
      .single();
    if (productError) return { ok: false, error: productError.message };
    const productId = (productRaw as { id: string }).id;

    // The idempotency claim: only ONE promotion can fill the null column.
    const { data: claimed, error: claimError } = await admin
      .from("trending_products")
      .update(dbUpdate("trending_products", {
        promoted_product_id: productId,
        trend_status: "in_production",
        updated_by: actor.id,
      }))
      .eq("id", id)
      .is("promoted_product_id", null)
      .select("id");
    if (claimError) return { ok: false, error: claimError.message };

    if ((claimed ?? []).length === 0) {
      // Lost a concurrent race — undo our product and report the winner's.
      await admin.from("products").delete().eq("id", productId);
      const { data: winnerRaw } = await admin
        .from("trending_products")
        .select("promoted_product_id")
        .eq("id", id)
        .maybeSingle();
      const winner = asRow<{ promoted_product_id: string | null }>(winnerRaw)?.promoted_product_id;
      if (!winner) return { ok: false, error: "Promotion conflict — try again" };
      return { ok: true, data: { productId: winner, sku: null, already: true } };
    }

    void logActivity({
      actor,
      action: "trend.promote",
      module: "trends",
      targetType: "trending_product",
      targetId: id,
      summary: `Promoted "${trend.name}" to product ${sku}`,
      after: { product_id: productId, sku },
    });
    return { ok: true, data: { productId, sku, already: false } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTrendAction(id: string): Promise<TrendResult> {
  try {
    const actor = await requirePermission("trends.manage");
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid entry" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("trending_products")
      .update(dbUpdate("trending_products", {
        is_active: false,
        deleted_at: new Date().toISOString(),
        updated_by: actor.id,
      }))
      .eq("id", id)
      .select("name")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    const row = asRow<{ name: string }>(data);

    void logActivity({
      actor,
      action: "trend.delete",
      module: "trends",
      targetType: "trending_product",
      targetId: id,
      summary: `Removed trending product "${row?.name ?? id}"`,
      severity: "warning",
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
