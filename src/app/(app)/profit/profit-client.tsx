"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, FileText, Loader2, Printer as PrinterIcon, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { badgeClass } from "@/lib/badges";
import { formatDate, formatMinutes, formatMoney, toDateKey } from "@/lib/format";
import { downloadFromFetch } from "@/lib/export/csv";
import type { ProfitData } from "@/lib/datasets/profit";

const REVENUE_COLOR = "#6366f1"; // indigo-500
const COST_COLOR = "#f59e0b"; // amber-500
const PROFIT_COLOR = "#10b981"; // emerald-500

const PRESETS = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "All", days: null },
] as const;

export function ProfitClient({ currency }: { currency: string }) {
  const reduce = useReducedMotion();
  const [from, setFrom] = useState<string>(toDateKey(90));
  const [to, setTo] = useState<string>(toDateKey(0));
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const query = useQuery({
    queryKey: ["profit", from, to],
    staleTime: 60_000,
    queryFn: async (): Promise<ProfitData> => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/profit?${params}`);
      const body = (await res.json()) as { ok: boolean; data?: ProfitData; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Failed to load");
      return body.data;
    },
  });

  const data = query.data;

  const chartData = useMemo(
    () =>
      (data?.daily ?? []).map((d) => ({
        day: d.day,
        revenue: d.revenue_cents / 100,
        cost: d.total_cost_cents / 100,
        profit: d.gross_profit_cents / 100,
      })),
    [data?.daily],
  );

  const soldProducts = useMemo(
    () => (data?.products ?? []).filter((p) => p.units_sold > 0),
    [data?.products],
  );
  const best = useMemo(
    () => [...soldProducts].sort((a, b) => b.gross_profit_cents - a.gross_profit_cents).slice(0, 3),
    [soldProducts],
  );
  const worst = useMemo(
    () => [...soldProducts].sort((a, b) => a.gross_profit_cents - b.gross_profit_cents).slice(0, 3),
    [soldProducts],
  );
  const marginBars = useMemo(() => soldProducts.slice(0, 8), [soldProducts]);

  async function exportFile(format: "csv" | "pdf") {
    setExporting(format);
    try {
      await downloadFromFetch(`/api/export/profit?format=${format}`, `profit-${toDateKey()}.${format}`);
      toast.success(`Exported ${format.toUpperCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Toolbar: date range + presets + export ─────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="pf-from" className="text-xs text-muted-foreground">
              From
            </Label>
            <Input
              id="pf-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-36"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pf-to" className="text-xs text-muted-foreground">
              To
            </Label>
            <Input
              id="pf-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 w-36"
            />
          </div>
          <div className="flex items-center gap-1">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                variant="outline"
                size="sm"
                onClick={() => {
                  setFrom(p.days ? toDateKey(p.days) : "");
                  setTo(toDateKey(0));
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={exporting !== null} onClick={() => void exportFile("csv")}>
            {exporting === "csv" ? <Loader2 className="animate-spin" /> : <Download />}
            CSV
          </Button>
          <Button variant="outline" size="sm" disabled={exporting !== null} onClick={() => void exportFile("pdf")}>
            {exporting === "pdf" ? <Loader2 className="animate-spin" /> : <FileText />}
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open("/print/profit", "_blank", "noopener")}
          >
            <PrinterIcon /> Print
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      ) : query.error ? (
        <div className="rounded-lg border border-border">
          <ErrorState description={query.error.message} />
        </div>
      ) : data ? (
        <>
          {/* ── KPI cards ──────────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Revenue" value={formatMoney(data.kpis.revenueCents, currency)} sub={`${data.kpis.ordersCount.toLocaleString()} delivered & paid orders`} index={0} />
            <KpiCard label="Total cost" value={formatMoney(data.kpis.totalCostCents, currency)} sub="COGS + print material" index={1} />
            <KpiCard
              label="Gross profit"
              value={formatMoney(data.kpis.grossProfitCents, currency)}
              tone={data.kpis.grossProfitCents >= 0 ? "positive" : "negative"}
              sub={`${data.kpis.marginPercent}% margin`}
              index={2}
            />
            <KpiCard
              label="Inventory value"
              value={data.inventory ? formatMoney(data.inventory.valueCostCents, currency) : "—"}
              sub={
                data.inventory
                  ? `${formatMoney(data.inventory.valueRetailCents, currency)} retail · ${data.inventory.lowStockProducts} low stock`
                  : ""
              }
              index={3}
            />
          </div>

          {/* ── Revenue vs Cost time series ────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue vs cost</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  No delivered & paid orders in this date range.
                </p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                      <defs>
                        <linearGradient id="profitRev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={REVENUE_COLOR} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={REVENUE_COLOR} stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="profitCost" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COST_COLOR} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={COST_COLOR} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: string) => formatDate(v, "MMM d")}
                        stroke="currentColor"
                        opacity={0.5}
                      />
                      <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} width={70} />
                      <ChartTooltip
                        formatter={(value: number | string, name: string) => [
                          formatMoney(Math.round(Number(value) * 100), currency),
                          name === "revenue" ? "Revenue" : name === "cost" ? "Cost" : "Profit",
                        ]}
                        labelFormatter={(label: string) => formatDate(label)}
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid var(--border)",
                          background: "var(--popover)",
                          color: "var(--popover-foreground)",
                          fontSize: 12,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke={REVENUE_COLOR}
                        fill="url(#profitRev)"
                        strokeWidth={2}
                        isAnimationActive={!reduce}
                        animationDuration={400}
                      />
                      <Area
                        type="monotone"
                        dataKey="cost"
                        stroke={COST_COLOR}
                        fill="url(#profitCost)"
                        strokeWidth={2}
                        isAnimationActive={!reduce}
                        animationDuration={400}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* ── Margin by product ─────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Margin by product (top sellers, all-time)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {marginBars.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No sales yet.</p>
                ) : (
                  marginBars.map((p, i) => (
                    <div key={p.product_id} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate">{p.name}</span>
                        <span
                          className={`shrink-0 font-medium tabular-nums ${p.margin_percent < 0 ? "text-red-600 dark:text-red-400" : ""}`}
                        >
                          {p.margin_percent}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          initial={reduce ? false : { width: 0 }}
                          animate={{ width: `${Math.min(Math.max(p.margin_percent, 0), 100)}%` }}
                          transition={{ duration: 0.4, ease: "easeOut", delay: reduce ? 0 : i * 0.05 }}
                          className="h-full rounded-full"
                          style={{ backgroundColor: p.margin_percent >= 0 ? PROFIT_COLOR : COST_COLOR }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* ── Best / worst performers ───────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Best & worst performers (gross profit, all-time)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <PerformerList icon={TrendingUp} tone="positive" rows={best} currency={currency} />
                <PerformerList icon={TrendingDown} tone="negative" rows={worst} currency={currency} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* ── Printer breakdown ─────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By printer</CardTitle>
              </CardHeader>
              <CardContent>
                {data.printers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No print jobs recorded.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.printers.map((p) => (
                      <li key={p.printer_id} className="flex items-center gap-3 text-sm">
                        <span
                          className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeClass(p.badge_color)}`}
                        >
                          {p.brand} {p.model}
                        </span>
                        <span className="text-muted-foreground">
                          {p.orders_count} order(s) · {formatMinutes(Number(p.print_minutes))}
                        </span>
                        <span className="ml-auto font-medium tabular-nums">
                          {formatMoney(p.revenue_cents, currency)}
                        </span>
                        <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                          −{formatMoney(p.material_cost_cents, currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* ── Material breakdown ────────────────────────────────────────── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By material</CardTitle>
              </CardHeader>
              <CardContent>
                {data.materials.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No material usage recorded.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.materials.map((m) => (
                      <li key={m.material_type} className="flex items-center gap-3 text-sm">
                        <span className="inline-flex shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium uppercase">
                          {m.material_type.replace(/_/g, "/")}
                        </span>
                        <span className="text-muted-foreground">
                          {m.orders_count} order(s) · {Number(m.filament_grams).toLocaleString()} g
                        </span>
                        <span className="ml-auto font-medium tabular-nums">
                          {formatMoney(m.revenue_cents, currency)}
                        </span>
                        <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                          −{formatMoney(m.material_cost_cents, currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Product profitability table ────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Product profitability{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (all-time, refreshed every 5 min)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Product</th>
                    <th className="pb-2 text-right font-medium">Units</th>
                    <th className="pb-2 text-right font-medium">Revenue</th>
                    <th className="pb-2 text-right font-medium">Cost/unit</th>
                    <th className="pb-2 text-right font-medium">Profit/unit</th>
                    <th className="pb-2 text-right font-medium">Margin</th>
                    <th className="pb-2 text-right font-medium">Gross profit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.slice(0, 25).map((p) => (
                    <tr key={p.product_id} className="border-b last:border-0">
                      <td className="max-w-56 py-2">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{p.sku}</p>
                      </td>
                      <td className="py-2 text-right tabular-nums">{p.units_sold.toLocaleString()}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(p.revenue_cents, currency)}</td>
                      <td className="py-2 text-right text-muted-foreground tabular-nums">
                        {formatMoney(p.production_cost_cents, currency)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatMoney(p.profit_per_unit_cents, currency)}
                      </td>
                      <td
                        className={`py-2 text-right font-medium tabular-nums ${
                          p.margin_percent < 0
                            ? "text-red-600 dark:text-red-400"
                            : p.margin_percent >= 40
                              ? "text-emerald-600 dark:text-emerald-400"
                              : ""
                        }`}
                      >
                        {p.margin_percent}%
                      </td>
                      <td className="py-2 text-right font-medium tabular-nums">
                        {formatMoney(p.gross_profit_cents, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
  index,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
  index: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut", delay: reduce ? 0 : index * 0.05 }}
    >
      <Card>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p
            className={`text-2xl font-semibold tabular-nums ${
              tone === "positive"
                ? "text-emerald-600 dark:text-emerald-400"
                : tone === "negative"
                  ? "text-red-600 dark:text-red-400"
                  : ""
            }`}
          >
            {value}
          </p>
          {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function PerformerList({
  icon: Icon,
  tone,
  rows,
  currency,
}: {
  icon: typeof TrendingUp;
  tone: "positive" | "negative";
  rows: { product_id: string; name: string; units_sold: number; gross_profit_cents: number; margin_percent: number }[];
  currency: string;
}) {
  return (
    <div>
      <p
        className={`mb-1.5 flex items-center gap-1.5 text-xs font-medium ${
          tone === "positive" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
        }`}
      >
        <Icon className="size-3.5" aria-hidden />
        {tone === "positive" ? "Best performing" : "Worst performing"}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sold products yet.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((p) => (
            <li key={p.product_id} className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">
                {p.name}
                <span className="ml-1.5 text-xs text-muted-foreground">{p.units_sold} sold</span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">
                {formatMoney(p.gross_profit_cents, currency)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">({p.margin_percent}%)</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
