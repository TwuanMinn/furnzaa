"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { Star, TrendingDown, TrendingUp } from "lucide-react";
import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { formatDate } from "@/lib/format";
import type { FeedbackDailyRow } from "@/app/api/feedback/analytics/route";

/**
 * Feedback analytics (Module 8 sub-tab). All series derive client-side from
 * the small mv_feedback_daily cube; KPI cards read mv_feedback_summary —
 * nothing here touches the raw table.
 */

interface AnalyticsPayload {
  days: number;
  summary: Record<string, unknown> | null;
  daily: FeedbackDailyRow[];
  products: Record<string, unknown>[];
  staff: Record<string, unknown>[];
  repeatNegative: Record<string, unknown>[];
}

const DONUT_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b", "#06b6d4"];

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function FeedbackAnalytics({
  severities,
}: {
  severities: { key: string; label: string; color: string }[];
}) {
  const reduce = useReducedMotion();
  const [days, setDays] = useState(90);

  const query = useQuery({
    queryKey: ["feedback-analytics", days],
    queryFn: async (): Promise<AnalyticsPayload> => {
      const res = await fetch(`/api/feedback/analytics?days=${days}`);
      const body = (await res.json()) as { ok: boolean; data?: AnalyticsPayload; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Failed to load");
      return body.data;
    },
    staleTime: 60_000,
  });

  const derived = useMemo(() => {
    const daily = query.data?.daily ?? [];
    const byDay = new Map<string, { count: number; ratingSum: number }>();
    const byRating = new Map<number, number>();
    const byCategory = new Map<string, number>();
    const byChannel = new Map<string, number>();
    for (const row of daily) {
      const day = byDay.get(row.day) ?? { count: 0, ratingSum: 0 };
      day.count += row.feedback_count;
      day.ratingSum += row.rating * row.feedback_count;
      byDay.set(row.day, day);
      byRating.set(row.rating, (byRating.get(row.rating) ?? 0) + row.feedback_count);
      byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.feedback_count);
      byChannel.set(row.source_channel, (byChannel.get(row.source_channel) ?? 0) + row.feedback_count);
    }
    const series = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({
        day,
        count: v.count,
        avgRating: v.count > 0 ? Number((v.ratingSum / v.count).toFixed(2)) : null,
      }));
    const total = [...byRating.values()].reduce((s, v) => s + v, 0);
    return {
      series,
      total,
      ratings: [5, 4, 3, 2, 1].map((r) => ({
        rating: r,
        count: byRating.get(r) ?? 0,
        pct: total > 0 ? ((byRating.get(r) ?? 0) / total) * 100 : 0,
      })),
      categories: [...byCategory.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
      channels: [...byChannel.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value),
    };
  }, [query.data]);

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <ErrorState
        title="Couldn't load feedback analytics"
        description={query.error instanceof Error ? query.error.message : undefined}
      />
    );
  }

  const s = query.data.summary ?? {};
  const avgThis = num(s.avg_rating_this_month);
  const avgLast = num(s.avg_rating_last_month);
  const trendUp = avgThis >= avgLast;
  const totalAll = num(s.total_feedback);
  const resolvedPct = totalAll > 0 ? (num(s.resolved_count) / totalAll) * 100 : 0;
  const promoters = num(s.promoters);
  const passives = num(s.passives);
  const detractors = num(s.detractors);
  const npsBase = promoters + passives + detractors;
  const nps = npsBase > 0 ? Math.round(((promoters - detractors) / npsBase) * 100) : 0;

  const kpis = [
    {
      label: "Average rating",
      value: s.avg_rating != null ? `★ ${num(s.avg_rating).toFixed(2)}` : "—",
      sub:
        avgThis || avgLast
          ? `${avgThis.toFixed(2)} this month vs ${avgLast.toFixed(2)} last`
          : "no monthly data yet",
      icon: trendUp ? TrendingUp : TrendingDown,
      tone: trendUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
    },
    {
      label: "Total feedback",
      value: String(totalAll),
      sub: `${num(s.open_new) + num(s.open_in_progress)} open`,
    },
    {
      label: "% resolved",
      value: `${resolvedPct.toFixed(0)}%`,
      sub:
        s.avg_resolution_hours != null
          ? `avg ${num(s.avg_resolution_hours).toFixed(1)}h to resolve`
          : "no resolutions yet",
    },
    {
      label: "NPS-style score",
      value: String(nps),
      sub: `${promoters} promoters · ${passives} passive · ${detractors} detractors`,
    },
  ];

  const openBySeverity = severities.map((sev) => ({
    ...sev,
    count: num(s[`open_${sev.key}` as keyof typeof s]),
  }));

  return (
    <div className="space-y-4">
      {/* Range selector */}
      <div className="flex items-center justify-end gap-1">
        {[30, 90, 365].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            aria-pressed={days === d}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              days === d ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {d}d
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: reduce ? 0 : i * 0.05, ease: "easeOut" }}
          >
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {kpi.label}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-2xl font-semibold tabular-nums">
                  {kpi.value}
                  {kpi.icon ? <kpi.icon className={cn("size-4", kpi.tone)} aria-hidden /> : null}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{kpi.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Open by severity */}
      <div className="flex flex-wrap gap-2">
        {openBySeverity.map((sev) => (
          <span
            key={sev.key}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"
          >
            <span className={cn("size-2 rounded-full ring-1 ring-inset", `bg-transparent`)} aria-hidden />
            {sev.label}: <span className="font-medium tabular-nums">{sev.count}</span> open
          </span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Rating distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rating distribution ({query.data.days}d)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {derived.ratings.map((r) => (
              <div key={r.rating} className="flex items-center gap-2">
                <span className="flex w-10 items-center gap-0.5 text-xs tabular-nums">
                  {r.rating} <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                </span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    style={{ width: `${r.pct}%` }}
                    className={cn(
                      "h-full rounded-full transition-[width] duration-500 ease-out",
                      r.rating >= 4 ? "bg-emerald-500" : r.rating === 3 ? "bg-amber-400" : "bg-red-500",
                    )}
                  />
                </div>
                <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                  {r.count} · {r.pct.toFixed(0)}%
                </span>
              </div>
            ))}
            {derived.total === 0 ? (
              <p className="text-sm text-muted-foreground">No feedback in this period.</p>
            ) : null}
          </CardContent>
        </Card>

        {/* Volume + average rating over time */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Volume & average rating over time</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {derived.series.length === 0 ? (
              <p className="text-sm text-muted-foreground">No feedback in this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={derived.series} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(d: string) => formatDate(d)}
                    minTickGap={32}
                  />
                  <YAxis yAxisId="count" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis yAxisId="rating" orientation="right" domain={[1, 5]} hide />
                  <Tooltip
                    labelFormatter={(d) => formatDate(String(d))}
                    formatter={(value: number, name: string) => [
                      name === "avgRating" ? value.toFixed(2) : value,
                      name === "avgRating" ? "Avg rating" : "Feedback",
                    ]}
                  />
                  <Line
                    yAxisId="count"
                    type="monotone"
                    dataKey="count"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={!reduce}
                  />
                  <Line
                    yAxisId="rating"
                    type="monotone"
                    dataKey="avgRating"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={!reduce}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Category donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feedback by category ({query.data.days}d)</CardTitle>
          </CardHeader>
          <CardContent className="flex h-56 items-center gap-4">
            {derived.categories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No feedback in this period.</p>
            ) : (
              <>
                <ResponsiveContainer width="55%" height="100%">
                  <PieChart>
                    <Pie
                      data={derived.categories}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="55%"
                      outerRadius="85%"
                      paddingAngle={2}
                      isAnimationActive={!reduce}
                    >
                      {derived.categories.map((entry, i) => (
                        <Cell key={entry.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="flex-1 space-y-1.5 text-xs">
                  {derived.categories.slice(0, 7).map((c, i) => (
                    <li key={c.name} className="flex items-center gap-1.5">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                        aria-hidden
                      />
                      <span className="truncate">{c.name}</span>
                      <span className="ml-auto tabular-nums text-muted-foreground">{c.value}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        {/* Channel bars */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By source channel ({query.data.days}d)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {derived.channels.length === 0 ? (
              <p className="text-sm text-muted-foreground">No feedback in this period.</p>
            ) : (
              derived.channels.map((c) => {
                const max = derived.channels[0]?.value ?? 1;
                return (
                  <div key={c.name} className="flex items-center gap-2">
                    <span className="w-24 truncate text-xs">{c.name}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        style={{ width: `${(c.value / max) * 100}%` }}
                        className="h-full rounded-full bg-primary/70 transition-[width] duration-500 ease-out"
                      />
                    </div>
                    <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                      {c.value}
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Rankings */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top products with negative feedback</CardTitle>
          </CardHeader>
          <CardContent>
            {query.data.products.length === 0 ? (
              <p className="text-sm text-muted-foreground">None — nice.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {query.data.products.map((p) => (
                  <li key={String(p.product_id)} className="flex items-center justify-between gap-2">
                    <span className="truncate">{String(p.product_name)}</span>
                    <span className="shrink-0 tabular-nums text-red-600 dark:text-red-400">
                      {num(p.negative_count)}× 1–2★
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resolver leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            {query.data.staff.length === 0 ? (
              <p className="text-sm text-muted-foreground">No resolutions yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {query.data.staff.map((u) => (
                  <li key={String(u.resolved_by)} className="flex items-center justify-between gap-2">
                    <span className="truncate">{String(u.full_name)}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {num(u.resolved_count)} · median {num(u.median_resolution_hours).toFixed(1)}h
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Repeat negative customers</CardTitle>
          </CardHeader>
          <CardContent>
            {query.data.repeatNegative.length === 0 ? (
              <p className="text-sm text-muted-foreground">No repeat detractors.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {query.data.repeatNegative.map((c) => (
                  <li key={String(c.customer_id)} className="flex items-center justify-between gap-2">
                    <span className="truncate">{String(c.name)}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {num(c.negative_count)}× negative
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
