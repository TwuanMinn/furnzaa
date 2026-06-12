"use client";

import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { formatMinutes, formatMoney } from "@/lib/format";
import type { UserPerformance } from "@/app/api/users/[id]/performance/route";

/**
 * Performance tab on the user detail sheet. Numbers come from the cached
 * layer (per-staff orders cube, schedule rows, feedback matview, activity
 * rollup) via /api/users/[id]/performance — same access rules as the heatmap.
 */
export function UserPerformancePanel({ userId }: { userId: string }) {
  const reduce = useReducedMotion();

  const query = useQuery({
    queryKey: ["user-performance", userId],
    queryFn: async (): Promise<UserPerformance> => {
      const res = await fetch(`/api/users/${userId}/performance`);
      const body = (await res.json()) as { ok: boolean; data?: UserPerformance; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Failed to load");
      return body.data;
    },
    staleTime: 60_000,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <ErrorState
        title="Couldn't load performance"
        description={query.error instanceof Error ? query.error.message : undefined}
      />
    );
  }

  const d = query.data;
  const delta = d.orders.thisMonth - d.orders.lastMonth;
  const TrendIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const deliveredPct =
    d.orders.total > 0 ? Math.round((d.orders.delivered / d.orders.total) * 100) : null;

  const tiles: { label: string; value: string; sub: string; tone?: string }[] = [
    {
      label: "Orders handled",
      value: String(d.orders.total),
      sub: `${d.orders.thisMonth} this month vs ${d.orders.lastMonth} last`,
      tone:
        delta > 0
          ? "text-emerald-600 dark:text-emerald-400"
          : delta < 0
            ? "text-red-600 dark:text-red-400"
            : "text-muted-foreground",
    },
    {
      label: "Revenue handled",
      value: formatMoney(d.orders.revenueCents, d.currency),
      sub: deliveredPct != null ? `${deliveredPct}% delivered` : "no orders yet",
    },
    {
      label: "Prints",
      value: String(d.prints.completed),
      sub:
        d.prints.successRatePct != null
          ? `${d.prints.successRatePct}% success · ${d.prints.failed} failed`
          : "no prints yet",
    },
    {
      label: "Print efficiency",
      value: d.prints.efficiencyPct != null ? `${d.prints.efficiencyPct}%` : "—",
      sub: "estimate ÷ actual — above 100% beats the estimate",
      tone:
        d.prints.efficiencyPct == null
          ? undefined
          : d.prints.efficiencyPct >= 100
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Feedback resolved",
      value: String(d.feedback.resolved),
      sub:
        d.feedback.medianResolutionHours != null
          ? `median ${d.feedback.medianResolutionHours.toFixed(1)}h to resolve`
          : "no resolutions yet",
    },
    {
      label: "Activity (30d)",
      value: String(d.activity30d.actions),
      sub: `${d.activity30d.activeDays} active days · ${d.activity30d.logins} logins`,
    },
  ];

  const maxMonthly = Math.max(...d.orders.monthly.map((m) => m.orders), 1);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile, i) => (
          <motion.div
            key={tile.label}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: reduce ? 0 : i * 0.04, ease: "easeOut" }}
            className="rounded-lg border border-border p-3"
          >
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {tile.label}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-xl font-semibold tabular-nums">
              {tile.value}
              {tile.label === "Orders handled" ? (
                <TrendIcon className={cn("size-4", tile.tone)} aria-hidden />
              ) : null}
            </p>
            <p className={cn("mt-0.5 text-xs text-muted-foreground", tile.label === "Print efficiency" && tile.tone)}>
              {tile.sub}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Orders per month — last 6 months */}
      <div className="rounded-lg border border-border p-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Orders handled per month
        </p>
        <div className="flex h-24 items-end gap-2">
          {d.orders.monthly.map((m) => (
            <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
              <motion.div
                initial={reduce ? false : { height: 0 }}
                animate={{ height: `${Math.max((m.orders / maxMonthly) * 100, m.orders > 0 ? 6 : 2)}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                title={`${m.orders} order(s) · ${formatMoney(m.revenueCents, d.currency)}`}
                className={cn(
                  "w-full rounded-t",
                  m.orders > 0 ? "bg-primary/70" : "bg-muted",
                )}
              />
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {new Date(Number(m.month.slice(0, 4)), Number(m.month.slice(5, 7)) - 1, 1).toLocaleString(
                  [],
                  { month: "short" },
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
