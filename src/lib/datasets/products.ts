import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRows, dbInsert } from "@/lib/supabase/types";
import type { SessionUser } from "@/lib/rbac/guards";
import type { ListQuery } from "@/lib/datatable/types";
import {
  buildPage,
  decodeCursor,
  ilikeAnyExpression,
  keysetOrExpression,
  type ParsedListQuery,
} from "@/lib/datatable/server";
import type { ExportDataset } from "@/lib/export/types";
import { chunk, type ImportDataset } from "@/lib/import/server";
import type { ImportCommitResult, RowError, ValidatedRow } from "@/lib/import/types";
import { centsToDecimalString, formatDateTime } from "@/lib/format";

export type ProductListRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  image_url: string | null;
  description: string | null;
  cost_price_cents: number;
  selling_price_cents: number;
  labor_cost_cents: number;
  packaging_cost_cents: number;
  overhead_cost_cents: number;
  current_stock: number;
  minimum_stock: number;
  low_stock: boolean;
  status: string;
  is_active: boolean;
  category_id: string | null;
  created_at: string;
  product_categories: { name: string } | null;
};

const LIST_COLUMNS =
  "id, sku, barcode, name, image_url, description, cost_price_cents, selling_price_cents, " +
  "labor_cost_cents, packaging_cost_cents, overhead_cost_cents, current_stock, minimum_stock, " +
  "low_stock, status, is_active, category_id, created_at, product_categories(name)";

/** Allow-listed sortable columns (NOT NULL — keyset-safe). */
export const PRODUCT_SORTABLE: Record<string, string> = {
  created_at: "created_at",
  name: "name",
  sku: "sku",
  current_stock: "current_stock",
  selling_price_cents: "selling_price_cents",
};

/** One keyset page of products. Search hits the name/sku trigram indexes. */
export async function fetchProductsPage(parsed: ParsedListQuery) {
  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select(LIST_COLUMNS, parsed.cursor ? {} : { count: "estimated" })
    .is("deleted_at", null);

  if (parsed.q) {
    query = query.or(ilikeAnyExpression(["name", "sku", "barcode"], parsed.q));
  }
  const category = parsed.filters["category"];
  if (category) query = query.eq("category_id", category);
  const status = parsed.filters["status"];
  if (status) query = query.eq("status", status);
  if (parsed.filters["stock"] === "low") query = query.eq("low_stock", true);
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
  return buildPage(asRows<ProductListRow>(data), parsed.limit, parsed.sort, count ?? null);
}

