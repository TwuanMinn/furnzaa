import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRows, dbInsert } from "@/lib/supabase/types";
import type { SessionUser } from "@/lib/rbac/guards";
import type { ListQuery } from "@/lib/datatable/types";
import {
  buildPage,
  decodeCursor,
  ilikeAnyExpression,
  ilikePattern,
  keysetOrExpression,
  pgLiteral,
  type ParsedListQuery,
} from "@/lib/datatable/server";
import type { ExportDataset } from "@/lib/export/types";
import { chunk, type ImportDataset } from "@/lib/import/server";
import type { ImportCommitResult, RowError, ValidatedRow } from "@/lib/import/types";
import { centsToDecimalString, formatDate, formatMinutes, toCents } from "@/lib/format";

export type OrderListRow = {
  id: string;
  order_code: string;
  buying_date: string;
  priority: string;
  status: string;
  payment_status: string;
  total_cents: number;
  currency: string;
  delivery_date: string | null;
  printer_id: string | null;
  print_state: string;
  print_started_at: string | null;
  material_type: string | null;
  actual_print_minutes: number | null;
  estimated_print_minutes: number | null;
  created_at: string;
  customers: { id: string; name: string } | null;
  printers: { brand: string; model: string; badge_color: string } | null;
  assigned: { id: string; full_name: string } | null;
};

const LIST_COLUMNS =
  "id, order_code, buying_date, priority, status, payment_status, total_cents, currency, delivery_date, printer_id, print_state, print_started_at, material_type, actual_print_minutes, estimated_print_minutes, created_at, customers(id, name), printers(brand, model, badge_color), assigned:users!orders_assigned_staff_id_fkey(id, full_name)";

/**
 * Allow-listed sortable columns (keyset-safe). Print minutes are written as 0
 * by the app when unrecorded (a one-time backfill normalized legacy NULLs) so
 * the tuple comparison never drops rows.
 */
export const ORDER_SORTABLE: Record<string, string> = {
  created_at: "created_at",
  buying_date: "buying_date",
  order_code: "order_code",
  total_cents: "total_cents",
  actual_print_minutes: "actual_print_minutes",
};

/**
 * One keyset page of orders. RLS already scopes staff to own/assigned rows;
 * filters/search ride the btree + trigram indexes from the migrations.
 *
 * Keyword search matches order code / snapshot email / phone directly, and
 * customer NAME via a fast pre-query of matching customer ids (trigram,
 * capped at 100) folded into the same OR.
 */
export async function fetchOrdersPage(parsed: ParsedListQuery) {
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(LIST_COLUMNS, parsed.cursor ? {} : { count: "estimated" })
    .eq("is_active", parsed.filters["deleted"] === "true" ? false : true);

  if (parsed.q) {
    const orParts = [ilikeAnyExpression(["order_code", "email", "phone"], parsed.q)];
    const { data: matches } = await supabase
      .from("customers")
      .select("id")
      .ilike("name", ilikePattern(parsed.q))
      .limit(100);
    const ids = asRows<{ id: string }>(matches).map((r) => r.id);
    if (ids.length > 0) orParts.push(`customer_id.in.(${ids.join(",")})`);
    query = query.or(orParts.join(","));
  }

  const eqFilters: Record<string, string> = {
    status: "status",
    priority: "priority",
    payment_status: "payment_status",
    assigned: "assigned_staff_id",
    customer: "customer_id",
    printer: "printer_id",
    material: "material_type",
    print_state: "print_state",
  };
  for (const [filterId, column] of Object.entries(eqFilters)) {
    const value = parsed.filters[filterId];
    if (value) query = query.eq(column, value);
  }
  const from = parsed.filters["buying_date_from"];
  const to = parsed.filters["buying_date_to"];
  if (from) query = query.gte("buying_date", from);
  if (to) query = query.lte("buying_date", to);

  if (parsed.cursor) {
    query = query.or(keysetOrExpression(parsed.cursor, parsed.sort, parsed.ascending));
  }

  const { data, error, count } = await query
    .order(parsed.sort, { ascending: parsed.ascending })
    .order("id", { ascending: parsed.ascending })
    .limit(parsed.limit + 1);

  if (error) throw new Error(error.message);
  return buildPage(asRows<OrderListRow>(data), parsed.limit, parsed.sort, count ?? null);
}

