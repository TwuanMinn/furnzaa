import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows, rpcParams } from "@/lib/supabase/types";
import { getOrderConfig } from "@/lib/orders/config";
import { getOrgSettings } from "@/lib/settings/config";
import type { SessionUser } from "@/lib/rbac/guards";
import type { PermissionKey } from "@/lib/rbac/permissions";

/**
 * Read-only data tools for the dashboard AI assistant.
 *
 * Each tool is gated by a single permission (the loop only EXPOSES tools the
 * caller holds, and re-checks before running) and reads the cached aggregate
 * layer — the same matviews / planner-stats the dashboard uses — never a live
 * COUNT over base tables. Company-vs-own scoping mirrors the dashboard:
 * analytics.view_team sees everyone, otherwise the caller's own slice.
 */
export interface AssistantTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  permission: PermissionKey;
  run: (input: Record<string, unknown>, user: SessionUser) => Promise<unknown>;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function localKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const PERIODS = ["today", "this_week", "this_month", "last_7_days", "last_30_days", "all"] as const;
type Period = (typeof PERIODS)[number];

/** Inclusive start day (YYYY-MM-DD) for a period, or null for "all". */
function periodStart(period: string): { key: string | null; label: Period } {
  const now = new Date();
  const d = new Date(now);
  switch (period) {
    case "today":
      return { key: localKey(d), label: "today" };
    case "this_week":
    case "last_7_days":
      d.setDate(d.getDate() - 6);
      return { key: localKey(d), label: period as Period };
    case "last_30_days":
      d.setDate(d.getDate() - 29);
      return { key: localKey(d), label: "last_30_days" };
    case "all":
      return { key: null, label: "all" };
    case "this_month":
    default:
      d.setDate(1);
      return { key: localKey(d), label: "this_month" };
  }
}

const PERIOD_SCHEMA = {
  type: "string",
  enum: [...PERIODS],
  description: "Time window. Defaults to this_month.",
};

