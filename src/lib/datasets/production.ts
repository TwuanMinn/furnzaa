import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import {
  buildPage,
  ilikePattern,
  keysetOrExpression,
  type ParsedListQuery,
} from "@/lib/datatable/server";

export type ProductionOrderListRow = {
  id: string;
  code: string;
  quantity: number;
  status: string;
  material_cost_cents: number;
  labor_cost_cents: number;
  packaging_cost_cents: number;
  overhead_cost_cents: number;
  total_cost_cents: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  products: { id: string; name: string; sku: string } | null;
};

const LIST_COLUMNS =
  "id, code, quantity, status, material_cost_cents, labor_cost_cents, packaging_cost_cents, " +
  "overhead_cost_cents, total_cost_cents, started_at, completed_at, created_at, " +
  "products(id, name, sku)";

/** Allow-listed sortable columns (NOT NULL — keyset-safe). */
export const PRODUCTION_SORTABLE: Record<string, string> = {
  created_at: "created_at",
  code: "code",
};

/** One keyset page of production orders. */
export async function fetchProductionPage(parsed: ParsedListQuery) {
  const supabase = await createClient();

  let query = supabase
    .from("production_orders")
    .select(LIST_COLUMNS, parsed.cursor ? {} : { count: "estimated" })
    .is("deleted_at", null);

  if (parsed.q) query = query.ilike("code", ilikePattern(parsed.q));
  const status = parsed.filters["status"];
  if (status) query = query.eq("status", status);
  const product = parsed.filters["product"];
  if (product) query = query.eq("product_id", product);

  if (parsed.cursor) {
    query = query.or(keysetOrExpression(parsed.cursor, parsed.sort, parsed.ascending));
  }

  const { data, error, count } = await query
    .order(parsed.sort, { ascending: parsed.ascending })
    .order("id", { ascending: parsed.ascending })
    .limit(parsed.limit + 1);

  if (error) throw new Error(error.message);
  return buildPage(asRows<ProductionOrderListRow>(data), parsed.limit, parsed.sort, count ?? null);
}

export type BomLineRow = {
  id: string;
  quantity_per_unit: number;
  component: { id: string; name: string; sku: string; cost_price_cents: number; current_stock: number } | null;
};

/** BOM lines for a finished product (BOM editor + production preview). */
export async function fetchBomLines(finishedProductId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bill_of_materials")
    .select(
      "id, quantity_per_unit, component:products!bill_of_materials_component_product_id_fkey(id, name, sku, cost_price_cents, current_stock)",
    )
    .eq("finished_product_id", finishedProductId);
  if (error) throw new Error(error.message);
  return asRows<BomLineRow>(data);
}
