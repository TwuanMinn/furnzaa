import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRow, asRows } from "@/lib/supabase/types";
import type { SessionUser } from "@/lib/rbac/guards";
import type { ListQuery } from "@/lib/datatable/types";
import {
  buildPage,
  decodeCursor,
  ilikeAnyExpression,
  ilikePattern,
  keysetOrExpression,
  type ParsedListQuery,
} from "@/lib/datatable/server";
import type { ExportDataset } from "@/lib/export/types";
import { centsToDecimalString, formatDate, formatDateTime } from "@/lib/format";

/**
 * CRM & Loyalty datasets (Module 5). Customer rows carry ONLY the
 * incrementally-maintained aggregates (lifetime/annual spend, order count,
 * last purchase, score) — no order-history scans anywhere. Segment filters
 * expand a saved JSON definition into the same indexed predicates.
 */

export type CrmCustomerRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  region: string | null;
  birthday: string | null;
  lifetime_spend_cents: number;
  annual_spend_cents: number;
  order_count: number;
  last_purchase_date: string | null;
  customer_score: number;
  feedback_count: number;
  avg_rating: number | null;
  created_at: string;
  tier: { id: string; key: string; name: string; badge_color: string; rank: number } | null;
};

const CUSTOMER_COLUMNS =
  "id, name, email, phone, region, birthday, lifetime_spend_cents, annual_spend_cents, " +
  "order_count, last_purchase_date, customer_score, feedback_count, avg_rating, created_at, " +
  "tier:customer_tiers(id, key, name, badge_color, rank)";

/** Allow-listed sortable columns (NOT NULL — keyset-safe). */
export const CRM_CUSTOMER_SORTABLE: Record<string, string> = {
  created_at: "created_at",
  name: "name",
  lifetime_spend_cents: "lifetime_spend_cents",
  annual_spend_cents: "annual_spend_cents",
  order_count: "order_count",
  customer_score: "customer_score",
};

/** Saved segment definition (customer_segments.filter). All keys optional. */
export interface SegmentFilter {
  spend_min_cents?: number;
  spend_max_cents?: number;
  order_count_min?: number;
  tier_keys?: string[];
  /** ISO dates: purchased before/after (inactivity targeting). */
  last_purchase_before?: string;
  last_purchase_after?: string;
  regions?: string[];
  /** Customer bought this product at least once (subquery on order_items). */
  product_id?: string;
}

/** Resolve tier keys → ids once per request (15 rows, cached upstream). */
async function tierIdsForKeys(keys: string[]): Promise<string[]> {
  if (keys.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("customer_tiers").select("id").in("key", keys);
  return asRows<{ id: string }>(data).map((t) => t.id);
}

/** Customer ids that ever bought a product (bounded; rides idx_order_items_product). */
async function customerIdsForProduct(productId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("order_items")
    .select("orders!inner(customer_id)")
    .eq("product_id", productId)
    .limit(10_000);
  const ids = new Set<string>();
  for (const row of asRows<{ orders: { customer_id: string } }>(data)) {
    ids.add(row.orders.customer_id);
  }
  return [...ids];
}

export async function loadSegmentFilter(segmentId: string): Promise<SegmentFilter | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customer_segments")
    .select("filter")
    .eq("id", segmentId)
    .is("deleted_at", null)
    .maybeSingle();
  return asRow<{ filter: SegmentFilter }>(data)?.filter ?? null;
}

