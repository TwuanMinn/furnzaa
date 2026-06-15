"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, dbInsert, dbUpdate } from "@/lib/supabase/types";
import { requirePermission } from "@/lib/rbac/guards";
import { fail, type ActionResult } from "@/lib/actions/result";
import { logActivity } from "@/lib/activity/log";
import {
  CURRENCY_FRACTION,
  allocateAmounts,
  profitSharingRecordInputSchema,
  type ProfitSharingRecordInput,
} from "./sharing";

/**
 * Profit Sharing records — the shared "collection" of saved splits behind the
 * Profit Sharing tab. RLS: read = any profit viewer, insert = self, update
 * (soft-delete) = owner only. Every mutation is permission-gated + logged.
 *
 * NOTE: a "use server" module may export ONLY async functions — the schema and
 * types live in ./sharing.ts.
 */

export async function saveProfitSharingRecordAction(
  input: ProfitSharingRecordInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requirePermission("profit.view");
    const parsed = profitSharingRecordInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid record" };
    }
    const v = parsed.data;

    // Recompute amounts SERVER-side from the validated split (never trust client
    // math). Amounts are normalized to the entered weights and capped at the
    // total — same allocation the calculator shows.
    const fraction = CURRENCY_FRACTION[v.currency];
    const sumPercent = v.partners.reduce((a, p) => a + p.percent, 0);
    const remainder = Math.max(0, 100 - sumPercent);
    const amounts = allocateAmounts(
      v.total,
      [...v.partners.map((p) => p.percent), remainder],
      fraction,
    );
    const partners = v.partners.map((p, i) => ({
      name: p.name,
      percent: p.percent,
      amount: amounts[i] ?? 0,
    }));

    const supabase = await createClient(); // RLS: own row + profit.view
    const { data, error } = await supabase
      .from("profit_sharing_records")
      .insert(
        dbInsert("profit_sharing_records", {
          created_by: actor.id,
          created_by_name: actor.fullName,
          label: v.label,
          note: v.note,
          currency: v.currency,
          total: v.total,
          partners,
          partner_count: partners.length,
        }),
      )
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Failed to save record" };
    const id = (data as { id: string }).id;

    void logActivity({
      actor,
      action: "profit_share.record",
      module: "profit",
      targetType: "profit_sharing_record",
      targetId: id,
      summary: `Recorded profit split “${v.label || "Untitled split"}” (${partners.length} partners, ${v.currency})`,
      after: { total: v.total, currency: v.currency, partner_count: partners.length },
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteProfitSharingRecordAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("profit.view");
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid record" };

    // The shared-ledger SELECT policy lets any profit viewer read the row to
    // authorize + build the log summary.
    const supabase = await createClient();
    const { data: beforeData } = await supabase
      .from("profit_sharing_records")
      .select("created_by, label, partner_count")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    const before = asRow<{ created_by: string; label: string; partner_count: number }>(beforeData);
    if (!before) return { ok: false, error: "Record not found" };

    const isOwner = before.created_by === actor.id;
    const isAdmin = actor.roleKey === "admin";
    if (!isOwner && !isAdmin) {
      return { ok: false, error: "You can only delete your own records" };
    }

    const deletedAt = new Date().toISOString();
    // Owner deletes through RLS; an admin removing someone else's record uses the
    // service-role client (the owner-only UPDATE policy is never widened). The
    // two clients have incompatible generic signatures, so branch — never assign
    // `cond ? admin : session` to one variable (that makes `.from()` uncallable).
    let delError: { message: string } | null;
    if (isOwner) {
      const { error } = await supabase
        .from("profit_sharing_records")
        .update(dbUpdate("profit_sharing_records", { is_active: false, deleted_at: deletedAt }))
        .eq("id", id);
      delError = error;
    } else {
      const { error } = await createAdminClient()
        .from("profit_sharing_records")
        .update(dbUpdate("profit_sharing_records", { is_active: false, deleted_at: deletedAt }))
        .eq("id", id);
      delError = error;
    }
    if (delError) return { ok: false, error: delError.message };

    void logActivity({
      actor,
      action: "profit_share.delete",
      module: "profit",
      targetType: "profit_sharing_record",
      targetId: id,
      summary: `Deleted profit split record “${before.label || "Untitled split"}”${isOwner ? "" : " (admin)"}`,
      before,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
