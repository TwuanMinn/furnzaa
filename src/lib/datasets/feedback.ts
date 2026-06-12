import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRows, dbInsert } from "@/lib/supabase/types";
import type { SessionUser } from "@/lib/rbac/guards";
import type { ListQuery } from "@/lib/datatable/types";
import {
  buildPage,
  decodeCursor,
  ilikePattern,
  keysetOrExpression,
  pgLiteral,
  type ParsedListQuery,
} from "@/lib/datatable/server";
import type { ExportDataset } from "@/lib/export/types";
import { chunk, type ImportDataset } from "@/lib/import/server";
import type { ImportCommitResult, RowError, ValidatedRow } from "@/lib/import/types";
import { formatDateTime } from "@/lib/format";

/**
 * Customer Feedback dataset (Module 6). The list runs on the SESSION client on
 * purpose: RLS scopes staff to records they submitted or are assigned while
 * feedback.view_all sees everything — the API route must never swap in the
 * admin client. Imports are the one service-role path here (the table has no
 * insert grant for authenticated; all writes flow through the server).
 */

export type FeedbackListRow = {
  id: string;
  code: string;
  created_at: string;
  rating: number;
  status: string;
  category: string;
  severity: string;
  source_channel: string;
  resolved_at: string | null;
  /** customers.name, falling back to the walk-in fallback_name. */
  customer_name: string;
  order_code: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  submitted_by: string | null;
  submitted_name: string | null;
  /** First ~140 chars of the comment (full text lives on the detail view). */
  comments: string;
};

/** Raw select shape before flattening the embedded relations. */
type FeedbackRawRow = {
  id: string;
  code: string;
  created_at: string;
  rating: number;
  status: string;
  category: string;
  severity: string;
  source_channel: string;
  resolved_at: string | null;
  fallback_name: string | null;
  comments: string;
  assigned_to: string | null;
  submitted_by: string | null;
  customer: { name: string } | null;
  order: { order_code: string } | null;
  assigned: { full_name: string } | null;
  submitter: { full_name: string } | null;
};

const LIST_COLUMNS =
  "id, code, created_at, rating, status, category, severity, source_channel, resolved_at, " +
  "fallback_name, comments, assigned_to, submitted_by, " +
  "customer:customers!customer_feedback_customer_id_fkey(name), " +
  "order:orders!customer_feedback_order_id_fkey(order_code), " +
  "assigned:users!customer_feedback_assigned_to_fkey(full_name), " +
  "submitter:users!customer_feedback_submitted_by_fkey(full_name)";

const COMMENT_PREVIEW_CHARS = 140;

/**
 * Allow-listed sortable columns. All are NOT NULL (keyset-safe) except
 * resolved_at: open records sort NULLS LAST and pagination stops at the null
 * boundary (a keyset cursor cannot represent a NULL sort value).
 */
export const FEEDBACK_SORTABLE: Record<string, string> = {
  created_at: "created_at",
  rating: "rating",
  status: "status",
  severity: "severity",
  resolved_at: "resolved_at",
};

function toListRow(r: FeedbackRawRow): FeedbackListRow {
  return {
    id: r.id,
    code: r.code,
    created_at: r.created_at,
    rating: r.rating,
    status: r.status,
    category: r.category,
    severity: r.severity,
    source_channel: r.source_channel,
    resolved_at: r.resolved_at,
    customer_name: r.customer?.name ?? r.fallback_name ?? "",
    order_code: r.order?.order_code ?? null,
    assigned_to: r.assigned_to,
    assigned_name: r.assigned?.full_name ?? null,
    submitted_by: r.submitted_by,
    submitted_name: r.submitter?.full_name ?? null,
    comments:
      r.comments.length > COMMENT_PREVIEW_CHARS
        ? `${r.comments.slice(0, COMMENT_PREVIEW_CHARS).trimEnd()}…`
        : r.comments,
  };
}

/**
 * One keyset page of feedback. Search combines full-text over comments_tsv
 * (websearch syntax; 'simple' config matches the stored generated column) with
 * a code ilike fallback so "F-0042" still hits. Filters ride the btree indexes
 * from migration 0029.
 */
