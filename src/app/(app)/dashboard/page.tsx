import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, Megaphone, MessageSquareWarning, PackagePlus, Bell } from "lucide-react";

import { getSessionUser, type SessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows, rpcParams } from "@/lib/supabase/types";
import { getOrderConfig } from "@/lib/orders/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, PriorityBadge } from "@/components/ui/status-badge";
import { formatDateTime, formatMoney } from "@/lib/format";
import { StatCards, type DashboardStats } from "./stat-cards";
import { NowPrintingWidget } from "./now-printing";
import { AssistantPanel } from "./assistant-panel";

export const metadata = { title: "Dashboard" };

/**
 * Module 0 — the landing page. Role-scoped like Analytics: admins see
 * company-wide numbers, staff their own. EVERY count comes from the cached
 * aggregate layer (planner-stats counts, matviews, the per-user unread RPC) —
 * never a live COUNT(*) over big tables. The two mini-lists are indexed,
 * LIMIT-5 queries scoped by RLS.
 */

type RecentOrder = {
  id: string;
  order_code: string;
  status: string;
  priority: string;
  total_cents: number;
  currency: string;
  customers: { name: string } | null;
};

async function getStats(user: SessionUser): Promise<DashboardStats> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const companyWide = user.permissions.has("analytics.view_team");

  const { data: unreadData } = await supabase.rpc("unread_notification_count");
  const unread = Number(unreadData ?? 0);

  if (companyWide) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [ordersRes, summaryRes, inventoryRes, ordersThisWeekRes, customersThisMonthRes] = await Promise.all([
      // Planner-stats estimate — O(1) regardless of table size.
      admin.rpc("estimated_count", rpcParams("estimated_count", { p_table: "orders" })),
      admin.from("mv_summary_stats").select("total_customers").maybeSingle(),
      admin.from("mv_inventory_value").select("low_stock_products").maybeSingle(),
      // Last 7 days of the daily cube (≤ days × staff × status × priority rows)
      // instead of counting base orders per request.
      admin.from("mv_orders_daily").select("orders_count").gte("day", weekAgo).limit(10_000),
      // Bounded index-range count on idx_customers_created_keyset: scans only
      // the last 30 days of signups, never the whole customers table.
      admin.from("customers").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);
    const weekRows = asRows<{ orders_count: number }>(ordersThisWeekRes.data);
    return {
      scope: "company",
      totalOrders: Number(ordersRes.data ?? 0),
      secondCount: asRow<{ total_customers: number }>(summaryRes.data)?.total_customers ?? 0,
      unread,
      lowStock: asRow<{ low_stock_products: number }>(inventoryRes.data)?.low_stock_products ?? 0,
      ordersThisWeek: weekRows.reduce((s, r) => s + r.orders_count, 0),
      newThisMonth: Number(customersThisMonthRes.count ?? 0),
    };
  }

  // Staff: roll up THEIR slice of the daily cube (small: their days × statuses).
  const config = await getOrderConfig();
  const finalStatuses = new Set(config.statuses.filter((s) => s.isFinal).map((s) => s.key));
  const [cubeData, ordersThisWeekRes, openHighPriorityRes] = await Promise.all([
    admin
      .from("mv_orders_daily")
      .select("status, orders_count")
      .eq("assigned_staff_id", user.id)
      .limit(10_000),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("assigned_staff_id", user.id)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("assigned_staff_id", user.id)
      .eq("is_active", true)
      .in("priority", ["high", "urgent"])
      .not("status", "in", `(${Array.from(finalStatuses).map(s => `"${s}"`).join(",")})`),
  ]);
  const rows = asRows<{ status: string; orders_count: number }>(cubeData.data);
  const totalOrders = rows.reduce((s, r) => s + r.orders_count, 0);
  const openOrders = rows
    .filter((r) => !finalStatuses.has(r.status))
    .reduce((s, r) => s + r.orders_count, 0);

  return {
    scope: "own",
    totalOrders,
    secondCount: openOrders,
    unread,
    lowStock: null,
    ordersThisWeek: Number(ordersThisWeekRes.count ?? 0),
    newThisMonth: Number(openHighPriorityRes.count ?? 0),
  };
}

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [stats, recentOrdersRes, recentActivityRes] = await Promise.all([
    getStats(user),
    // RLS scopes staff to own/assigned automatically; keyset index, LIMIT 5.
    supabase
      .from("orders")
      .select("id, order_code, status, priority, total_cents, currency, customers(name)")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("activity_logs")
      .select("id, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const recentOrders = asRows<RecentOrder>(recentOrdersRes.data);
  const recentActivity = asRows<{ id: string; summary: string; created_at: string }>(
    recentActivityRes.data,
  );
  const config = await getOrderConfig();
  const statusDef = new Map(config.statuses.map((s) => [s.key, s]));
  const priorityDef = new Map(config.priorities.map((p) => [p.key, p]));

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {user.fullName.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your overview and quick actions for today.
        </p>
      </div>

      {/* ── AI assistant ────────────────────────────────────────────────── */}
      <div className="mb-6">
        <AssistantPanel />
      </div>

      {/* ── Stats (left) + Now Printing (right) ─────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <StatCards stats={stats} />
        <NowPrintingWidget />
      </div>

      {/* ── Quick actions (permission-filtered) ─────────────────────────── */}
      <div className="mt-6 flex flex-wrap gap-2">
        {user.permissions.has("orders.create") ? (
          <Button size="sm" asChild>
            <Link href="/orders/new">
              <PackagePlus /> New order
            </Link>
          </Button>
        ) : null}
        {user.permissions.has("products.create") ? (
          <Button size="sm" variant="outline" asChild>
            <Link href="/products">
              <Boxes /> Add product
            </Link>
          </Button>
        ) : null}
        {user.permissions.has("notifications.create") ? (
          <Button size="sm" variant="outline" asChild>
            <Link href="/notifications">
              <Bell /> Compose notification
            </Link>
          </Button>
        ) : null}
        {user.permissions.has("campaigns.create") ? (
          <Button size="sm" variant="outline" asChild>
            <Link href="/marketing">
              <Megaphone /> New campaign
            </Link>
          </Button>
        ) : null}
        {user.permissions.has("feedback.create") ? (
          <Button size="sm" variant="outline" asChild>
            <Link href="/feedback">
              <MessageSquareWarning /> Log feedback
            </Link>
          </Button>
        ) : null}
      </div>

      {/* ── Recent orders + recent activity ─────────────────────────────── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Recent orders</CardTitle>
            <Link href="/orders" className="text-xs text-muted-foreground hover:text-foreground">
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {recentOrders.map((o) => {
                  const s = statusDef.get(o.status);
                  const p = priorityDef.get(o.priority);
                  return (
                    <li key={o.id}>
                      <Link
                        href={`/orders/${o.id}`}
                        className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium tabular-nums">
                            {o.order_code}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {o.customers?.name ?? "—"}
                          </span>
                        </span>
                        <PriorityBadge priority={o.priority} color={p?.color} label={p?.label} />
                        <StatusBadge status={o.status} color={s?.color} label={s?.label} />
                        <span className="w-24 text-right text-sm tabular-nums">
                          {formatMoney(o.total_cents, o.currency)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Recent activity</CardTitle>
            <Link href="/activity" className="text-xs text-muted-foreground hover:text-foreground">
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {recentActivity.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate">{a.summary}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(a.created_at, "MMM d · h:mm a")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
