"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, dbInsert, dbUpdate, rpcParams } from "@/lib/supabase/types";
import { requirePermission } from "@/lib/rbac/guards";
import { fail, type ActionResult } from "@/lib/actions/result";
import { logActivity } from "@/lib/activity/log";
import {
  investmentSchema,
  cashFlowSchema,
  type InvestmentInput,
  type CashFlowInput,
} from "./types";

/**
 * ROI / Investment Recovery server actions. Discipline (same as inventory):
 * requirePermission → zod → RLS-scoped write (or the SECURITY DEFINER ledger
 * RPC) → logActivity. Headline aggregates are NEVER touched directly — every
 * number flows through apply_investment_cash_flow / delete_investment_cash_flow.
 */

export async function createInvestmentAction(
  input: InvestmentInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requirePermission("roi.create");
    const parsed = investmentSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid investment" };
    const v = parsed.data;

    const supabase = await createClient(); // RLS: own row + roi.create
    const { data, error } = await supabase
      .from("investments")
      .insert(
        dbInsert("investments", {
          name: v.name,
          category_id: v.categoryId ?? null,
          project_id: v.projectId ?? null,
          description: v.description ?? null,
          notes: v.notes ?? null,
          start_date: v.startDate,
          expected_payback_months: v.expectedPaybackMonths ?? null,
          status: v.status,
          assigned_to: v.assignedTo ?? null,
          attribution_product_ids: v.attributionProductIds?.length ? v.attributionProductIds : null,
          created_by: actor.id,
        }),
      )
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Failed to create investment" };
    const id = (data as { id: string }).id;

    void logActivity({
      actor,
      action: "roi.investment_create",
      module: "roi",
      targetType: "investment",
      targetId: id,
      summary: `Created investment “${v.name}”`,
      after: { name: v.name, status: v.status, start_date: v.startDate },
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateInvestmentAction(
  id: string,
  input: InvestmentInput,
): Promise<ActionResult> {
  try {
    const actor = await requirePermission("roi.edit");
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid investment" };
    const parsed = investmentSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid investment" };
    const v = parsed.data;

    const supabase = await createClient(); // RLS: admin or roi.edit own/assigned
    const { data, error } = await supabase
      .from("investments")
      .update(
        dbUpdate("investments", {
          name: v.name,
          category_id: v.categoryId ?? null,
          project_id: v.projectId ?? null,
          description: v.description ?? null,
          notes: v.notes ?? null,
          start_date: v.startDate,
          expected_payback_months: v.expectedPaybackMonths ?? null,
          status: v.status,
          assigned_to: v.assignedTo ?? null,
          attribution_product_ids: v.attributionProductIds?.length ? v.attributionProductIds : null,
          updated_by: actor.id,
        }),
      )
      .eq("id", id)
      .is("deleted_at", null)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || (data as unknown[]).length === 0) {
      return { ok: false, error: "Investment not found or not yours to edit" };
    }

    void logActivity({
      actor,
      action: "roi.investment_edit",
      module: "roi",
      targetType: "investment",
      targetId: id,
      summary: `Edited investment “${v.name}”`,
      after: { name: v.name, status: v.status },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteInvestmentAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("roi.delete");
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid investment" };

    const supabase = await createClient();
    const { data: beforeData } = await supabase
      .from("investments")
      .select("name, created_by")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    const before = asRow<{ name: string; created_by: string | null }>(beforeData);
    if (!before) return { ok: false, error: "Investment not found" };
    if (before.created_by !== actor.id && actor.roleKey !== "admin") {
      return { ok: false, error: "You can only delete your own investments" };
    }

    // Authorized → service-role soft-delete (cascades to ledger/rollup on read
    // via the deleted_at guard; the row is hidden from every list).
    const { error } = await createAdminClient()
      .from("investments")
      .update(dbUpdate("investments", { is_active: false, deleted_at: new Date().toISOString() }))
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "roi.investment_delete",
      module: "roi",
      targetType: "investment",
      targetId: id,
      summary: `Deleted investment “${before.name}”`,
      before,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function recordCashflowAction(
  input: CashFlowInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requirePermission("roi.create");
    const parsed = cashFlowSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid entry" };
    const v = parsed.data;

    const supabase = await createClient();
    // Ownership gate: the actor must be able to SEE the investment (RLS) before
    // posting to its ledger — the RPC itself is permission-only, not row-scoped.
    const { data: vis } = await supabase
      .from("investments")
      .select("id, name")
      .eq("id", v.investmentId)
      .is("deleted_at", null)
      .maybeSingle();
    const inv = asRow<{ id: string; name: string }>(vis);
    if (!inv) return { ok: false, error: "Investment not found" };

    const amountCents = Math.round(v.amount * 100);
    const { data, error } = await supabase.rpc(
      "apply_investment_cash_flow",
      rpcParams("apply_investment_cash_flow", {
        p_investment_id: v.investmentId,
        p_flow_type: v.flowType,
        p_amount_cents: amountCents,
        p_entry_date: v.entryDate,
        p_notes: v.notes || undefined,
        p_source: "manual",
      }),
    );
    if (error) return { ok: false, error: error.message };
    const id = String(data ?? "");

    void logActivity({
      actor,
      action: "roi.cashflow_add",
      module: "roi",
      targetType: "investment",
      targetId: v.investmentId,
      summary: `Recorded ${v.flowType} entry on “${inv.name}”`,
      after: { flow_type: v.flowType, amount_cents: amountCents, entry_date: v.entryDate },
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCashflowAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("roi.delete");
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid entry" };

    const supabase = await createClient();
    // RLS on investment_cash_flows scopes this to entries the actor may see.
    const { data: vis } = await supabase
      .from("investment_cash_flows")
      .select("id, investment_id, flow_type")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    const flow = asRow<{ id: string; investment_id: string; flow_type: string }>(vis);
    if (!flow) return { ok: false, error: "Entry not found" };

    const { error } = await supabase.rpc(
      "delete_investment_cash_flow",
      rpcParams("delete_investment_cash_flow", { p_id: id }),
    );
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "roi.cashflow_delete",
      module: "roi",
      targetType: "investment",
      targetId: flow.investment_id,
      summary: `Deleted a ${flow.flow_type} ledger entry`,
      before: flow,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