export async function fetchFeedbackPage(parsed: ParsedListQuery) {
  // SESSION client — RLS does the row scoping. Never the admin client.
  const supabase = await createClient();

  let query = supabase
    .from("customer_feedback")
    .select(LIST_COLUMNS, parsed.cursor ? {} : { count: "estimated" })
    .eq("is_active", true);

  if (parsed.q) {
    query = query.or(
      `comments_tsv.wfts(simple).${pgLiteral(parsed.q)},code.ilike.${pgLiteral(ilikePattern(parsed.q))}`,
    );
  }

  const eqFilters: Record<string, string> = {
    status: "status",
    category: "category",
    severity: "severity",
    assigned: "assigned_to",
    channel: "source_channel",
    customer: "customer_id",
  };
  for (const [filterId, column] of Object.entries(eqFilters)) {
    const value = parsed.filters[filterId];
    if (!value) continue;
    // The saved presets need two non-eq shapes: "Unassigned" (IS NULL) and
    // "Negative 1–2★" (rating ceiling).
    if (filterId === "assigned" && value === "none") query = query.is("assigned_to", null);
    else query = query.eq(column, value);
  }
  const rating = parsed.filters["rating"] ? Number(parsed.filters["rating"]) : null;
  if (rating != null && Number.isFinite(rating)) query = query.eq("rating", rating);
  const ratingMax = parsed.filters["rating_max"] ? Number(parsed.filters["rating_max"]) : null;
  if (ratingMax != null && Number.isFinite(ratingMax)) query = query.lte("rating", ratingMax);

  const from = parsed.filters["date_from"] ?? parsed.filters["created_at_from"];
  const to = parsed.filters["date_to"] ?? parsed.filters["created_at_to"];
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  if (parsed.cursor) {
    query = query.or(keysetOrExpression(parsed.cursor, parsed.sort, parsed.ascending));
  }

  const { data, error, count } = await query
    // nullsFirst:false keeps unresolved (NULL resolved_at) rows last in both
    // directions; a no-op for the NOT NULL sort columns.
    .order(parsed.sort, { ascending: parsed.ascending, nullsFirst: false })
    .order("id", { ascending: parsed.ascending })
    .limit(parsed.limit + 1);

  if (error) throw new Error(error.message);
  const rows = asRows<FeedbackRawRow>(data).map(toListRow);
  const page = buildPage(rows, parsed.limit, parsed.sort, count ?? null);

  // A keyset cursor cannot encode a NULL sort value — once the resolved_at
  // sort reaches unresolved rows, stop rather than emit a cursor that would
  // restart from page 1.
  if (parsed.sort === "resolved_at" && page.nextCursor) {
    const last = page.rows[page.rows.length - 1];
    if (last && last.resolved_at === null) page.nextCursor = null;
  }
  return page;
}

