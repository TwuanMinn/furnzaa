import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRows, dbInsert, type Tables } from "@/lib/supabase/types";
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
import { formatDateTime } from "@/lib/format";

export type CustomerListRow = Pick<
  Tables<"customers">,
  "id" | "name" | "email" | "phone" | "is_active" | "created_at"
>;

const LIST_COLUMNS = "id, name, email, phone, is_active, created_at";

/** Allow-listed sortable columns (NOT NULL — keyset-safe). */
export const CUSTOMER_SORTABLE: Record<string, string> = {
  created_at: "created_at",
  name: "name",
};

/**
 * One keyset page of customers. Search hits the pg_trgm GIN indexes on
 * name/email/phone (ilike), never a sequential scan.
 */
export async function fetchCustomersPage(parsed: ParsedListQuery) {
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select(LIST_COLUMNS, parsed.cursor ? {} : { count: "estimated" })
    // Soft-deleted rows stay hidden unless the Inactive filter is chosen.
    .eq("is_active", parsed.filters["status"] !== "inactive");

  if (parsed.q) {
    query = query.or(ilikeAnyExpression(["name", "email", "phone"], parsed.q));
  }
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
  return buildPage(asRows<CustomerListRow>(data), parsed.limit, parsed.sort, count ?? null);
}

/** Iterate keyset pages (1k each) to stream up to `limit` rows for export. */
async function fetchCustomersForExport(
  query: ListQuery,
  _user: SessionUser,
  limit: number,
): Promise<CustomerListRow[]> {
  const all: CustomerListRow[] = [];
  let cursor: string | null = null;
  while (all.length < limit) {
    const page = await fetchCustomersPage({
      q: (query.q ?? "").trim().slice(0, 200),
      sort: CUSTOMER_SORTABLE[query.sort ?? ""] ? (query.sort as string) : "created_at",
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

export const customersExportDataset: ExportDataset<CustomerListRow> = {
  title: "Customers",
  slug: "customers",
  module: "customers",
  permission: "customers.view",
  columns: [
    { header: "Name", value: (r) => r.name, width: 2 },
    { header: "Email", value: (r) => r.email, width: 2 },
    { header: "Phone", value: (r) => r.phone, width: 1.4 },
    { header: "Status", value: (r) => (r.is_active ? "Active" : "Inactive") },
    { header: "Created", value: (r) => formatDateTime(r.created_at), width: 1.6 },
  ],
  fetchRows: fetchCustomersForExport,
};

const IMPORT_FIELDS = [
  { key: "name", label: "Name", type: "text", required: true, maxLength: 200, example: "Ada Lovelace" },
  { key: "email", label: "Email", type: "email", maxLength: 320, example: "ada@example.com" },
  { key: "phone", label: "Phone", type: "phone", maxLength: 25, example: "+1 555 010 2030" },
  { key: "notes", label: "Notes", type: "text", maxLength: 2000 },
] satisfies ImportDataset["fields"];

async function insertCustomerRows(
  rows: ValidatedRow[],
  _user: SessionUser,
): Promise<ImportCommitResult> {
  const supabase = await createClient();
  let inserted = 0;
  const errors: RowError[] = [];

  for (const batch of chunk(rows)) {
    const payload = batch.map((r) => ({
      name: String(r.values["name"] ?? ""),
      email: (r.values["email"] as string | null) ?? null,
      phone: (r.values["phone"] as string | null) ?? null,
      notes: (r.values["notes"] as string | null) ?? null,
    }));
    const { error, count } = await supabase
      .from("customers")
      .insert(dbInsert("customers", payload), { count: "exact" });
    if (error) {
      // Batch failed wholesale (constraint/connection) — report every row.
      for (const r of batch) errors.push({ row: r.row, field: "name", message: error.message });
    } else {
      inserted += count ?? batch.length;
    }
  }

  return { inserted, skipped: errors.length, errors };
}

export const customersImportDataset: ImportDataset = {
  title: "Customers",
  slug: "customers",
  module: "customers",
  permission: "customers.edit",
  fields: IMPORT_FIELDS,
  insertRows: insertCustomerRows,
};