async function fetchProductsForExport(
  query: ListQuery,
  _user: SessionUser,
  limit: number,
): Promise<ProductListRow[]> {
  const all: ProductListRow[] = [];
  let cursor: string | null = null;
  while (all.length < limit) {
    const page = await fetchProductsPage({
      q: (query.q ?? "").trim().slice(0, 200),
      sort: PRODUCT_SORTABLE[query.sort ?? ""] ? (query.sort as string) : "created_at",
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

export const productsExportDataset: ExportDataset<ProductListRow> = {
  title: "Products",
  slug: "products",
  module: "products",
  permission: "products.export",
  columns: [
    { header: "SKU", value: (r) => r.sku, width: 1.3 },
    { header: "Name", value: (r) => r.name, width: 2.2 },
    { header: "Category", value: (r) => r.product_categories?.name ?? "", width: 1.3 },
    { header: "Barcode", value: (r) => r.barcode, width: 1.2 },
    { header: "Cost", value: (r) => centsToDecimalString(r.cost_price_cents, "VND") },
    { header: "Price", value: (r) => centsToDecimalString(r.selling_price_cents, "VND") },
    { header: "Stock", value: (r) => String(r.current_stock) },
    { header: "Min", value: (r) => String(r.minimum_stock) },
    { header: "Status", value: (r) => r.status },
    { header: "Created", value: (r) => formatDateTime(r.created_at), width: 1.5 },
  ],
  fetchRows: fetchProductsForExport,
};

const IMPORT_FIELDS = [
  { key: "name", label: "Product name", type: "text", required: true, maxLength: 200, example: "Hex Desk Organizer" },
  { key: "category", label: "Category", type: "text", maxLength: 120, example: "Functional Parts" },
  { key: "barcode", label: "Barcode", type: "text", maxLength: 64 },
  { key: "description", label: "Description", type: "text", maxLength: 4000 },
  { key: "cost_price", label: "Cost price", type: "number", example: "3.50" },
  { key: "selling_price", label: "Selling price", type: "number", required: true, example: "19.99" },
  { key: "minimum_stock", label: "Minimum stock", type: "number", example: "10" },
  { key: "initial_stock", label: "Initial stock", type: "number", example: "50" },
  {
    key: "status", label: "Status", type: "select",
    options: ["active", "inactive", "discontinued"], example: "active",
  },
] satisfies ImportDataset["fields"];

/**
 * Bulk product import. SKUs are generated via the document-number RPC (modest
 * concurrency), rows insert in 1,000-row chunks, unknown categories are created
 * on the fly, and any "initial_stock" lands through the atomic movement RPC so
 * the ledger stays the single source of stock truth.
 */
async function insertProductRows(rows: ValidatedRow[], user: SessionUser): Promise<ImportCommitResult> {
  const admin = createAdminClient();
  const errors: RowError[] = [];

  // Resolve / create categories (case-insensitive).
  const { data: catData } = await admin.from("product_categories").select("id, name").limit(5_000);
  const catByName = new Map(
    asRows<{ id: string; name: string }>(catData).map((c) => [c.name.toLowerCase(), c.id]),
  );
  const wanted = [
    ...new Set(
      rows
        .map((r) => String(r.values["category"] ?? "").trim())
        .filter(Boolean)
        .map((n) => n.toLowerCase()),
    ),
  ].filter((n) => !catByName.has(n));
  for (const lower of wanted) {
    const original =
      rows
        .map((r) => String(r.values["category"] ?? "").trim())
        .find((n) => n.toLowerCase() === lower) ?? lower;
    const { data: created } = await admin
      .from("product_categories")
      .insert(dbInsert("product_categories", { name: original }))
      .select("id")
      .single();
    if (created) catByName.set(lower, (created as { id: string }).id);
  }

  // Generate SKUs with modest concurrency, then insert in 1,000-row chunks.
  const CONCURRENCY = 8;
  const prepared: Array<{ row: ValidatedRow; sku: string }> = [];
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const slice = rows.slice(i, i + CONCURRENCY);
    const skus = await Promise.all(
      slice.map(async (row) => {
        const { data, error } = await admin.rpc("next_document_number", { p_prefix: "SKU" });
        return error ? { row, sku: null as string | null } : { row, sku: data as string };
      }),
    );
    for (const s of skus) {
      if (!s.sku) errors.push({ row: s.row.row, field: "name", message: "Failed to generate SKU" });
      else prepared.push({ row: s.row, sku: s.sku });
    }
  }

  let inserted = 0;
  const stockToApply: Array<{ productId: string; qty: number }> = [];
  for (const batch of chunk(prepared, 1_000)) {
    const payload = batch.map(({ row, sku }) => {
      const v = row.values;
      const categoryName = String(v["category"] ?? "").trim().toLowerCase();
      return {
        sku,
        name: String(v["name"] ?? "").trim(),
        category_id: categoryName ? (catByName.get(categoryName) ?? null) : null,
        barcode: String(v["barcode"] ?? "").trim() || null,
        description: String(v["description"] ?? "").trim() || null,
        cost_price_cents: Math.round(Number(v["cost_price"] ?? 0) * 100) || 0,
        selling_price_cents: Math.round(Number(v["selling_price"] ?? 0) * 100) || 0,
        minimum_stock: Math.max(0, Math.trunc(Number(v["minimum_stock"] ?? 0))) || 0,
        status: (v["status"] as string) || "active",
        created_by: user.id,
        updated_by: user.id,
      };
    });
    const { data, error } = await admin
      .from("products")
      .insert(dbInsert("products", payload))
      .select("id, sku");
    if (error) {
      for (const { row } of batch) {
        errors.push({ row: row.row, field: "name", message: error.message });
      }
      continue;
    }
    inserted += batch.length;
    // Map inserted ids back to requested initial stock.
    const bySku = new Map(asRows<{ id: string; sku: string }>(data).map((p) => [p.sku, p.id]));
    for (const { row, sku } of batch) {
      const qty = Math.trunc(Number(row.values["initial_stock"] ?? 0));
      const id = bySku.get(sku);
      if (id && qty > 0) stockToApply.push({ productId: id, qty });
    }
  }

  // Opening stock through the ledger RPC (atomic per product).
  for (let i = 0; i < stockToApply.length; i += CONCURRENCY) {
    const slice = stockToApply.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(({ productId, qty }) =>
        admin.rpc("apply_inventory_movement", {
          p_product_id: productId,
          p_movement_type: "purchase",
          p_quantity: qty,
          p_notes: "CSV import — opening stock",
        }),
      ),
    );
  }

  return { inserted, skipped: errors.length, errors };
}

export const productsImportDataset: ImportDataset = {
  title: "Products",
  slug: "products",
  module: "products",
  permission: "products.import",
  fields: IMPORT_FIELDS,
  insertRows: insertProductRows,
};