/** Iterate keyset pages (1k each) to stream up to `limit` rows for export. */
async function fetchFeedbackForExport(
  query: ListQuery,
  _user: SessionUser,
  limit: number,
): Promise<FeedbackListRow[]> {
  const all: FeedbackListRow[] = [];
  let cursor: string | null = null;
  while (all.length < limit) {
    const page = await fetchFeedbackPage({
      q: (query.q ?? "").trim().slice(0, 200),
      sort: FEEDBACK_SORTABLE[query.sort ?? ""] ? (query.sort as string) : "created_at",
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

export const feedbackExportDataset: ExportDataset<FeedbackListRow> = {
  title: "Customer Feedback",
  slug: "feedback",
  module: "feedback",
  permission: "feedback.create",
  columns: [
    { header: "Code", value: (r) => r.code, width: 0.9 },
    { header: "Created", value: (r) => formatDateTime(r.created_at), width: 1.5 },
    { header: "Customer", value: (r) => r.customer_name, width: 1.5 },
    { header: "Rating", value: (r) => r.rating, align: "right", width: 0.6 },
    { header: "Category", value: (r) => r.category },
    { header: "Severity", value: (r) => r.severity, width: 0.7 },
    { header: "Status", value: (r) => r.status, width: 0.9 },
    { header: "Assigned", value: (r) => r.assigned_name ?? "", width: 1.3 },
    { header: "Resolved at", value: (r) => (r.resolved_at ? formatDateTime(r.resolved_at) : ""), width: 1.5 },
    { header: "Comments", value: (r) => r.comments, width: 2.6 },
  ],
  fetchRows: fetchFeedbackForExport,
};

const IMPORT_FIELDS = [
  { key: "customer_name", label: "Customer name", type: "text", required: true, maxLength: 200, example: "Ada Lovelace" },
  { key: "phone", label: "Phone", type: "phone", maxLength: 25, example: "+1 555 010 2030" },
  { key: "rating", label: "Rating (1-5)", type: "number", required: true, example: "4" },
  { key: "comments", label: "Comments", type: "text", required: true, maxLength: 4000 },
  { key: "category", label: "Category", type: "text", maxLength: 80, example: "Product quality" },
  { key: "severity", label: "Severity", type: "select", options: ["low", "medium", "high"], example: "low" },
  { key: "channel", label: "Channel", type: "text", maxLength: 80, example: "In person" },
  { key: "created_date", label: "Created date", type: "date", example: "2025-11-03" },
] satisfies ImportDataset["fields"];

/**
 * Historical-feedback import. Customers are matched by exact name
 * (case-insensitive); unmatched rows keep the CSV name/phone in the walk-in
 * fallback columns instead of creating customer records. Inserts run on the
 * service-role client (customer_feedback has no insert grant for
 * authenticated — all writes are server-side) in 1,000-row batches, with
 * per-row errors reported without aborting the import. Every row lands as
 * status "new", submitted by the importer.
 */
async function insertFeedbackRows(
  rows: ValidatedRow[],
  user: SessionUser,
): Promise<ImportCommitResult> {
  const supabase = createAdminClient();
  let inserted = 0;
  const errors: RowError[] = [];

  for (const batch of chunk(rows)) {
    // 1. Resolve existing customers for the batch in bulk (no creation).
    const names = [
      ...new Set(
        batch.map((r) => String(r.values["customer_name"] ?? "").trim()).filter((n) => n !== ""),
      ),
    ];
    const nameToId = new Map<string, string>();
    if (names.length > 0) {
      const orExpr = names.map((n) => `name.ilike.${pgLiteral(n)}`).join(",");
      const { data: existing } = await supabase
        .from("customers")
        .select("id, name")
        .or(orExpr)
        .limit(names.length * 2);
      for (const c of asRows<{ id: string; name: string }>(existing)) {
        nameToId.set(c.name.toLowerCase(), c.id);
      }
    }

    // 2. Insert the feedback records.
    const payload = batch.flatMap((r) => {
      const rating = Number(r.values["rating"] ?? 0);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        errors.push({ row: r.row, field: "rating", message: "Rating must be a whole number from 1 to 5" });
        return [];
      }
      const name = String(r.values["customer_name"] ?? "").trim();
      const customerId = nameToId.get(name.toLowerCase()) ?? null;
      const createdDate = (r.values["created_date"] as string | null) ?? null;
      return [
        {
          customer_id: customerId,
          fallback_name: customerId ? null : name,
          fallback_phone: customerId ? null : ((r.values["phone"] as string | null) ?? null),
          rating,
          comments: String(r.values["comments"] ?? ""),
          category: (r.values["category"] as string | null) ?? "Other",
          source_channel: (r.values["channel"] as string | null) ?? "In person",
          severity: (r.values["severity"] as string | null) ?? "low",
          status: "new",
          submitted_by: user.id,
          created_at: createdDate ? `${createdDate}T00:00:00.000Z` : new Date().toISOString(),
        },
      ];
    });
    if (payload.length === 0) continue;

    const { error, count } = await supabase
      .from("customer_feedback")
      .insert(dbInsert("customer_feedback", payload), { count: "exact" });
    if (error) {
      // Batch failed wholesale (constraint/connection) — report every row.
      for (const r of batch) errors.push({ row: r.row, field: "customer_name", message: error.message });
    } else {
      inserted += count ?? payload.length;
    }
  }

  return { inserted, skipped: errors.length, errors };
}

export const feedbackImportDataset: ImportDataset = {
  title: "Customer Feedback",
  slug: "feedback",
  module: "feedback",
  permission: "feedback.create",
  fields: IMPORT_FIELDS,
  insertRows: insertFeedbackRows,
};