/** One keyset page of CRM customers. Direct filters + optional saved segment. */
export async function fetchCrmCustomersPage(parsed: ParsedListQuery) {
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select(CUSTOMER_COLUMNS, parsed.cursor ? {} : { count: "estimated" })
    .eq("is_active", true);

  if (parsed.q) {
    query = query.or(ilikeAnyExpression(["name", "email", "phone"], parsed.q));
  }

  // Saved segment expands into the same indexed predicates as direct filters.
  let segment: SegmentFilter | null = null;
  if (parsed.filters["segment"]) {
    segment = await loadSegmentFilter(parsed.filters["segment"]);
  }

  const tierFilter = parsed.filters["tier"];
  if (tierFilter) query = query.eq("current_tier_id", tierFilter);
  if (segment?.tier_keys?.length) {
    const ids = await tierIdsForKeys(segment.tier_keys);
    if (ids.length > 0) query = query.in("current_tier_id", ids);
  }

  const region = parsed.filters["region"] ?? undefined;
  if (region) query = query.ilike("region", ilikePattern(region));
  if (segment?.regions?.length) query = query.in("region", segment.regions);

  const spendMin = parsed.filters["spend_min"] ? Number(parsed.filters["spend_min"]) * 100 : segment?.spend_min_cents;
  const spendMax = parsed.filters["spend_max"] ? Number(parsed.filters["spend_max"]) * 100 : segment?.spend_max_cents;
  if (spendMin != null && Number.isFinite(spendMin)) query = query.gte("lifetime_spend_cents", spendMin);
  if (spendMax != null && Number.isFinite(spendMax)) query = query.lte("lifetime_spend_cents", spendMax);

  const orderCountMin = parsed.filters["orders_min"] ? Number(parsed.filters["orders_min"]) : segment?.order_count_min;
  if (orderCountMin != null && Number.isFinite(orderCountMin)) query = query.gte("order_count", orderCountMin);

  const lastFrom = parsed.filters["last_purchase_from"] ?? segment?.last_purchase_after;
  const lastTo = parsed.filters["last_purchase_to"] ?? segment?.last_purchase_before;
  if (lastFrom) query = query.gte("last_purchase_date", lastFrom);
  if (lastTo) query = query.lte("last_purchase_date", lastTo);

  if (segment?.product_id) {
    const ids = await customerIdsForProduct(segment.product_id);
    if (ids.length === 0) {
      return { rows: [] as CrmCustomerRow[], nextCursor: null, estimatedTotal: 0 };
    }
    query = query.in("id", ids);
  }

  if (parsed.cursor) {
    query = query.or(keysetOrExpression(parsed.cursor, parsed.sort, parsed.ascending));
  }

  const { data, error, count } = await query
    .order(parsed.sort, { ascending: parsed.ascending })
    .order("id", { ascending: parsed.ascending })
    .limit(parsed.limit + 1);

  if (error) throw new Error(error.message);
  return buildPage(asRows<CrmCustomerRow>(data), parsed.limit, parsed.sort, count ?? null);
}

