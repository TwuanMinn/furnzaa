/**
 * Cost Calculator math (spec v5, Module 4 Tab 2). Pure functions shared by the
 * client (live results) and the save action (snapshot persisted to history).
 * All money values are PLAIN đồng (display units) — the calculator is a
 * scratchpad, not part of the ×100 ledger convention. Empty inputs are 0.
 */

export interface CalcInputs {
  name: string;
  material: string; // material key from Settings
  filamentCostPerKg: number; // ₫/kg
  filamentUsedGrams: number;
  wastePercent: number;
  printTimeHours: number;
  electricityRate: number; // ₫/kWh
  printerWatts: number;
  laborCost: number; // ₫
  sellingPrice: number; // ₫
  otherCosts: number; // ₫
  targetMarginPercent: number;
  quantity: number; // batch size, default 1 (display-only, not persisted)
}

export type MarginStatus = "ok" | "low" | "loss";

export interface CalcResults {
  filamentWithWasteGrams: number;
  materialCost: number;
  electricityCost: number;
  totalCost: number;
  profit: number;
  marginPercent: number;
  roiPercent: number;
  marginStatus: MarginStatus;
  /** Price at which margin = 0% (totalCost). */
  breakEvenPrice: number;
  /** Price that achieves the target margin. */
  recommendedPrice: number;
  /** totalCost × quantity */
  batchTotalCost: number;
  /** profit × quantity */
  batchProfit: number;
  /** How many units you can make from a 1 kg spool. */
  unitsPerKg: number;
  /** How many units you can make from a 3 kg spool. */
  unitsPer3Kg: number;
  /** How many units you can make from a 5 kg spool. */
  unitsPer5Kg: number;
}

export const CALC_DEFAULTS: CalcInputs = {
  name: "",
  material: "petg",
  filamentCostPerKg: 0,
  filamentUsedGrams: 0,
  wastePercent: 10,
  printTimeHours: 0,
  electricityRate: 3500,
  printerWatts: 150,
  laborCost: 0,
  sellingPrice: 0,
  otherCosts: 0,
  targetMarginPercent: 20,
  quantity: 1,
};

const num = (v: number | null | undefined) => (Number.isFinite(v) ? Number(v) : 0);

/** Spec formulas, verbatim. */
export function computeCalc(inputs: CalcInputs): CalcResults {
  const filamentUsed = num(inputs.filamentUsedGrams);
  const waste = num(inputs.wastePercent);
  const filamentWithWasteGrams = filamentUsed * (1 + waste / 100);
  const materialCost = (filamentWithWasteGrams / 1000) * num(inputs.filamentCostPerKg);
  const electricityCost =
    num(inputs.printTimeHours) * (num(inputs.printerWatts) / 1000) * num(inputs.electricityRate);
  const totalCost = materialCost + electricityCost + num(inputs.laborCost) + num(inputs.otherCosts);
  const sellingPrice = num(inputs.sellingPrice);
  const profit = sellingPrice - totalCost;
  const marginPercent = sellingPrice === 0 ? 0 : (profit / sellingPrice) * 100;
  const roiPercent = totalCost === 0 ? 0 : (profit / totalCost) * 100;
  const marginStatus: MarginStatus =
    profit < 0 ? "loss" : marginPercent < num(inputs.targetMarginPercent) ? "low" : "ok";

  // Break-even = totalCost; recommended = totalCost / (1 - target/100)
  const breakEvenPrice = totalCost;
  const target = num(inputs.targetMarginPercent);
  const recommendedPrice = target >= 100 ? 0 : totalCost / (1 - target / 100);

  // Batch (display-only multiplier, not persisted)
  const qty = Math.max(num(inputs.quantity), 1);
  const batchTotalCost = totalCost * qty;
  const batchProfit = profit * qty;

  // Yield estimate: how many units per spool (floor, whole units only)
  const unitsPerKg = filamentWithWasteGrams > 0 ? Math.floor(1000 / filamentWithWasteGrams) : 0;
  const unitsPer3Kg = filamentWithWasteGrams > 0 ? Math.floor(3000 / filamentWithWasteGrams) : 0;
  const unitsPer5Kg = filamentWithWasteGrams > 0 ? Math.floor(5000 / filamentWithWasteGrams) : 0;

  return {
    filamentWithWasteGrams,
    materialCost,
    electricityCost,
    totalCost,
    profit,
    marginPercent,
    roiPercent,
    marginStatus,
    breakEvenPrice,
    recommendedPrice,
    batchTotalCost,
    batchProfit,
    unitsPerKg,
    unitsPer3Kg,
    unitsPer5Kg,
  };
}

/** Re-evaluate a SAVED entry's status against the CURRENT target margin (spec). */
export function statusAgainstTarget(
  profit: number,
  marginPercent: number,
  currentTargetPercent: number,
): MarginStatus {
  return profit < 0 ? "loss" : marginPercent < currentTargetPercent ? "low" : "ok";
}

/** Row shape of the cost_calculations table the UI consumes. */
export interface SavedCalculation {
  id: string;
  name: string;
  material: string;
  filament_cost_per_kg: number;
  filament_used_grams: number;
  waste_percent: number;
  print_time_hours: number;
  electricity_rate: number;
  printer_watts: number;
  labor_cost: number;
  selling_price: number;
  other_costs: number;
  target_margin_percent: number;
  filament_with_waste_g: number;
  material_cost: number;
  electricity_cost: number;
  total_cost: number;
  profit: number;
  margin_percent: number;
  roi_percent: number;
  created_at: string;
}

/** History analytics (spec): totals + best/worst by margin (ties → profit). */
export function summarizeHistory(rows: SavedCalculation[]) {
  const totalProfit = rows.reduce((s, r) => s + Number(r.profit), 0);
  const totalRevenue = rows.reduce((s, r) => s + Number(r.selling_price), 0);
  const overallMargin = totalRevenue === 0 ? 0 : (totalProfit / totalRevenue) * 100;
  const totalFilament = rows.reduce((s, r) => s + Number(r.filament_with_waste_g), 0);
  const totalHours = rows.reduce((s, r) => s + Number(r.print_time_hours), 0);

  const ranked = [...rows].sort(
    (a, b) =>
      Number(b.margin_percent) - Number(a.margin_percent) || Number(b.profit) - Number(a.profit),
  );
  const best = ranked[0] ?? null;
  const worst = ranked.length > 1 ? ranked[ranked.length - 1]! : null;

  const topByProfit = [...rows]
    .sort((a, b) => Number(b.profit) - Number(a.profit))
    .slice(0, 5);

  return { totalProfit, totalRevenue, overallMargin, totalFilament, totalHours, best, worst, topByProfit };
}
