"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity as ActivityIcon,
  Boxes,
  Crown,
  Download,
  FileText,
  Loader2,
  Megaphone,
  PackageCheck,
  Printer as PrinterIcon,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { badgeClass } from "@/lib/badges";
import { formatDate, formatDateTime, formatMinutes, formatMoney, toDateKey } from "@/lib/format";
import { downloadFromFetch } from "@/lib/export/csv";
import type { AnalyticsData } from "@/lib/datasets/analytics";

const CHART_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#0ea5e9"];

const PRESETS = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "All", days: null },
] as const;

interface StatusDef { key: string; label: string; color: string }

export function AnalyticsClient({
  currency,
  statuses,
  priorities,
}: {
  currency: string;
  statuses: StatusDef[];
  priorities: StatusDef[];
}) {
  const reduce = useReducedMotion();
  const [from, setFrom] = useState<string>(toDateKey(90));
  const [to, setTo] = useState<string>(toDateKey(0));
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const query = useQuery({
    queryKey: ["analytics", from, to],
    staleTime: 60_000,
    queryFn: async (): Promise<AnalyticsData> => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/analytics?${params}`);
      const body = (await res.json()) as { ok: boolean; data?: AnalyticsData; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Failed to load");
      return body.data;
    },
  });

  // Recent-activity feed (role-scoped by the activity API itself).
  const activityQuery = useQuery({
    queryKey: ["analytics-activity"],
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch("/api/activity?limit=8");
      const body = (await res.json()) as {
        ok: boolean;
        data?: { rows: { id: string; summary: string; created_at: string }[] };
      };
      return body.ok ? (body.data?.rows ?? []) : [];
    },
  });

  async function exportAs(format: "csv" | "pdf") {
    setExporting(format);
    try {
      const params = new URLSearchParams({ format });
      if (from) params.set("f_from", from);
      if (to) params.set("f_to", to);
      await downloadFromFetch(`/api/export/analytics?${params}`, `analytics.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  const d = query.data;
  const statusLabel = new Map(statuses.map((s) => [s.key, s]));
  const priorityLabel = new Map(priorities.map((p) => [p.key, p]));
  const money = (c: number | null | undefined) => formatMoney(c ?? 0, currency);

  if (query.isError) {
    return (
      <ErrorState
        description={(query.error as Error).message}
        action={
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const kpis = d
    ? ([
        { label: d.scope === "own" ? "My orders" : "Total orders", value: d.kpis.totalOrders.toLocaleString(), icon: ShoppingCart },
        { label: "Delivered orders", value: d.kpis.deliveredOrders.toLocaleString(), icon: PackageCheck },
        { label: "Total revenue", value: money(d.kpis.totalRevenueCents), icon: Wallet },
        { label: "Avg order value", value: money(d.kpis.avgOrderValueCents), icon: TrendingUp },
        {
          label: "Orders this month",
          value: d.kpis.ordersThisMonth.toLocaleString(),
          sub: `vs ${d.kpis.ordersLastMonth.toLocaleString()} last month`,
          icon: ShoppingCart,
        },
        ...(d.scope === "company"
          ? [
              { label: "Active customers (90d)", value: (d.kpis.activeCustomers ?? 0).toLocaleString(), icon: Users },
              { label: "Inventory value", value: money(d.kpis.inventoryValueCents), sub: "at cost", icon: Boxes },
              { label: "Gross profit", value: money(d.kpis.grossProfitCents), icon: TrendingUp },
              { label: "Active campaigns", value: (d.kpis.activeCampaigns ?? 0).toLocaleString(), icon: Megaphone },
            ]
          : []),
      ] as { label: string; value: string; sub?: string; icon: typeof ShoppingCart }[])
    : [];

  return (
    <div className="space-y-5">
      {/* ── Global date-range filter + exports ──────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="an-from">From</Label>
          <Input id="an-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="an-to">To</Label>
          <Input id="an-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="flex gap-1.5">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              size="sm"
              variant="outline"
              onClick={() => {
                setFrom(p.days ? toDateKey(p.days) : "");
                setTo(toDateKey(0));
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void exportAs("csv")} disabled={exporting !== null}>
            {exporting === "csv" ? <Loader2 className="animate-spin" /> : <Download />} CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => void exportAs("pdf")} disabled={exporting !== null}>
            {exporting === "pdf" ? <Loader2 className="animate-spin" /> : <FileText />} PDF
          </Button>
        </div>
      </div>

      {/* ── KPI cards ───────────────────────────────────────────────────── */}
      {query.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k, i) => (
            <motion.div
              key={k.label}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: reduce ? 0 : i * 0.03, ease: "easeOut" }}
            >
              <Card className="h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground">{k.label}</CardTitle>
                  <k.icon className="size-4 text-muted-foreground" aria-hidden />
                </CardHeader>
                <CardContent>
                  <p className="truncate text-xl font-semibold tabular-nums">{k.value}</p>
                  {k.sub ? <p className="mt-0.5 text-xs text-muted-foreground">{k.sub}</p> : null}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Charts row 1: orders + revenue over time ────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Orders over time" loading={query.isLoading}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={d?.ordersOverTime ?? []}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" tickFormatter={(v) => formatDate(v, "MMM d")} fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} width={36} />
              <ChartTooltip
                labelFormatter={(v) => formatDate(String(v))}
                formatter={(value: number) => [value, "Orders"]}
              />
              <Area
                type="monotone"
                dataKey="orders"
                stroke={CHART_COLORS[0]}
                fill={CHART_COLORS[0]}
                fillOpacity={0.15}
                isAnimationActive={!reduce}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue over time" loading={query.isLoading}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={d?.ordersOverTime ?? []}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" tickFormatter={(v) => formatDate(v, "MMM d")} fontSize={11} />
              <YAxis tickFormatter={(v) => `${Math.round(v / 100 / 1_000_000)}M`} fontSize={11} width={40} />
              <ChartTooltip
                labelFormatter={(v) => formatDate(String(v))}
                formatter={(value: number) => [money(value), "Revenue"]}
              />
              <Area
                type="monotone"
                dataKey="revenueCents"
                stroke={CHART_COLORS[1]}
                fill={CHART_COLORS[1]}
                fillOpacity={0.15}
                isAnimationActive={!reduce}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Charts row 2: status donut + priority bar ───────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Orders by status" loading={query.isLoading}>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="55%" height={220}>
              <PieChart>
                <Pie
                  data={d?.byStatus ?? []}
                  dataKey="orders"
                  nameKey="status"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  isAnimationActive={!reduce}
                >
                  {(d?.byStatus ?? []).map((s, i) => (
                    <Cell key={s.status} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip formatter={(value: number, name: string) => [value, statusLabel.get(name)?.label ?? name]} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="flex-1 space-y-1.5 text-sm">
              {(d?.byStatus ?? []).map((s, i) => (
                <li key={s.status} className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="flex-1 truncate">{statusLabel.get(s.status)?.label ?? s.status}</span>
                  <span className="tabular-nums text-muted-foreground">{s.orders}</span>
                </li>
              ))}
            </ul>
          </div>
        </ChartCard>

        <ChartCard title="Orders by priority" loading={query.isLoading}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d?.byPriority ?? []}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="priority" tickFormatter={(v) => priorityLabel.get(String(v))?.label ?? String(v)} fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} width={32} />
              <ChartTooltip formatter={(value: number) => [value, "Orders"]} labelFormatter={(v) => priorityLabel.get(String(v))?.label ?? String(v)} />
              <Bar dataKey="orders" radius={[6, 6, 0, 0]} isAnimationActive={!reduce}>
                {(d?.byPriority ?? []).map((p, i) => (
                  <Cell key={p.priority} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Company-wide widgets (admin scope) ──────────────────────────── */}
      {d?.scope === "company" ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <ListCard
              title="Top staff by orders handled"
              icon={Users}
              loading={query.isLoading}
              empty={(d?.topStaff ?? []).length === 0}
              rows={(d?.topStaff ?? []).map((s) => ({
                key: s.name,
                primary: s.name,
                value: `${s.orders} orders`,
                sub: money(s.revenueCents),
              }))}
            />
            <ListCard
              title="Top customers by spend"
              icon={Crown}
              loading={query.isLoading}
              empty={(d?.topCustomers ?? []).length === 0}
              rows={(d?.topCustomers ?? []).map((c) => ({
                key: c.name,
                primary: c.name,
                badge: c.tier ? { label: c.tier, color: c.tierColor ?? "slate" } : undefined,
                value: money(c.spendCents),
                sub: `${c.orders} orders`,
              }))}
            />
            <ListCard
              title="Top products by revenue"
              icon={Boxes}
              loading={query.isLoading}
              empty={(d?.topProducts ?? []).length === 0}
              rows={(d?.topProducts ?? []).map((p) => ({
                key: p.sku,
                primary: p.name,
                value: money(p.revenueCents),
                sub: `${p.units} units`,
              }))}
            />
          </div>

          <ChartCard title="Printer utilization" loading={query.isLoading}>
            {(d?.printerUtilization ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No print jobs in this range.</p>
            ) : (
              <ul className="space-y-2">
                {(() => {
                  const rows = d?.printerUtilization ?? [];
                  const max = Math.max(...rows.map((r) => r.printMinutes), 1);
                  return rows.map((r) => (
                    <li key={`${r.brand}-${r.model}`} className="grid grid-cols-[10rem_1fr_auto_auto_auto] items-center gap-3 text-sm">
                      <span className="flex items-center gap-1.5 truncate">
                        <PrinterIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className={cn("truncate rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeClass(r.color))} title={`${r.brand} ${r.model}`}>
                          {r.model}
                        </span>
                      </span>
                      <div className="h-2.5 overflow-hidden rounded-full bg-muted/50">
                        <motion.div
                          initial={reduce ? false : { width: 0 }}
                          animate={{ width: `${Math.max((r.printMinutes / max) * 100, 2)}%` }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                          className="h-full rounded-full bg-indigo-500/80 dark:bg-indigo-400/70"
                        />
                      </div>
                      <span className="tabular-nums text-muted-foreground">{r.orders} orders</span>
                      <span className="w-16 text-right tabular-nums">{formatMinutes(r.printMinutes)}</span>
                      <span
                        className="w-20 text-right text-xs tabular-nums text-muted-foreground"
                        title="Average queued → started wait (last 90 days)"
                      >
                        {r.avgQueueWaitMinutes != null ? `~${formatMinutes(r.avgQueueWaitMinutes)} wait` : "—"}
                      </span>
                    </li>
                  ));
                })()}
              </ul>
            )}
          </ChartCard>
        </>
      ) : null}

      {/* ── Recent activity ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <ActivityIcon className="size-4 text-primary" aria-hidden />
          <CardTitle className="text-base">Recent activity</CardTitle>
          <Link href="/activity" className="ml-auto text-xs text-muted-foreground hover:text-foreground">
            View all →
          </Link>
        </CardHeader>
        <CardContent>
          {activityQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : (
            <ul className="space-y-2 text-sm">
              {(activityQuery.data ?? []).map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate">{a.summary}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ChartCard({ title, loading, children }: { title: string; loading: boolean; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{loading ? <Skeleton className="h-56 w-full rounded-lg" /> : children}</CardContent>
    </Card>
  );
}

function ListCard({
  title,
  icon: Icon,
  loading,
  empty,
  rows,
}: {
  title: string;
  icon: typeof Users;
  loading: boolean;
  empty: boolean;
  rows: { key: string; primary: string; value: string; sub?: string; badge?: { label: string; color: string } }[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <Icon className="size-4 text-primary" aria-hidden />
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : empty ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No data in this range.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map((r) => (
              <li key={r.key} className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{r.primary}</span>
                  {r.badge ? (
                    <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset", badgeClass(r.badge.color))}>
                      {r.badge.label}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="font-medium tabular-nums">{r.value}</span>
                  {r.sub ? <span className="block text-xs text-muted-foreground">{r.sub}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
