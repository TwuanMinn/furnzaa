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

export type TrendListRow = {
  id: string;
  name: string;
  source_platform: string;
  source_url: string | null;
  category_id: string | null;
  description: string | null;
  images: string[];
  est_print_minutes: number | null;
  suggested_material: string | null;
  est_filament_grams: number | null;
  est_selling_cents: number | null;
  est_cost_cents: number | null;
  popularity_score: number;
  tags: string[];
  trend_status: string;
  notes: string | null;
  votes_count: number;
  promoted_product_id: string | null;
  added_by: string | null;
  created_at: string;
  product_categories: { name: string } | null;
  added_by_user: { full_name: string } | null;
  /** Stamped per-request for the CALLING user (never another voter's identity). */
  my_vote?: boolean;
};

const LIST_COLUMNS =
  "id, name, source_platform, source_url, category_id, description, images, " +
  "est_print_minutes, suggested_material, est_filament_grams, est_selling_cents, " +
  "est_cost_cents, popularity_score, tags, trend_status, notes, votes_count, " +
  "promoted_product_id, added_by, created_at, product_categories(name), " +
  "added_by_user:users!trending_products_added_by_fkey(full_name)";

/** Allow-listed sortable columns (NOT NULL — keyset-safe). Estimated margin is
 * computed from two NULLABLE inputs, so it is intentionally not sortable. */
export const TREND_SORTABLE: Record<string, string> = {
  created_at: "created_at",
  popularity_score: "popularity_score",
  votes_count: "votes_count",
  name: "name",
};

export async function fetchTrendsPage(parsed: ParsedListQuery, viewerId?: string) {
  const supabase = await createClient();

  let query = supabase
    .from("trending_products")
    .select(LIST_COLUMNS, parsed.cursor ? {} : { count: "estimated" })
    .is("deleted_at", null);

  if (parsed.q) query = query.or(ilikeAnyExpression(["name"], parsed.q));
  const status = parsed.filters["status"];
  if (status) query = query.eq("trend_status", status);
  const platform = parsed.filters["platform"];
  if (platform) query = query.eq("source_platform", platform);
  const category = parsed.filters["category"];
  if (category) query = query.eq("category_id", category);
  const tag = parsed.filters["tag"];
  if (tag) query = query.contains("tags", [tag]);
  const addedBy = parsed.filters["added_by"];
  if (addedBy) query = query.eq("added_by", addedBy);
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

  const page = buildPage(asRows<TrendListRow>(data), parsed.limit, parsed.sort, count ?? null);

  // Stamp the caller's own votes onto the page (one indexed PK lookup).
  if (viewerId && page.rows.length > 0) {
    const { data: votes } = await supabase
      .from("trending_product_votes")
      .select("trending_product_id")
      .eq("user_id", viewerId)
      .in("trending_product_id", page.rows.map((r) => r.id));
    const mine = new Set(asRows<{ trending_product_id: string }>(votes).map((v) => v.trending_product_id));
    for (const row of page.rows) row.my_vote = mine.has(row.id);
  }
  return page;
}

function marginPct(r: TrendListRow): string {
  if (!r.est_selling_cents || r.est_cost_cents == null) return "";
  if (r.est_selling_cents === 0) return "";
  return (((r.est_selling_cents - r.est_cost_cents) / r.est_selling_cents) * 100).toFixed(1);
}

