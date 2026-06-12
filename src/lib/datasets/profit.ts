import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows } from "@/lib/supabase/types";
import type { SessionUser } from "@/lib/rbac/guards";
import type { ListQuery } from "@/lib/datatable/types";
import type { ExportDataset } from "@/lib/export/types";
import { centsToDecimalString } from "@/lib/format";

/**
 * Profit & Cost Analysis (Module 4) — every number here comes from the
 * materialized views refreshed by pg_cron (0013/0015/0017), never from raw
 * order scans. The MVs are NOT readable by `authenticated`: access goes
 * through the service role AFTER the caller passes the profit.view guard.
 */

export interface ProfitDailyRow {
  day: string;
  orders_count: number;
  revenue_cents: number;
  discount_cents: number;
  cogs_cents: number;
  print_material_cost_cents: number;
  total_cost_cents: number;
  gross_profit_cents: number;
  print_minutes: number;
  filament_grams: number;
}

export interface ProductProfitRow {
  product_id: string;
  sku: string;
  name: string;
  status: string;
  category_name: string | null;
  selling_price_cents: number;
  production_cost_cents: number;
  profit_per_unit_cents: number;
  margin_percent: number;
  units_sold: number;
  revenue_cents: number;
  cogs_cents: number;
  gross_profit_cents: number;
  last_sold_at: string | null;
}

export interface PrinterStatRow {
  printer_id: string;
  brand: string;
  model: string;
  badge_color: string;
  orders_count: number;
  revenue_cents: number;
  material_cost_cents: number;
  print_minutes: number;
  filament_grams: number;
}

export interface MaterialStatRow {
  material_type: string;
  orders_count: number;
  revenue_cents: number;
  material_cost_cents: number;
  filament_grams: number;
}

export interface ProfitData {
  daily: ProfitDailyRow[];
  kpis: {
    revenueCents: number;
    totalCostCents: number;
    grossProfitCents: number;
    marginPercent: number;
    ordersCount: number;
    printMinutes: number;
  };
  products: ProductProfitRow[];
  printers: PrinterStatRow[];
  materials: MaterialStatRow[];
  inventory: { valueCostCents: number; valueRetailCents: number; lowStockProducts: number } | null;
}

/** Read the cached aggregates, date-scoping the time series + KPIs. */
export async function readProfitData(from: string | null, to: string | null): Promise<ProfitData> {
  const admin = createAdminClient();

  let dailyQuery = admin
    .from("mv_revenue_daily")
    .select("*")
    .order("day", { ascending: true })
    .limit(740); // two years of days, hard bound
  if (from) dailyQuery = dailyQuery.gte("day", from);
  if (to) dailyQuery = dailyQuery.lte("day", to);

  const [dailyRes, productsRes, printersRes, materialsRes, inventoryRes] = await Promise.all([
    dailyQuery,
    admin
      .from("mv_product_profitability")
      .select("*")
      .order("revenue_cents", { ascending: false })
      .limit(200),
    admin.from("mv_printer_stats").select("*").order("revenue_cents", { ascending: false }).limit(50),
    admin.from("mv_material_stats").select("*").order("revenue_cents", { ascending: false }).limit(50),
    admin.from("mv_inventory_value").select("*").maybeSingle(),
  ]);

  if (dailyRes.error) throw new Error(dailyRes.error.message);
  if (productsRes.error) throw new Error(productsRes.error.message);

  const daily = asRows<ProfitDailyRow>(dailyRes.data);
  const kpis = daily.reduce(
    (acc, d) => ({
      revenueCents: acc.revenueCents + d.revenue_cents,
      totalCostCents: acc.totalCostCents + d.total_cost_cents,
      grossProfitCents: acc.grossProfitCents + d.gross_profit_cents,
      ordersCount: acc.ordersCount + d.orders_count,
      printMinutes: acc.printMinutes + Number(d.print_minutes ?? 0),
      marginPercent: 0,
    }),
    { revenueCents: 0, totalCostCents: 0, grossProfitCents: 0, ordersCount: 0, printMinutes: 0, marginPercent: 0 },
  );
  kpis.marginPercent =
    kpis.revenueCents > 0 ? Math.round((kpis.grossProfitCents / kpis.revenueCents) * 1000) / 10 : 0;

  const inventoryRow = asRow<{
    value_cost_cents: number;
    value_retail_cents: number;
    low_stock_products: number;
  }>(inventoryRes.data);

  return {
    daily,
    kpis,
    products: asRows<ProductProfitRow>(productsRes.data),
    printers: asRows<PrinterStatRow>(printersRes.data),
    materials: asRows<MaterialStatRow>(materialsRes.data),
    inventory: inventoryRow
      ? {
          valueCostCents: inventoryRow.value_cost_cents,
          valueRetailCents: inventoryRow.value_retail_cents,
          lowStockProducts: inventoryRow.low_stock_products,
        }
      : null,
  };
}

/** Export: the product-profitability table (all-time, from the MV). */
async function fetchProfitForExport(
  _query: ListQuery,
  _user: SessionUser,
  limit: number,
): Promise<ProductProfitRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mv_product_profitability")
    .select("*")
    .order("revenue_cents", { ascending: false })
    .limit(Math.min(limit, 10_000));
  if (error) throw new Error(error.message);
  return asRows<ProductProfitRow>(data);
}

export const profitExportDataset: ExportDataset<ProductProfitRow> = {
  title: "Product Profitability",
  slug: "profit",
  module: "profit",
  permission: "profit.export",
  columns: [
    { header: "Product", value: (r) => r.name, width: 2 },
    { header: "SKU", value: (r) => r.sku, width: 1.2 },
    { header: "Category", value: (r) => r.category_name ?? "", width: 1.2 },
    { header: "Units sold", value: (r) => r.units_sold, align: "right", width: 0.8 },
    { header: "Revenue", value: (r) => centsToDecimalString(r.revenue_cents, "VND"), align: "right" },
    { header: "Prod. cost/unit", value: (r) => centsToDecimalString(r.production_cost_cents, "VND"), align: "right" },
    { header: "Profit/unit", value: (r) => centsToDecimalString(r.profit_per_unit_cents, "VND"), align: "right" },
    { header: "Margin %", value: (r) => r.margin_percent, align: "right", width: 0.8 },
    { header: "Gross profit", value: (r) => centsToDecimalString(r.gross_profit_cents, "VND"), align: "right" },
  ],
  fetchRows: fetchProfitForExport,
};