async function fetchOrdersForExport(
  query: ListQuery,
  _user: SessionUser,
  limit: number,
): Promise<OrderListRow[]> {
  const all: OrderListRow[] = [];
  let cursor: string | null = null;
  while (all.length < limit) {
    const page = await fetchOrdersPage({
      q: (query.q ?? "").trim().slice(0, 200),
      sort: ORDER_SORTABLE[query.sort ?? ""] ? (query.sort as string) : "created_at",
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

export const ordersExportDataset: ExportDataset<OrderListRow> = {
  title: "Customer Orders",
  slug: "orders",
  module: "orders",
  permission: "orders.export",
  columns: [
    { header: "Order code", value: (r) => r.order_code, width: 1.4 },
    { header: "Customer", value: (r) => r.customers?.name ?? "", width: 1.8 },
    { header: "Buying date", value: (r) => formatDate(r.buying_date), width: 1.1 },
    { header: "Status", value: (r) => r.status },
    { header: "Priority", value: (r) => r.priority },
    { header: "Payment", value: (r) => r.payment_status },
    { header: "Printer", value: (r) => (r.printers ? `${r.printers.brand} ${r.printers.model}` : "") },
    { header: "Material", value: (r) => r.material_type ?? "" },
    { header: "Print time", value: (r) => formatMinutes(r.actual_print_minutes), width: 0.9 },
    {
      header: "Total",
      value: (r) => `${r.currency} ${centsToDecimalString(r.total_cents)}`,
      align: "right",
      width: 1.1,
    },
    { header: "Assigned to", value: (r) => r.assigned?.full_name ?? "", width: 1.4 },
    { header: "Delivery date", value: (r) => (r.delivery_date ? formatDate(r.delivery_date) : ""), width: 1.1 },
  ],
  fetchRows: fetchOrdersForExport,
};

const IMPORT_FIELDS = [
  { key: "customer_name", label: "Customer name", type: "text", required: true, maxLength: 200, example: "Ada Lovelace" },
  { key: "order_code", label: "Order code", type: "text", required: true, maxLength: 40, example: "FZ-2024-001234" },
  { key: "buying_date", label: "Buying date", type: "date", required: true, example: "2024-11-03" },
  { key: "status", label: "Status", type: "select", required: true, options: ["pending", "processing", "shipped", "delivered", "returned", "cancelled"], example: "delivered" },
  { key: "priority", label: "Priority", type: "select", options: ["low", "medium", "high", "extreme"], example: "medium" },
  { key: "payment_status", label: "Payment status", type: "select", options: ["paid", "unpaid", "refunded"], example: "paid" },
  { key: "payment_method", label: "Payment method", type: "text", maxLength: 80 },
  { key: "total", label: "Order total", type: "number", required: true, example: "1299.99" },
  { key: "phone", label: "Phone", type: "phone", maxLength: 25 },
  { key: "email", label: "Email", type: "email", maxLength: 320 },
  { key: "shipping_address", label: "Shipping address", type: "text", maxLength: 1000 },
  { key: "delivery_date", label: "Delivery date", type: "date" },
  { key: "notes", label: "Notes", type: "text", maxLength: 4000 },
] satisfies ImportDataset["fields"];

/**
 * Historical-orders import. Customers are matched by exact name
 * (case-insensitive) and created when missing; orders insert in 1,000-row
 * batches. Duplicate order codes are reported per row without aborting the
 * batch. Each imported order gets one summary line item carrying the total.
 */
async function insertOrderRows(rows: ValidatedRow[], user: SessionUser): Promise<ImportCommitResult> {
  const supabase = await createClient();
  let inserted = 0;
  const errors: RowError[] = [];

  for (const batch of chunk(rows)) {
    // 1. Resolve/create customers for the batch in bulk.
    const names = [...new Set(batch.map((r) => String(r.values["customer_name"] ?? "").trim()))];
    const nameToId = new Map<string, string>();
    const orExpr = names.map((n) => `name.ilike.${pgLiteral(n)}`).join(",");
    const { data: existing } = await supabase.from("customers").select("id, name").or(orExpr).limit(names.length * 2);
    for (const c of asRows<{ id: string; name: string }>(existing)) {
      nameToId.set(c.name.toLowerCase(), c.id);
    }
    const missing = names.filter((n) => !nameToId.has(n.toLowerCase()));
    if (missing.length > 0) {
      const { data: created, error } = await supabase
        .from("customers")
        .insert(dbInsert("customers", missing.map((name) => ({ name }))))
        .select("id, name");
      if (error) {
        for (const r of batch) errors.push({ row: r.row, field: "customer_name", message: error.message });
        continue;
      }
      for (const c of asRows<{ id: string; name: string }>(created)) {
        nameToId.set(c.name.toLowerCase(), c.id);
      }
    }

    // 2. Insert the orders.
    const payload = batch.flatMap((r) => {
      const customerId = nameToId.get(String(r.values["customer_name"] ?? "").trim().toLowerCase());
      if (!customerId) {
        errors.push({ row: r.row, field: "customer_name", message: "Could not resolve customer" });
        return [];
      }
      const totalCents = toCents(Number(r.values["total"] ?? 0));
      return [
        {
          __row: r.row,
          order_code: String(r.values["order_code"]),
          customer_id: customerId,
          buying_date: String(r.values["buying_date"]),
          status: String(r.values["status"] ?? "delivered"),
          priority: String(r.values["priority"] ?? "medium"),
          payment_status: String(r.values["payment_status"] ?? "paid"),
          payment_method: (r.values["payment_method"] as string | null) ?? null,
          phone: (r.values["phone"] as string | null) ?? null,
          email: (r.values["email"] as string | null) ?? null,
          shipping_address: (r.values["shipping_address"] as string | null) ?? null,
          delivery_date: (r.values["delivery_date"] as string | null) ?? null,
          notes: (r.values["notes"] as string | null) ?? null,
          subtotal_cents: totalCents,
          tax_cents: 0,
          total_cents: totalCents,
          created_by: user.id,
          updated_by: user.id,
          assigned_staff_id: user.id,
        },
      ];
    });
    if (payload.length === 0) continue;

    const insertRows = payload.map(({ __row: _ignored, ...rest }) => rest);
    const { data: createdOrders, error: orderError } = await supabase
      .from("orders")
      .insert(dbInsert("orders", insertRows))
      .select("id, order_code, total_cents");

    if (orderError) {
      if (orderError.code === "23505") {
        // Batch hit duplicate codes — retry row-by-row so good rows still land.
        for (const row of payload) {
          const { __row, ...rest } = row;
          const { data: one, error: oneError } = await supabase
            .from("orders")
            .insert(dbInsert("orders", rest))
            .select("id, total_cents")
            .single();
          if (oneError) {
            errors.push({
              row: __row,
              field: "order_code",
              message:
                oneError.code === "23505"
                  ? `Order code "${rest.order_code}" already exists`
                  : oneError.message,
            });
          } else {
            const created = asRows<{ id: string; total_cents: number }>([one])[0];
            if (created) {
              await supabase.from("order_items").insert(
                dbInsert("order_items", {
                  order_id: created.id,
                  name: "Imported items",
                  quantity: 1,
                  unit_price_cents: created.total_cents,
                  line_total_cents: created.total_cents,
                }),
              );
            }
            inserted += 1;
          }
        }
      } else {
        for (const row of payload) {
          errors.push({ row: row.__row, field: "order_code", message: orderError.message });
        }
      }
      continue;
    }

    // 3. One summary line item per imported order (keeps totals consistent).
    const orders = asRows<{ id: string; order_code: string; total_cents: number }>(createdOrders);
    if (orders.length > 0) {
      await supabase.from("order_items").insert(
        dbInsert(
          "order_items",
          orders.map((o) => ({
            order_id: o.id,
            name: "Imported items",
            quantity: 1,
            unit_price_cents: o.total_cents,
            line_total_cents: o.total_cents,
          })),
        ),
      );
    }
    inserted += orders.length;
  }

  return { inserted, skipped: errors.length, errors };
}

export const ordersImportDataset: ImportDataset = {
  title: "Customer Orders",
  slug: "orders",
  module: "orders",
  permission: "orders.import",
  fields: IMPORT_FIELDS,
  insertRows: insertOrderRows,
};
