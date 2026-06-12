import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import type { SessionUser } from "@/lib/rbac/guards";
import type { ListQuery } from "@/lib/datatable/types";
import {
  buildPage,
  decodeCursor,
  keysetOrExpression,
  type ParsedListQuery,
} from "@/lib/datatable/server";
import type { ExportDataset } from "@/lib/export/types";
import { formatDateTime } from "@/lib/format";

export type MovementListRow = {
  id: string;
  movement_type: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  notes: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
  products: { name: string; sku: string } | null;
  users: { full_name: string } | null;
};

const LIST_COLUMNS =
  "id, movement_type, quantity, previous_stock, new_stock, notes, reference_type, reference_id, created_at, " +
  "products(name, sku), users!inventory_movements_created_by_fkey(full_name)";

/** Movements are a time-ordered ledger — created_at is the only sane sort. */
export const MOVEMENT_SORTABLE: Record<string, string> = {
  created_at: "created_at",
};

/**
 * One keyset page of inventory movements. The ledger is append-only, so this
 * is a pure time-scan riding idx_inv_mov_created (or the per-product composite
 * when filtered by product).
 */
export async function fetchMovementsPage(parsed: ParsedListQuery) {
  const supabase = await createClient();

  let query = supabase
    .from("inventory_movements")
    .select(LIST_COLUMNS, parsed.cursor ? {} : { count: "estimated" });

  // Keyword search scans notes + product (joined) name is not directly
  // searchable via or() across embeds — search notes and reference type here;
  // product-scoped history uses the product filter instead.
  if (parsed.q) {
    query = query.ilike("notes", `%${parsed.q.replaceAll("%", "\\%")}%`);
  }
  const product = parsed.filters["product"];
  if (product) query = query.eq("product_id", product);
  const type = parsed.filters["movement_type"];
  if (type) query = query.eq("movement_type", type);
  const from = parsed.filters["created_at_from"];
  const to = parsed.filters["created_at_to"];
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  if (parsed.cursor) {
    query = query.or(keysetOrExpression(parsed.cursor, parsed.sort, parsed.ascending));
  }

  const { data, error, count } = await query
    .order(parsed.sort, { ascending: parsed.ascending })
    .order("id", { ascending: parsed.ascending })
    .limit(parsed.limit + 1);

  if (error) throw new Error(error.message);
  return buildPage(asRows<MovementListRow>(data), parsed.limit, parsed.sort, count ?? null);
}

async function fetchMovementsForExport(
  query: ListQuery,
  _user: SessionUser,
  limit: number,
): Promise<MovementListRow[]> {
  const all: MovementListRow[] = [];
  let cursor: string | null = null;
  while (all.length < limit) {
    const page = await fetchMovementsPage({
      q: (query.q ?? "").trim().slice(0, 200),
      sort: "created_at",
      ascending: query.dir === "asc",
      cursor: decodeCursor(cursor),
      limit: Math.min(1_000, limit - all.length),
      filters: query.filters ?? {},
    });
    all.push(...page.rows);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return all;
}

export const movementsExportDataset: ExportDataset<MovementListRow> = {
  title: "Inventory Movements",
  slug: "inventory-movements",
  module: "inventory",
  permission: "inventory.view",
  columns: [
    { header: "When", value: (r) => formatDateTime(r.created_at), width: 1.6 },
    { header: "Product", value: (r) => r.products?.name ?? "", width: 2 },
    { header: "SKU", value: (r) => r.products?.sku ?? "", width: 1.2 },
    { header: "Type", value: (r) => r.movement_type },
    { header: "Qty", value: (r) => (r.quantity > 0 ? `+${r.quantity}` : String(r.quantity)) },
    { header: "Before", value: (r) => String(r.previous_stock) },
    { header: "After", value: (r) => String(r.new_stock) },
    { header: "By", value: (r) => r.users?.full_name ?? "System", width: 1.4 },
    { header: "Notes", value: (r) => r.notes, width: 2 },
  ],
  fetchRows: fetchMovementsForExport,
};