async function fetchTrendsForExport(
  query: ListQuery,
  user: SessionUser,
  limit: number,
): Promise<TrendListRow[]> {
  const all: TrendListRow[] = [];
  let cursor: string | null = null;
  while (all.length < limit) {
    const page = await fetchTrendsPage(
      {
        q: (query.q ?? "").trim().slice(0, 200),
        sort: TREND_SORTABLE[query.sort ?? ""] ? (query.sort as string) : "created_at",
        ascending: query.dir === "asc",
        cursor: decodeCursor(cursor),
        limit: Math.min(1_000, limit - all.length),
        filters: query.filters ?? {},
      },
      user.id,
    );
    all.push(...page.rows);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return all;
}

export const trendsExportDataset: ExportDataset<TrendListRow> = {
  title: "Trending Products",
  slug: "trends",
  module: "trends",
  permission: "trends.create",
  columns: [
    { header: "Name", value: (r) => r.name, width: 2 },
    { header: "Platform", value: (r) => r.source_platform, width: 1.2 },
    { header: "Category", value: (r) => r.product_categories?.name ?? "", width: 1.2 },
    { header: "Status", value: (r) => r.trend_status, width: 1.1 },
    { header: "Votes", value: (r) => String(r.votes_count) },
    { header: "Popularity", value: (r) => String(r.popularity_score) },
    { header: "Est. price", value: (r) => centsToDecimalString(r.est_selling_cents ?? 0, "VND") },
    { header: "Est. cost", value: (r) => centsToDecimalString(r.est_cost_cents ?? 0, "VND") },
    { header: "Margin %", value: (r) => marginPct(r) },
    { header: "Tags", value: (r) => r.tags.join("; "), width: 1.4 },
    { header: "Added by", value: (r) => r.added_by_user?.full_name ?? "", width: 1.3 },
    { header: "Created", value: (r) => formatDateTime(r.created_at), width: 1.5 },
  ],
  fetchRows: fetchTrendsForExport,
};

const IMPORT_FIELDS = [
  { key: "name", label: "Name", type: "text", required: true, maxLength: 200, example: "Articulated dragon" },
  { key: "source_platform", label: "Source platform", type: "text", maxLength: 60, example: "MakerWorld" },
  { key: "source_url", label: "Source URL", type: "text", maxLength: 1000 },
  { key: "category", label: "Category", type: "text", maxLength: 120 },
  { key: "description", label: "Description", type: "text", maxLength: 4000 },
  { key: "popularity_score", label: "Popularity (1-100)", type: "number", example: "75" },
  { key: "est_selling_price", label: "Est. selling price", type: "number", example: "150000" },
  { key: "est_cost", label: "Est. total cost", type: "number", example: "60000" },
  { key: "tags", label: "Tags (; separated)", type: "text", maxLength: 400, example: "viral; seasonal" },
] satisfies ImportDataset["fields"];

async function insertTrendRows(rows: ValidatedRow[], user: SessionUser): Promise<ImportCommitResult> {
  const admin = createAdminClient();
  const errors: RowError[] = [];

  const { data: catData } = await admin.from("product_categories").select("id, name").limit(5_000);
  const catByName = new Map(
    asRows<{ id: string; name: string }>(catData).map((c) => [c.name.toLowerCase(), c.id]),
  );

  let inserted = 0;
  for (const batch of chunk(rows, 1_000)) {
    const payload = batch.map((row) => {
      const v = row.values;
      const pop = Math.trunc(Number(v["popularity_score"] ?? 50));
      return {
        name: String(v["name"] ?? "").trim(),
        source_platform: String(v["source_platform"] ?? "Other").trim() || "Other",
        source_url: String(v["source_url"] ?? "").trim() || null,
        category_id: catByName.get(String(v["category"] ?? "").trim().toLowerCase()) ?? null,
        description: String(v["description"] ?? "").trim() || null,
        popularity_score: Math.min(100, Math.max(1, Number.isFinite(pop) ? pop : 50)),
        est_selling_cents: Math.round(Number(v["est_selling_price"] ?? 0) * 100) || null,
        est_cost_cents: Math.round(Number(v["est_cost"] ?? 0) * 100) || null,
        tags: String(v["tags"] ?? "")
          .split(";")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 15),
        added_by: user.id,
        updated_by: user.id,
      };
    });
    const { error } = await admin.from("trending_products").insert(dbInsert("trending_products", payload));
    if (error) {
      for (const row of batch) errors.push({ row: row.row, field: "name", message: error.message });
      continue;
    }
    inserted += batch.length;
  }
  return { inserted, skipped: errors.length, errors };
}

export const trendsImportDataset: ImportDataset = {
  title: "Trending Products",
  slug: "trends",
  module: "trends",
  permission: "trends.manage",
  fields: IMPORT_FIELDS,
  insertRows: insertTrendRows,
};
