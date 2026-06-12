import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import type { SessionUser } from "@/lib/rbac/guards";
import type { ListQuery } from "@/lib/datatable/types";
import type { ExportDataset } from "@/lib/export/types";
import { summarizeHistory, type SavedCalculation } from "@/lib/profit/calculator";
import { formatDateTime } from "@/lib/format";

/**
 * Cost-calculator history export (spec v5: "Export Excel" — a spreadsheet via
 * the shared export service; CSV opens directly in Excel). One row per saved
 * calculation plus a TOTAL row at the bottom. RLS scopes the query to the
 * caller's own rows — the export can never contain anyone else's scratchpad.
 */

type ExportRow = SavedCalculation & { is_total?: boolean };

const fmt = (n: number, digits = 0) => Number(n).toFixed(digits);

async function fetchCalculationsForExport(
  _query: ListQuery,
  user: SessionUser,
  limit: number,
): Promise<ExportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cost_calculations")
    .select(
      "id, name, material, filament_cost_per_kg, filament_used_grams, waste_percent, print_time_hours, " +
        "electricity_rate, printer_watts, labor_cost, selling_price, other_costs, target_margin_percent, " +
        "filament_with_waste_g, material_cost, electricity_cost, total_cost, profit, margin_percent, " +
        "roi_percent, created_at",
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 10_000));
  if (error) throw new Error(error.message);

  const rows = asRows<SavedCalculation>(data);
  if (rows.length === 0) return [];

  const s = summarizeHistory(rows);
  const total: ExportRow = {
    id: "total",
    name: "TOTAL",
    material: "",
    filament_cost_per_kg: 0,
    filament_used_grams: 0,
    waste_percent: 0,
    print_time_hours: s.totalHours,
    electricity_rate: 0,
    printer_watts: 0,
    labor_cost: 0,
    selling_price: s.totalRevenue,
    other_costs: 0,
    target_margin_percent: 0,
    filament_with_waste_g: s.totalFilament,
    material_cost: 0,
    electricity_cost: 0,
    total_cost: s.totalRevenue - s.totalProfit,
    profit: s.totalProfit,
    margin_percent: s.overallMargin,
    roi_percent: 0,
    created_at: "",
    is_total: true,
  };
  return [...rows, total];
}

export const costCalculationsExportDataset: ExportDataset<ExportRow> = {
  title: "Cost Calculations",
  slug: "cost-calculations",
  module: "profit",
  permission: "profit.view",
  columns: [
    { header: "Product", value: (r) => r.name || (r.is_total ? "TOTAL" : "Unnamed product"), width: 1.8 },
    { header: "Material", value: (r) => r.material, width: 0.9 },
    { header: "Filament (g, w/ waste)", value: (r) => fmt(r.filament_with_waste_g, 1), align: "right" },
    { header: "Print time (h)", value: (r) => fmt(r.print_time_hours, 2), align: "right" },
    { header: "Material cost (₫)", value: (r) => (r.is_total ? "" : fmt(r.material_cost)), align: "right" },
    { header: "Electricity (₫)", value: (r) => (r.is_total ? "" : fmt(r.electricity_cost)), align: "right" },
    { header: "Labor (₫)", value: (r) => (r.is_total ? "" : fmt(r.labor_cost)), align: "right" },
    { header: "Other (₫)", value: (r) => (r.is_total ? "" : fmt(r.other_costs)), align: "right" },
    { header: "Total cost (₫)", value: (r) => fmt(r.total_cost), align: "right" },
    { header: "Sell price (₫)", value: (r) => fmt(r.selling_price), align: "right" },
    { header: "Profit (₫)", value: (r) => fmt(r.profit), align: "right" },
    { header: "Margin %", value: (r) => fmt(r.margin_percent, 1), align: "right" },
    { header: "ROI %", value: (r) => (r.is_total ? "" : fmt(r.roi_percent, 1)), align: "right" },
    { header: "Saved", value: (r) => (r.created_at ? formatDateTime(r.created_at) : ""), width: 1.4 },
  ],
  fetchRows: fetchCalculationsForExport,
};
