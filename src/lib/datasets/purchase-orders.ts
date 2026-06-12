import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import {
  buildPage,
  ilikePattern,
  keysetOrExpression,
  type ParsedListQuery,
} from "@/lib/datatable/server";

export type PurchaseOrderListRow = {
  id: string;
  po_number: string;
  order_date: string;
  status: string;
  total_cost_cents: number;
  created_at: string;
  received_at: string | null;
  suppliers: { id: string; company_name: string } | null;
  created_by_user: { full_name: string } | null;
};

const LIST_COLUMNS =
  "id, po_number, order_date, status, total_cost_cents, created_at, received_at, " +
  "suppliers(id, company_name), created_by_user:users!purchase_orders_created_by_fkey(full_name)";

/** Allow-listed sortable columns (NOT NULL — keyset-safe). */
export const PO_SORTABLE: Record<string, string> = {
  created_at: "created_at",
  order_date: "order_date",
  po_number: "po_number",
  total_cost_cents: "total_cost_cents",
};

/** One keyset page of purchase orders. */
export async function fetchPurchaseOrdersPage(parsed: ParsedListQuery) {
  const supabase = await createClient();

  let query = supabase
    .from("purchase_orders")
    .select(LIST_COLUMNS, parsed.cursor ? {} : { count: "estimated" })
    .is("deleted_at", null);

  if (parsed.q) query = query.ilike("po_number", ilikePattern(parsed.q));
  const status = parsed.filters["status"];
  if (status) query = query.eq("status", status);
  const supplier = parsed.filters["supplier"];
  if (supplier) query = query.eq("supplier_id", supplier);
  const from = parsed.filters["order_date_from"];
  const to = parsed.filters["order_date_to"];
  if (from) query = query.gte("order_date", from);
  if (to) query = query.lte("order_date", to);

  if (parsed.cursor) {
    query = query.or(keysetOrExpression(parsed.cursor, parsed.sort, parsed.ascending));
  }

  const { data, error, count } = await query
    .order(parsed.sort, { ascending: parsed.ascending })
    .order("id", { ascending: parsed.ascending })
    .limit(parsed.limit + 1);

  if (error) throw new Error(error.message);
  return buildPage(asRows<PurchaseOrderListRow>(data), parsed.limit, parsed.sort, count ?? null);
}

export type PurchaseOrderItemRow = {
  id: string;
  quantity: number;
  unit_cost_cents: number;
  line_total_cents: number;
  products: { id: string; name: string; sku: string } | null;
};

/** Line items for one PO (detail sheet). */
export async function fetchPurchaseOrderItems(purchaseOrderId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_order_items")
    .select("id, quantity, unit_cost_cents, line_total_cents, products(id, name, sku)")
    .eq("purchase_order_id", purchaseOrderId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return asRows<PurchaseOrderItemRow>(data);
}