async function fetchCrmCustomersForExport(
  query: ListQuery,
  _user: SessionUser,
  limit: number,
): Promise<CrmCustomerRow[]> {
  const all: CrmCustomerRow[] = [];
  let cursor: string | null = null;
  while (all.length < limit) {
    const page = await fetchCrmCustomersPage({
      q: (query.q ?? "").trim().slice(0, 200),
      sort: CRM_CUSTOMER_SORTABLE[query.sort ?? ""] ? (query.sort as string) : "lifetime_spend_cents",
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

export const crmCustomersExportDataset: ExportDataset<CrmCustomerRow> = {
  title: "Customers (CRM)",
  slug: "crm-customers",
  module: "crm",
  permission: "crm.view",
  columns: [
    { header: "Name", value: (r) => r.name, width: 1.8 },
    { header: "Email", value: (r) => r.email, width: 1.8 },
    { header: "Region", value: (r) => r.region },
    { header: "Tier", value: (r) => r.tier?.name ?? "" , width: 1.4 },
    { header: "Lifetime spend", value: (r) => centsToDecimalString(r.lifetime_spend_cents, "VND"), align: "right", width: 1.1 },
    { header: "Annual spend", value: (r) => centsToDecimalString(r.annual_spend_cents, "VND"), align: "right", width: 1.1 },
    { header: "Orders", value: (r) => r.order_count, align: "right", width: 0.7 },
    { header: "Score", value: (r) => r.customer_score, align: "right", width: 0.7 },
    { header: "Last purchase", value: (r) => (r.last_purchase_date ? formatDate(r.last_purchase_date) : ""), width: 1.1 },
  ],
  fetchRows: fetchCrmCustomersForExport,
};

// ── Vouchers ──────────────────────────────────────────────────────────────────

export type VoucherListRow = {
  id: string;
  code: string;
  type: "percentage" | "fixed" | "free_shipping";
  value_percent: number | null;
  value_cents: number | null;
  start_date: string;
  end_date: string | null;
  usage_limit: number | null;
  used_count: number;
  source: string;
  is_active: boolean;
  created_at: string;
  assigned_customer: { id: string; name: string } | null;
};

const VOUCHER_COLUMNS =
  "id, code, type, value_percent, value_cents, start_date, end_date, usage_limit, used_count, " +
  "source, is_active, created_at, assigned_customer:customers(id, name)";

export const VOUCHER_SORTABLE: Record<string, string> = {
  created_at: "created_at",
  code: "code",
  used_count: "used_count",
};

export async function fetchVouchersPage(parsed: ParsedListQuery) {
  const supabase = await createClient();

  let query = supabase
    .from("vouchers")
    .select(VOUCHER_COLUMNS, parsed.cursor ? {} : { count: "estimated" });

  if (parsed.q) query = query.ilike("code", ilikePattern(parsed.q));
  const type = parsed.filters["type"];
  if (type) query = query.eq("type", type);
  const source = parsed.filters["source"];
  if (source) query = query.eq("source", source);
  const status = parsed.filters["status"];
  if (status === "active") query = query.eq("is_active", true);
  if (status === "inactive") query = query.eq("is_active", false);

  if (parsed.cursor) {
    query = query.or(keysetOrExpression(parsed.cursor, parsed.sort, parsed.ascending));
  }

  const { data, error, count } = await query
    .order(parsed.sort, { ascending: parsed.ascending })
    .order("id", { ascending: parsed.ascending })
    .limit(parsed.limit + 1);

  if (error) throw new Error(error.message);
  return buildPage(asRows<VoucherListRow>(data), parsed.limit, parsed.sort, count ?? null);
}

async function fetchVouchersForExport(
  query: ListQuery,
  _user: SessionUser,
  limit: number,
): Promise<VoucherListRow[]> {
  const all: VoucherListRow[] = [];
  let cursor: string | null = null;
  while (all.length < limit) {
    const page = await fetchVouchersPage({
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

export const vouchersExportDataset: ExportDataset<VoucherListRow> = {
  title: "Vouchers",
  slug: "vouchers",
  module: "crm",
  permission: "vouchers.view",
  columns: [
    { header: "Code", value: (r) => r.code, width: 1.5 },
    { header: "Type", value: (r) => r.type },
    {
      header: "Value",
      value: (r) =>
        r.type === "percentage"
          ? `${r.value_percent}%`
          : r.type === "fixed"
            ? centsToDecimalString(r.value_cents ?? 0, "VND")
            : "free shipping",
      align: "right",
    },
    { header: "Source", value: (r) => r.source },
    { header: "Assigned to", value: (r) => r.assigned_customer?.name ?? "Generic", width: 1.4 },
    { header: "Valid from", value: (r) => formatDate(r.start_date) },
    { header: "Valid to", value: (r) => (r.end_date ? formatDate(r.end_date) : "No expiry") },
    { header: "Used", value: (r) => `${r.used_count}${r.usage_limit ? ` / ${r.usage_limit}` : ""}`, align: "right" },
    { header: "Active", value: (r) => (r.is_active ? "Yes" : "No"), width: 0.6 },
    { header: "Created", value: (r) => formatDateTime(r.created_at), width: 1.4 },
  ],
  fetchRows: fetchVouchersForExport,
};

// ── Rank history + tier admin reads ──────────────────────────────────────────

export type RankHistoryRow = {
  id: string;
  reason: "auto" | "manual";
  qualifying_snapshot: Record<string, number>;
  created_at: string;
  previous_tier: { name: string; badge_color: string } | null;
  new_tier: { name: string; badge_color: string } | null;
  changed_by_user: { full_name: string } | null;
};

export async function fetchRankHistory(customerId: string): Promise<RankHistoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_rank_history")
    .select(
      `id, reason, qualifying_snapshot, created_at,
       previous_tier:customer_tiers!customer_rank_history_previous_tier_id_fkey(name, badge_color),
       new_tier:customer_tiers!customer_rank_history_new_tier_id_fkey(name, badge_color),
       changed_by_user:users!customer_rank_history_changed_by_fkey(full_name)`,
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return asRows<RankHistoryRow>(data);
}

export type TierRow = {
  id: string;
  key: string;
  name: string;
  group_name: string;
  rank: number;
  badge_color: string;
  lifetime_spend_threshold_cents: number;
  annual_spend_threshold_cents: number | null;
  min_order_count: number | null;
  min_customer_score: number | null;
  is_active: boolean;
  tier_benefits: {
    id: string;
    discount_percent: number;
    voucher_amount_cents: number;
    free_shipping: boolean;
    priority_support: boolean;
    exclusive_promotions: boolean;
    cashback_percent: number;
  } | null;
};

export async function fetchTiers(): Promise<TierRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_tiers")
    .select(
      `id, key, name, group_name, rank, badge_color, lifetime_spend_threshold_cents,
       annual_spend_threshold_cents, min_order_count, min_customer_score, is_active,
       tier_benefits(id, discount_percent, voucher_amount_cents, free_shipping,
         priority_support, exclusive_promotions, cashback_percent)`,
    )
    .order("rank", { ascending: true });
  if (error) throw new Error(error.message);
  return asRows<TierRow>(data);
}

export type SegmentRow = {
  id: string;
  name: string;
  description: string | null;
  filter: SegmentFilter;
  created_at: string;
};

export async function fetchSegments(): Promise<SegmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customer_segments")
    .select("id, name, description, filter, created_at")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return asRows<SegmentRow>(data);
}
