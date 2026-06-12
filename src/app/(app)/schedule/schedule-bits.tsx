"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { badgeClass, DEFAULT_PRIORITY_COLORS } from "@/lib/badges";
import { formatMinutes } from "@/lib/format";

/**
 * Shared Production Schedule chips. Time is an external system: every clock
 * read goes through useSyncExternalStore on a 30s ticker so the React Compiler
 * never memoizes a stale Date.now() (same pattern as the messages countdown).
 */

function subscribeHalfMinute(cb: () => void) {
  const t = setInterval(cb, 30_000);
  return () => clearInterval(t);
}

/** Current time, re-evaluated every 30s tick (bucketed so getSnapshot stays stable). */
export function useNow(): number {
  const snapshot = () => Math.floor(Date.now() / 30_000) * 30_000;
  return useSyncExternalStore(subscribeHalfMinute, snapshot, snapshot);
}

export interface PrintProgress {
  /** 0–0.99 while running (clamped until "Complete print"), 0 when idle. */
  fraction: number;
  overdue: boolean;
  remainingMinutes: number;
}

export function printProgress(
  startedAt: string | null,
  estimatedMinutes: number | null,
  now: number,
): PrintProgress {
  if (!startedAt || !estimatedMinutes || now === 0)
    return { fraction: 0, overdue: false, remainingMinutes: estimatedMinutes ?? 0 };
  const elapsedMin = (now - new Date(startedAt).getTime()) / 60_000;
  return {
    fraction: Math.min(elapsedMin / estimatedMinutes, 0.99),
    overdue: elapsedMin > estimatedMinutes,
    remainingMinutes: Math.max(0, Math.round(estimatedMinutes - elapsedMin)),
  };
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset",
        badgeClass(DEFAULT_PRIORITY_COLORS[priority] ?? "slate"),
      )}
    >
      {priority}
    </span>
  );
}

/** Live countdown chip for a running print — amber "Overdue" past estimate. */
export function CountdownChip({
  startedAt,
  estimatedMinutes,
  className,
}: {
  startedAt: string | null;
  estimatedMinutes: number | null;
  className?: string;
}) {
  const now = useNow();
  const p = printProgress(startedAt, estimatedMinutes, now);
  if (!startedAt || !estimatedMinutes) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ring-1 ring-inset",
        p.overdue ? badgeClass("amber") : badgeClass("blue"),
        className,
      )}
    >
      {p.overdue ? "Overdue" : `${formatMinutes(p.remainingMinutes)} left`}
    </span>
  );
}

/** Compact animated progress ring for kanban cards (GPU-friendly stroke). */
export function MiniRing({
  startedAt,
  estimatedMinutes,
  size = 36,
}: {
  startedAt: string | null;
  estimatedMinutes: number | null;
  size?: number;
}) {
  const now = useNow();
  const p = printProgress(startedAt, estimatedMinutes, now);
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={4} className="stroke-muted" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - p.fraction)}
        className={cn(
          "transition-[stroke-dashoffset] duration-700 ease-out",
          p.overdue ? "stroke-amber-500" : "stroke-primary",
        )}
      />
    </svg>
  );
}

export const STATE_META: Record<
  string,
  { label: string; dot: string }
> = {
  queued: { label: "Queued", dot: "bg-slate-400" },
  printing: { label: "Printing", dot: "bg-blue-500" },
  completed: { label: "Completed", dot: "bg-emerald-500" },
  failed: { label: "Failed", dot: "bg-red-500" },
};
