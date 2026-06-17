"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import type { RoiData } from "@/lib/roi/types";

const INVESTED = "#f59e0b"; // amber
const RECOVERED = "#10b981"; // emerald
const ROI_LINE = "#6366f1"; // indigo
const LOSS = "#ef4444"; // red

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: 12,
} as const;

function ChartCard({
  title,
  subtitle,
  index,
  children,
}: {
  title: string;
  subtitle?: string;
  index: number;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut", delay: reduce ? 0 : 0.1 + index * 0.08 }}
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </motion.div>
  );
}

const monthTick = (v: string) => formatDate(v, "MMM yy");

export function RoiCharts({
  data,
  currency,
  chartKey,
}: {
  data: RoiData;
  currency: string;
  chartKey: string;
}) {
  const reduce = useReducedMotion();

  const chartData = useMemo(
    () =>
      data.series.map((p) => ({
        month: p.month,
        invested: p.cumulativeInvestedCents / 100,
        recovered: p.cumulativeRecoveredCents / 100,
        monthlyProfit: p.profitCents / 100,
        roi: p.roiPct,
      })),
    [data.series],
  );

  // Break-even crossover marker (first month recovered ≥ invested).
  const crossover = useMemo(() => {
    const hit = data.series.find((p) => p.cumulativeRecoveredCents >= p.cumulativeInvestedCents && p.cumulativeInvestedCents > 0);
    return hit?.month ?? null;
  }, [data.series]);

  const moneyTip = (value: number | string, name: string) => [
    formatMoney(Math.round(Number(value) * 100), currency),
    name === "invested" ? "Invested" : "Recovered",
  ];

  if (chartData.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          No cash-flow activity yet. Add capital and revenue entries to see recovery over time.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Investment vs Recovery progress ───────────────────────────────────── */}
      <ChartCard
        title="Investment vs recovery"
        subtitle="Cumulative capital invested vs cumulative recovered — they cross at break-even."
        index={0}
      >
        <div className="h-72" key={`${chartKey}-area`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="roiInvested" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={INVESTED} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={INVESTED} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="roiRecovered" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={RECOVERED} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={RECOVERED} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={monthTick} stroke="currentColor" opacity={0.5} />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} width={70} />
              <ChartTooltip
                formatter={moneyTip}
                labelFormatter={(l: string) => formatDate(l, "MMMM yyyy")}
                contentStyle={TOOLTIP_STYLE}
              />
              {crossover ? (
                <ReferenceLine
                  x={crossover}
                  stroke={RECOVERED}
                  strokeDasharray="4 4"
                  label={{ value: "Break-even", position: "insideTopRight", fontSize: 10, fill: RECOVERED }}
                />
              ) : null}
              <Area type="monotone" dataKey="invested" stroke={INVESTED} fill="url(#roiInvested)" strokeWidth={2} isAnimationActive={!reduce} animationDuration={500} />
              <Area type="monotone" dataKey="recovered" stroke={RECOVERED} fill="url(#roiRecovered)" strokeWidth={2} isAnimationActive={!reduce} animationDuration={500} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Monthly profit ──────────────────────────────────────────────────── */}
        <ChartCard title="Monthly profit" subtitle="Revenue − cost per month (mint = profit, red = loss)." index={1}>
          <div className="h-64" key={`${chartKey}-bar`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={monthTick} stroke="currentColor" opacity={0.5} />
                <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} width={70} />
                <ChartTooltip
                  formatter={(v: number | string) => [formatMoney(Math.round(Number(v) * 100), currency), "Profit"]}
                  labelFormatter={(l: string) => formatDate(l, "MMMM yyyy")}
                  contentStyle={TOOLTIP_STYLE}
                />
                <ReferenceLine y={0} stroke="currentColor" opacity={0.3} />
                <Bar dataKey="monthlyProfit" radius={[4, 4, 0, 0]} isAnimationActive={!reduce} animationDuration={500}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.monthlyProfit >= 0 ? RECOVERED : LOSS} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* ── ROI % over time ─────────────────────────────────────────────────── */}
        <ChartCard title="ROI growth over time" subtitle="Cumulative ROI % — crosses 0% at break-even." index={2}>
          <div className="h-64" key={`${chartKey}-line`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={monthTick} stroke="currentColor" opacity={0.5} />
                <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} width={50} tickFormatter={(v: number) => `${v}%`} />
                <ChartTooltip
                  formatter={(v: number | string) => [`${Number(v).toFixed(1)}%`, "ROI"]}
                  labelFormatter={(l: string) => formatDate(l, "MMMM yyyy")}
                  contentStyle={TOOLTIP_STYLE}
                />
                <ReferenceLine y={0} stroke="currentColor" strokeDasharray="4 4" opacity={0.4} />
                <Line type="monotone" dataKey="roi" stroke={ROI_LINE} strokeWidth={2} dot={false} isAnimationActive={!reduce} animationDuration={600} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
