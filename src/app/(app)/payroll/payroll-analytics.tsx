"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Banknote, CircleDollarSign, Clock, Gauge, Receipt, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { formatDate, formatMoney } from "@/lib/format";
import { KpiCard, money } from "./payroll-ui";
import type { PayrollData } from "@/lib/payroll/types";

const EMPLOYER = "#6366f1"; // indigo
const NET = "#10b981"; // emerald
const OVERTIME = "#f59e0b"; // amber
const BAR_HEX: Record<string, string> = {
  slate: "#64748b", blue: "#3b82f6", indigo: "#6366f1", green: "#22c55e", amber: "#f59e0b", red: "#ef4444", violet: "#8b5cf6",
};
const TOOLTIP_STYLE = {
  borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)",
  color: "var(--popover-foreground)", fontSize: 12,
} as const;

function ChartCard({ title, subtitle, index, children }: { title: string; subtitle?: string; index: number; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 24, delay: reduce ? 0 : 0.1 + index * 0.08 }}
    >
      <Card className="transition-shadow duration-300 hover:shadow-md hover:shadow-black/[0.04] dark:hover:shadow-black/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </motion.div>
  );
}

export function PayrollAnalytics({ currency }: { currency: string }) {
  const reduce = useReducedMotion();
  const q = useQuery({
    queryKey: ["payroll-analytics"],
    staleTime: 60_000,
    queryFn: async (): Promise<PayrollData> => {
      const res = await fetch("/api/payroll");
      const body = (await res.json()) as { ok: boolean; data?: PayrollData; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Failed to load");
      return body.data;
    },
  });
  const data = q.data;

  const series = useMemo(
    () => (data?.series ?? []).map((p) => ({ month: p.month, employer: p.employerCostCents / 100, net: p.netCents / 100, ot: p.overtimeCents / 100 })),
    [data?.series],
  );
  const deptBars = useMemo(
    () => (data?.byDepartment ?? []).map((d) => ({ name: d.name, cost: d.employerCostCents / 100, hex: BAR_HEX[d.color] ?? BAR_HEX.slate })),
    [data?.byDepartment],
  );
  const earners = useMemo(
    () => (data?.topEarners ?? []).map((e) => ({ name: e.name, net: e.netCents / 100 })),
    [data?.topEarners],
  );

  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>
      </div>
    );
  }
  if (q.error) {
    return <div className="rounded-lg border border-border"><ErrorState description={q.error instanceof Error ? q.error.message : "Failed to load"} /></div>;
  }
  if (!data) return null;

  const k = data.kpis;
  const trend = (cur: number, prev: number | undefined | null) => (prev && prev > 0 ? ((cur - prev) / prev) * 100 : null);
  const moneyTip = (v: number | string) => formatMoney(Math.round(Number(v) * 100), currency);
  const monthTick = (v: string) => formatDate(v, "MMM yy");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard index={0} icon={Banknote} label="Total payroll cost" value={k.totalEmployerCostCents} render={(n) => money(n, currency)} sub="latest period" trendPct={trend(k.totalEmployerCostCents, data.prev?.employerCostCents)} />
        <KpiCard index={1} icon={CircleDollarSign} label="Total net pay" value={k.totalNetCents} render={(n) => money(n, currency)} tone="ok" trendPct={trend(k.totalNetCents, data.prev?.netCents)} />
        <KpiCard index={2} icon={Receipt} label="Deductions + tax" value={k.totalDeductionsCents} render={(n) => money(n, currency)} tone="loss" />
        <KpiCard index={3} icon={Users} label="Headcount" value={k.headcount} render={(n) => String(Math.round(n))} />
        <KpiCard index={4} icon={Gauge} label="Average net" value={k.avgNetCents} render={(n) => money(n, currency)} />
        <KpiCard index={5} icon={Clock} label="Overtime cost" value={k.totalOvertimeCents} render={(n) => money(n, currency)} tone="low" />
      </div>

      {series.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">No approved payroll runs yet. Calculate and approve a run to see salary-cost analytics.</CardContent></Card>
      ) : (
        <>
          <ChartCard title="Salary cost over time" subtitle="Employer cost vs net pay per month." index={0}>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="payEmployer" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={EMPLOYER} stopOpacity={0.3} /><stop offset="100%" stopColor={EMPLOYER} stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="payNet" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={NET} stopOpacity={0.3} /><stop offset="100%" stopColor={NET} stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={monthTick} stroke="currentColor" opacity={0.5} />
                  <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} width={70} />
                  <ChartTooltip formatter={(v: number | string, n: string) => [moneyTip(v), n === "employer" ? "Employer cost" : "Net pay"]} labelFormatter={(l: string) => formatDate(l, "MMMM yyyy")} contentStyle={TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="employer" stroke={EMPLOYER} fill="url(#payEmployer)" strokeWidth={2} isAnimationActive={!reduce} animationEasing="ease-out" animationDuration={650} />
                  <Area type="monotone" dataKey="net" stroke={NET} fill="url(#payNet)" strokeWidth={2.25} isAnimationActive={!reduce} animationEasing="ease-out" animationBegin={reduce ? 0 : 180} animationDuration={750} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Cost by department" subtitle="Employer cost, latest period." index={1}>
              <div className="h-64">
                {deptBars.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">No department data.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deptBars} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                      <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} width={70} />
                      <ChartTooltip formatter={(v: number | string) => [moneyTip(v), "Employer cost"]} contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="cost" radius={[4, 4, 0, 0]} isAnimationActive={!reduce} animationEasing="ease-out" animationDuration={650}>
                        {deptBars.map((d, i) => <Cell key={i} fill={d.hex} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ChartCard>

            <ChartCard title="Top earners" subtitle="Highest net pay, latest period." index={2}>
              <div className="h-64">
                {earners.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">No data.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={earners} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} width={110} />
                      <ChartTooltip formatter={(v: number | string) => [moneyTip(v), "Net"]} contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="net" fill={NET} radius={[0, 4, 4, 0]} isAnimationActive={!reduce} animationEasing="ease-out" animationDuration={750} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ChartCard>
          </div>

          <ChartCard title="Overtime cost trend" subtitle="Total overtime pay per month." index={3}>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={monthTick} stroke="currentColor" opacity={0.5} />
                  <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} width={70} />
                  <ChartTooltip formatter={(v: number | string) => [moneyTip(v), "Overtime"]} labelFormatter={(l: string) => formatDate(l, "MMMM yyyy")} contentStyle={TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="ot" stroke={OVERTIME} strokeWidth={2.25} dot={{ r: 2.5, fill: OVERTIME }} isAnimationActive={!reduce} animationEasing="ease-out" animationDuration={800} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  );
}
