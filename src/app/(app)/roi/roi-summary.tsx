"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Banknote, CircleDollarSign, Gauge, PiggyBank, TrendingUp, Trophy, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { addMonths, breakEvenMeta, estimatePayback, signTone, type Tone } from "@/lib/roi/formulas";
import type { RoiData } from "@/lib/roi/types";

const TONE_TEXT: Record<Tone, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  low: "text-amber-600 dark:text-amber-400",
  loss: "text-red-600 dark:text-red-400",
  muted: "text-foreground",
};
const TONE_CHIP: Record<Tone, string> = {
  ok: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  low: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  loss: "bg-red-500/10 text-red-600 dark:text-red-400",
  muted: "bg-muted text-muted-foreground",
};
const TONE_BADGE: Record<Tone, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400",
  low: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400",
  loss: "bg-red-500/10 text-red-700 ring-red-500/25 dark:text-red-400",
  muted: "bg-muted text-muted-foreground ring-border",
};

/** Ease-out count-up; animates from the previous value to the new target.
 *  Reduced motion → returns the target directly (no animation, no setState). */
function useCountUp(target: number, durationMs = 650): number {
  const reduce = useReducedMotion();
  const [animated, setAnimated] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (reduce) {
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    let raf = 0;
    let startTs = 0;
    const tick = (now: number) => {
      if (!startTs) startTs = now;
      const t = Math.min(1, (now - startTs) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimated(from + (target - from) * eased); // async (rAF), not a cascading render
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduce]);
  return reduce ? target : animated;
}

function KpiCard({
  label,
  value,
  render,
  tone = "muted",
  sub,
  index,
  icon: Icon,
  progress,
}: {
  label: string;
  value: number;
  render: (n: number) => string;
  tone?: Tone;
  sub?: string;
  index: number;
  icon: LucideIcon;
  progress?: number;
}) {
  const reduce = useReducedMotion();
  const n = useCountUp(value);
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut", delay: reduce ? 0 : index * 0.06 }}
    >
      <Card className="overflow-hidden">
        <CardContent className="space-y-2 p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-lg", TONE_CHIP[tone])}>
              <Icon className="size-4" aria-hidden />
            </span>
          </div>
          <p className={cn("text-2xl font-semibold tabular-nums", TONE_TEXT[tone])}>{render(n)}</p>
          {progress != null ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                transition={{ duration: 0.6, ease: "easeOut", delay: reduce ? 0 : 0.25 }}
              />
            </div>
          ) : null}
          {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** Derive an overall break-even status for the portfolio (single key in DB). */
function portfolioStatus(data: RoiData): string {
  if (data.scope === "investment") return data.breakEvenStatus ?? "pending";
  const k = data.kpis;
  if (k.totalCapitalCents <= 0) return "pending";
  if (k.recoveryPct >= 100) return "recovered";
  if (k.recoveredCents <= 0) return "underperforming";
  return "in_progress";
}

const money = (cents: number, currency: string) => formatMoney(Math.round(cents), currency);
const pct = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;

export function RoiSummary({ data, currency }: { data: RoiData; currency: string }) {
  const reduce = useReducedMotion();
  const k = data.kpis;
  const status = portfolioStatus(data);
  const meta = breakEvenMeta(status);

  const payback = estimatePayback(
    k.totalCapitalCents,
    k.recoveredCents,
    data.series.map((p) => ({ profitCents: p.profitCents, cumulativeRecoveredCents: p.cumulativeRecoveredCents })),
  );

  // Predicted break-even date.
  let breakEvenDate = "—";
  const lastMonth = data.series[data.series.length - 1]?.month;
  if (payback.recovered) {
    const crossing = data.series.find((p) => p.cumulativeRecoveredCents >= p.cumulativeInvestedCents);
    breakEvenDate = crossing ? crossing.month : data.startDate ?? "—";
  } else if (!payback.notRecoverable && payback.monthsLeft != null && lastMonth) {
    breakEvenDate = addMonths(lastMonth, payback.monthsLeft);
  }
  const breakEvenLabel = breakEvenDate === "—"
    ? "—"
    : new Date(`${breakEvenDate}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });

  return (
    <div className="space-y-4">
      {/* ── 6 summary cards ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard index={0} icon={Banknote} label="Total investment" value={k.totalCapitalCents} render={(n) => money(n, currency)} />
        <KpiCard index={1} icon={CircleDollarSign} label="Total revenue" value={k.totalRevenueCents} render={(n) => money(n, currency)} />
        <KpiCard
          index={2}
          icon={PiggyBank}
          label="Total profit"
          value={k.recoveredCents}
          render={(n) => money(n, currency)}
          tone={signTone(k.recoveredCents)}
          sub="Revenue − cost (recovered)"
        />
        <KpiCard
          index={3}
          icon={TrendingUp}
          label="ROI %"
          value={k.roiPct}
          render={pct}
          tone={signTone(k.roiPct)}
          sub="Net of capital"
        />
        <KpiCard
          index={4}
          icon={Gauge}
          label="Recovery %"
          value={k.recoveryPct}
          render={pct}
          tone={k.recoveryPct >= 100 ? "ok" : "muted"}
          progress={k.recoveryPct}
        />
        {/* Break-even status — badge, no count-up */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut", delay: reduce ? 0 : 5 * 0.06 }}
        >
          <Card className="overflow-hidden">
            <CardContent className="space-y-2 p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Break-even status</p>
                <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-lg", TONE_CHIP[meta.tone])}>
                  <Trophy className="size-4" aria-hidden />
                </span>
              </div>
              <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium ring-1 ring-inset", TONE_BADGE[meta.tone])}>
                {meta.label}
              </span>
              <p className="text-xs text-muted-foreground">{payback.label}</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── Headline strip ──────────────────────────────────────────────────── */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut", delay: reduce ? 0 : 0.4 }}
      >
        <Card>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Total investment" value={money(k.totalCapitalCents, currency)} />
            <Stat label="Recovered" value={money(k.recoveredCents, currency)} tone={signTone(k.recoveredCents)} />
            <Stat label="Remaining" value={money(k.remainingCents, currency)} />
            <Stat label="ROI %" value={pct(k.roiPct)} tone={signTone(k.roiPct)} />
            <Stat label="Payback period" value={payback.label} />
            <Stat label="Break-even date" value={breakEvenLabel} />
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function Stat({ label, value, tone = "muted" }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 truncate font-semibold tabular-nums", TONE_TEXT[tone])}>{value}</p>
    </div>
  );
}
