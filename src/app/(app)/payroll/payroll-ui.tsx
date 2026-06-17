"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import type { Tone } from "@/lib/payroll/formulas";

export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  low: "text-amber-600 dark:text-amber-400",
  loss: "text-red-600 dark:text-red-400",
  muted: "text-foreground",
};
export const TONE_CHIP: Record<Tone, string> = {
  ok: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  low: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  loss: "bg-red-500/10 text-red-600 dark:text-red-400",
  muted: "bg-muted text-muted-foreground",
};
/** Tone-colored hairline accent across the top edge of a card. */
export const TONE_ACCENT: Record<Tone, string> = {
  ok: "from-emerald-500/70",
  low: "from-amber-500/70",
  loss: "from-red-500/70",
  muted: "from-primary/40",
};
/** Soft radial glow that fades in behind the card icon on hover. */
export const TONE_GLOW: Record<Tone, string> = {
  ok: "bg-emerald-500/25",
  low: "bg-amber-500/25",
  loss: "bg-red-500/25",
  muted: "bg-primary/15",
};

export const money = (cents: number, currency: string) => formatMoney(Math.round(cents), currency);

/** Ease-out count-up; reduced motion returns the target instantly. */
export function useCountUp(target: number, durationMs = 650): number {
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
      setAnimated(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, reduce]);
  return reduce ? target : animated;
}

export function KpiCard({
  label,
  value,
  render,
  tone = "muted",
  sub,
  index,
  icon: Icon,
  trendPct,
}: {
  label: string;
  value: number;
  render: (n: number) => string;
  tone?: Tone;
  sub?: string;
  index: number;
  icon: LucideIcon;
  trendPct?: number | null;
}) {
  const reduce = useReducedMotion();
  const n = useCountUp(value);
  const up = (trendPct ?? 0) >= 0;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reduce ? undefined : { y: -3 }}
      transition={{ type: "spring", stiffness: 260, damping: 22, delay: reduce ? 0 : index * 0.06 }}
    >
      <Card className="group relative overflow-hidden transition-shadow duration-300 hover:shadow-lg hover:shadow-black/[0.06] dark:hover:shadow-black/30">
        <span aria-hidden className={cn("absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r to-transparent opacity-80", TONE_ACCENT[tone])} />
        <span aria-hidden className={cn("pointer-events-none absolute -right-8 -top-8 size-24 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100", TONE_GLOW[tone])} />
        <CardContent className="relative space-y-2 p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110", TONE_CHIP[tone])}>
              <Icon className="size-4" aria-hidden />
            </span>
          </div>
          <p className={cn("text-2xl font-semibold tabular-nums", TONE_TEXT[tone])}>{render(n)}</p>
          <div className="flex items-center gap-2">
            {trendPct != null && Number.isFinite(trendPct) ? (
              <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {Math.abs(trendPct).toFixed(1)}%
              </span>
            ) : null}
            {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
