"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { CircleCheck, CircleX, Clock, Loader } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMinutes } from "@/lib/format";

/**
 * Print state chip (spec v4, Module 2). For a running print it renders a LIVE
 * countdown to print_started_at + estimated minutes (ticking every 15s — chips
 * appear in table rows, so per-second timers would be wasteful), flipping to an
 * amber "+Xm over" once the estimate is exceeded. GPU-friendly animation only
 * (opacity pulse on the dot); fully static under prefers-reduced-motion.
 */

export type PrintState = "not_started" | "printing" | "completed" | "failed" | (string & {});

function remainingMinutes(startedAt: string, estimatedMinutes: number, now: number): number {
  const deadline = new Date(startedAt).getTime() + estimatedMinutes * 60_000;
  return Math.round((deadline - now) / 60_000);
}

export function PrintChip({
  state,
  startedAt,
  estimatedMinutes,
  actualMinutes,
  className,
}: {
  state: PrintState;
  startedAt: string | null;
  estimatedMinutes: number | null;
  actualMinutes?: number | null;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());

  const running = state === "printing" && !!startedAt;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [running]);

  if (state === "completed") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset dark:bg-emerald-400/10 dark:text-emerald-300",
          className,
        )}
      >
        <CircleCheck className="size-3" aria-hidden />
        Printed{actualMinutes ? ` · ${formatMinutes(actualMinutes)}` : ""}
      </span>
    );
  }

  if (state === "failed") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-600/20 ring-inset dark:bg-red-400/10 dark:text-red-300",
          className,
        )}
      >
        <CircleX className="size-3" aria-hidden />
        Print failed
      </span>
    );
  }

  if (running && estimatedMinutes && estimatedMinutes > 0) {
    const left = remainingMinutes(startedAt!, estimatedMinutes, now);
    const over = left < 0;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset tabular-nums",
          over
            ? "bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-300"
            : "bg-blue-100 text-blue-700 ring-blue-600/20 dark:bg-blue-400/10 dark:text-blue-300",
          className,
        )}
        title={`Started ${new Date(startedAt!).toLocaleString()} · estimated ${formatMinutes(estimatedMinutes)}`}
      >
        <motion.span
          aria-hidden
          className={cn("size-1.5 rounded-full", over ? "bg-amber-500" : "bg-blue-500")}
          animate={reduce ? undefined : { opacity: [1, 0.3, 1] }}
          transition={reduce ? undefined : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
        {over ? `+${formatMinutes(-left)} over` : `${formatMinutes(Math.max(left, 1))} left`}
      </span>
    );
  }

  if (state === "printing") {
    // Running but no estimate recorded — show elapsed-style indicator.
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-600/20 ring-inset dark:bg-blue-400/10 dark:text-blue-300",
          className,
        )}
      >
        <Loader className={cn("size-3", !reduce && "animate-spin [animation-duration:2.5s]")} aria-hidden />
        Printing
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border ring-inset",
        className,
      )}
    >
      <Clock className="size-3" aria-hidden />
      Not started
    </span>
  );
}