// ── tools ─────────────────────────────────────────────────────────────────────
export const ASSISTANT_TOOLS: AssistantTool[] = [
  {
    name: "get_orders_summary",
    description:
      "Order counts and revenue over a period. Call this for any question about how many orders there are, a breakdown by status or by priority, or sales revenue. Returns total orders, counts per status, counts per priority, and revenue (from delivered + paid orders).",
    permission: "orders.view",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { period: PERIOD_SCHEMA },
    },
    run: async (input, user) => {
      const { key, label } = periodStart(String(input.period ?? "this_month"));
      const companyWide = user.permissions.has("analytics.view_team");
      const admin = createAdminClient();
      let q = admin
        .from("mv_orders_daily")
        .select("status, priority, orders_count, paid_orders_count, revenue_cents")
        .limit(20_000);
      if (!companyWide) q = q.eq("assigned_staff_id", user.id);
      if (key) q = q.gte("day", key);
      const { data, error } = await q;
      if (error) throw new Error(error.message);

      const config = await getOrderConfig();
      const settings = await getOrgSettings();
      const statusLabel = new Map(config.statuses.map((s) => [s.key, s.label]));
      const priorityLabel = new Map(config.priorities.map((p) => [p.key, p.label]));

      let total = 0;
      let revenueCents = 0;
      let paidOrders = 0;
      const byStatus = new Map<string, number>();
      const byPriority = new Map<string, number>();
      for (const r of asRows<{
        status: string;
        priority: string;
        orders_count: number;
        paid_orders_count: number;
        revenue_cents: number | null;
      }>(data)) {
        total += r.orders_count;
        revenueCents += r.revenue_cents ?? 0;
        paidOrders += r.paid_orders_count;
        byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + r.orders_count);
        byPriority.set(r.priority, (byPriority.get(r.priority) ?? 0) + r.orders_count);
      }

      return {
        scope: companyWide ? "company-wide" : "your assigned orders",
        period: label,
        totalOrders: total,
        byStatus: [...byStatus].map(([k, count]) => ({ status: statusLabel.get(k) ?? k, count })),
        byPriority: [...byPriority].map(([k, count]) => ({ priority: priorityLabel.get(k) ?? k, count })),
        deliveredPaidOrders: paidOrders,
        revenueCents,
        currency: settings.currency,
        note: "revenueCents counts only delivered + paid orders; money is in minor units (cents).",
      };
    },
  },

  {
    name: "get_customers_and_tiers",
    description:
      "Customer totals and the loyalty tier (member level) breakdown. Call this for questions about how many customers there are, the membership/loyalty levels, or how many customers sit in each tier.",
    permission: "crm.view",
    input_schema: { type: "object", additionalProperties: false, properties: {} },
    run: async () => {
      const admin = createAdminClient();
      const settings = await getOrgSettings();
      const [summaryRes, tiersRes] = await Promise.all([
        admin.from("mv_summary_stats").select("total_customers, active_customers_90d").maybeSingle(),
        admin
          .from("customer_tiers")
          .select("id, name, group_name, rank, lifetime_spend_threshold_cents")
          .eq("is_active", true)
          .order("rank", { ascending: true }),
      ]);
      const summary = asRow<{ total_customers: number; active_customers_90d: number }>(summaryRes.data);
      const tiers = asRows<{
        id: string;
        name: string;
        group_name: string;
        rank: number;
        lifetime_spend_threshold_cents: number;
      }>(tiersRes.data);

      // Per-tier customer counts — bounded by the (small) number of tiers.
      const counts = await Promise.all(
        tiers.map((t) =>
          admin
            .from("customers")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null)
            .eq("current_tier_id", t.id),
        ),
      );

      return {
        totalCustomers: summary?.total_customers ?? 0,
        activeCustomers90d: summary?.active_customers_90d ?? 0,
        currency: settings.currency,
        memberLevels: tiers.map((t, i) => ({
          level: t.group_name,
          tierName: t.name,
          rank: t.rank,
          lifetimeSpendThresholdCents: t.lifetime_spend_threshold_cents,
          customerCount: counts[i]?.count ?? 0,
        })),
      };
    },
  },

  {
    name: "get_feedback_summary",
    description:
      "Customer feedback analytics: total feedback, average star rating, open vs resolved counts, NPS-style promoters/passives/detractors, and average resolution time. Call this for any question about customer feedback, satisfaction, ratings, or complaints.",
    permission: "feedback.view_all",
    input_schema: { type: "object", additionalProperties: false, properties: {} },
    run: async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("mv_feedback_summary")
        .select(
          "total_feedback, avg_rating, avg_rating_this_month, open_new, open_in_progress, open_high, resolved_count, avg_resolution_hours, promoters, passives, detractors",
        )
        .maybeSingle();
      if (error) throw new Error(error.message);
      const f = asRow<Record<string, number | null>>(data);
      return {
        totalFeedback: f?.total_feedback ?? 0,
        averageRating: f?.avg_rating ?? null,
        averageRatingThisMonth: f?.avg_rating_this_month ?? null,
        open: { new: f?.open_new ?? 0, inProgress: f?.open_in_progress ?? 0, highSeverity: f?.open_high ?? 0 },
        resolved: f?.resolved_count ?? 0,
        avgResolutionHours: f?.avg_resolution_hours ?? null,
        sentiment: { promoters: f?.promoters ?? 0, passives: f?.passives ?? 0, detractors: f?.detractors ?? 0 },
      };
    },
  },

  {
    name: "get_inventory_summary",
    description:
      "Stock and inventory value: products in stock, how many are low on stock, and the total inventory value at cost and at retail. Call this for questions about inventory, stock levels, or low-stock products.",
    permission: "inventory.view",
    input_schema: { type: "object", additionalProperties: false, properties: {} },
    run: async () => {
      const admin = createAdminClient();
      const settings = await getOrgSettings();
      const [invRes, productCountRes] = await Promise.all([
        admin
          .from("mv_inventory_value")
          .select("products_in_stock, low_stock_products, value_cost_cents, value_retail_cents")
          .maybeSingle(),
        admin.rpc("estimated_count", rpcParams("estimated_count", { p_table: "products" })),
      ]);
      const inv = asRow<{
        products_in_stock: number;
        low_stock_products: number;
        value_cost_cents: number;
        value_retail_cents: number;
      }>(invRes.data);
      return {
        approxTotalProducts: Number(productCountRes.data ?? 0),
        productsInStock: inv?.products_in_stock ?? 0,
        lowStockProducts: inv?.low_stock_products ?? 0,
        inventoryValueCostCents: inv?.value_cost_cents ?? 0,
        inventoryValueRetailCents: inv?.value_retail_cents ?? 0,
        currency: settings.currency,
      };
    },
  },

  {
    name: "get_production_schedule",
    description:
      "Production / 3D-print schedule status: how many print jobs are queued, printing, completed, or failed, and how many are overdue. Call this for questions about the print queue, production schedule, or printer workload.",
    permission: "schedule.view",
    input_schema: { type: "object", additionalProperties: false, properties: {} },
    run: async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("print_schedule")
        .select("state, scheduled_at")
        .is("archived_at", null)
        .limit(5_000);
      if (error) throw new Error(error.message);
      const nowIso = new Date().toISOString();
      const byState = new Map<string, number>();
      let overdue = 0;
      let total = 0;
      for (const r of asRows<{ state: string; scheduled_at: string }>(data)) {
        total += 1;
        byState.set(r.state, (byState.get(r.state) ?? 0) + 1);
        if ((r.state === "queued" || r.state === "printing") && r.scheduled_at < nowIso) overdue += 1;
      }
      return {
        totalActiveJobs: total,
        byState: [...byState].map(([state, count]) => ({ state, count })),
        overdue,
      };
    },
  },

  {
    name: "get_users_summary",
    description:
      "Staff/user totals: how many user accounts exist, broken down by role and by account status (active, deactivated, banned). Call this for questions about staff, team size, or user accounts.",
    permission: "users.view",
    input_schema: { type: "object", additionalProperties: false, properties: {} },
    run: async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("users")
        .select("status, roles(name)")
        .limit(5_000);
      if (error) throw new Error(error.message);
      const byStatus = new Map<string, number>();
      const byRole = new Map<string, number>();
      let total = 0;
      for (const u of asRows<{ status: string; roles: { name: string } | null }>(data)) {
        total += 1;
        byStatus.set(u.status, (byStatus.get(u.status) ?? 0) + 1);
        const role = u.roles?.name ?? "Unknown";
        byRole.set(role, (byRole.get(role) ?? 0) + 1);
      }
      return {
        totalUsers: total,
        byStatus: [...byStatus].map(([status, count]) => ({ status, count })),
        byRole: [...byRole].map(([role, count]) => ({ role, count })),
      };
    },
  },

  {
    name: "get_settings",
    description:
      "Organization configuration: the currency, the list of order statuses and order priorities, and how many materials are configured. Call this for questions about system settings or how orders are configured.",
    permission: "settings.view",
    input_schema: { type: "object", additionalProperties: false, properties: {} },
    run: async () => {
      const [config, settings] = await Promise.all([getOrderConfig(), getOrgSettings()]);
      return {
        currency: settings.currency,
        orderStatuses: config.statuses.map((s) => s.label),
        orderPriorities: config.priorities.map((p) => p.label),
        materialsConfigured: config.materials.length,
      };
    },
  },
];
