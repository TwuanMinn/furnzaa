"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { asRow, asRows, dbInsert, dbUpdate } from "@/lib/supabase/types";
import { requirePermission } from "@/lib/rbac/guards";
import { fail, type ActionResult } from "@/lib/actions/result";
import { logActivity } from "@/lib/activity/log";
import { computeCalc, type CalcInputs } from "./calculator";

/**
 * Cost-calculator history actions (spec v5). The table is a PRIVATE per-user
 * scratchpad — RLS pins every row to auth.uid(); these actions add validation,
 * snapshot computation (server-side, never trusting client math) and the
 * required activity-log entries for saves/deletes.
 */

export type CalcActionResult<T = undefined> = ActionResult<T>;

const money = z.coerce.number().min(0).max(1_000_000_000_000).default(0);
const calcInputSchema = z.object({
  name: z.string().trim().max(200).default(""),
  material: z.string().trim().min(1).max(60),
  filamentCostPerKg: money,
  filamentUsedGrams: z.coerce.number().min(0).max(1_000_000).default(0),
  wastePercent: z.coerce.number().min(0).max(500).default(10),
  printTimeHours: z.coerce.number().min(0).max(10_000).default(0),
  electricityRate: money,
  printerWatts: z.coerce.number().min(0).max(100_000).default(150),
  laborCost: money,
  sellingPrice: money,
  otherCosts: money,
  targetMarginPercent: z.coerce.number().min(0).max(100).default(20),
  quantity: z.coerce.number().min(1).max(100_000).default(1),
});

export async function saveCalculationAction(
  input: CalcInputs,
): Promise<CalcActionResult<{ id: string }>> {
  try {
    const actor = await requirePermission("profit.view");
    const parsed = calcInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;
    // Snapshot is computed SERVER-side from validated inputs.
    const r = computeCalc(v);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cost_calculations")
      .insert(
        dbInsert("cost_calculations", {
          user_id: actor.id,
          name: v.name,
          material: v.material,
          filament_cost_per_kg: v.filamentCostPerKg,
          filament_used_grams: v.filamentUsedGrams,
          waste_percent: v.wastePercent,
          print_time_hours: v.printTimeHours,
          electricity_rate: v.electricityRate,
          printer_watts: v.printerWatts,
          labor_cost: v.laborCost,
          selling_price: v.sellingPrice,
          other_costs: v.otherCosts,
          target_margin_percent: v.targetMarginPercent,
          filament_with_waste_g: Math.round(r.filamentWithWasteGrams * 100) / 100,
          material_cost: Math.round(r.materialCost * 100) / 100,
          electricity_cost: Math.round(r.electricityCost * 100) / 100,
          total_cost: Math.round(r.totalCost * 100) / 100,
          profit: Math.round(r.profit * 100) / 100,
          margin_percent: Math.round(r.marginPercent * 100) / 100,
          roi_percent: Math.round(r.roiPercent * 100) / 100,
        }),
      )
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Failed to save calculation" };
    const id = (data as { id: string }).id;

    void logActivity({
      actor,
      action: "cost_calc.save",
      module: "profit",
      targetType: "cost_calculation",
      targetId: id,
      summary: `Saved cost calculation “${v.name || "Unnamed product"}” (${v.material})`,
      after: { total_cost: r.totalCost, profit: r.profit, margin_percent: r.marginPercent },
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCalculationAction(id: string): Promise<CalcActionResult> {
  try {
    const actor = await requirePermission("profit.view");
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid entry" };

    const supabase = await createClient();
    // RLS pins reads/writes to the owner; fetch first for the log summary.
    const { data: beforeData } = await supabase
      .from("cost_calculations")
      .select("name, material, profit")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    const before = asRow<{ name: string; material: string; profit: number }>(beforeData);
    if (!before) return { ok: false, error: "Entry not found" };

    const { error } = await supabase
      .from("cost_calculations")
      .update(dbUpdate("cost_calculations", {
        is_active: false,
        deleted_at: new Date().toISOString(),
      }))
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "cost_calc.delete",
      module: "profit",
      targetType: "cost_calculation",
      targetId: id,
      summary: `Deleted cost calculation “${before.name || "Unnamed product"}”`,
      before,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function clearAllCalculationsAction(): Promise<CalcActionResult<{ cleared: number }>> {
  try {
    const actor = await requirePermission("profit.view");

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("cost_calculations")
      .update(dbUpdate("cost_calculations", {
        is_active: false,
        deleted_at: new Date().toISOString(),
      }))
      .eq("user_id", actor.id)
      .is("deleted_at", null)
      .select("id");
    if (error) return { ok: false, error: error.message };
    const cleared = asRows<{ id: string }>(data).length;

    void logActivity({
      actor,
      action: "cost_calc.clear",
      module: "profit",
      targetType: "cost_calculation",
      summary: `Cleared cost-calculator history (${cleared} entr${cleared === 1 ? "y" : "ies"})`,
      before: { cleared },
    });
    return { ok: true, data: { cleared } };
  } catch (e) {
    return fail(e);
  }
}
