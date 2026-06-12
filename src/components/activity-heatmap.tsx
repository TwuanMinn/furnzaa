"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";

import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate } from "@/lib/format";
import type { HeatmapDay } from "@/app/api/users/[id]/heatmap/route";

/**
 * GitHub-style 12-month activity heatmap fed by the user_activity_daily
 * rollup (incrementally maintained — one indexed read, never a log scan).
 * Intensity = logins + actions for the day.
 */
export function ActivityHeatmap({ userId }: { userId: string }) {
  const reduce = useReducedMotion();

  const query = useQuery({
    queryKey: ["user-heatmap", userId],
    staleTime: 60_000,
    queryFn: async (): Promise<HeatmapDay[]> => {
      const res = await fetch(`/api/users/${userId}/heatmap`);
      const body = (await res.json()) as { ok: boolean; data?: { days: HeatmapDay[] }; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Failed to load heatmap");
      return body.data.days;
    },
  });

  const { weeks, maxCount, total } = useMemo(() => {
    const byDay = new Map<string, HeatmapDay>();
    for (const d of query.data ?? []) byDay.set(d.day, d);

    // Build 53 columns of 7 days ending today, starting on a Sunday.
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 364 - end.getDay());

    const weeks: { day: string; count: number; logins: number; actions: number }[][] = [];
    let max = 0;
    let total = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      const week: { day: string; count: number; logins: number; actions: number }[] = [];
      for (let i = 0; i < 7 && cursor <= end; i++) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        const entry = byDay.get(key);
        const count = (entry?.logins ?? 0) + (entry?.actions ?? 0);
        max = Math.max(max, count);
        total += count;
        week.push({ day: key, count, logins: entry?.logins ?? 0, actions: entry?.actions ?? 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }
    return { weeks, maxCount: max, total };
  }, [query.data]);

  if (query.isLoading) return <Skeleton className="h-28 w-full rounded-md" />;
  if (query.error) {
    return <p className="text-sm text-muted-foreground">Couldn’t load the activity heatmap.</p>;
  }

  const level = (count: number): string => {
    if (count === 0) return "bg-muted";
    const ratio = maxCount > 0 ? count / maxCount : 0;
    if (ratio <= 0.25) return "bg-primary/25";
    if (ratio <= 0.5) return "bg-primary/45";
    if (ratio <= 0.75) return "bg-primary/70";
    return "bg-primary";
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-[3px] overflow-x-auto pb-1" role="img" aria-label={`Activity heatmap: ${total} events in the last 12 months`}>
        {weeks.map((week, w) => (
          <div key={w} className="flex flex-col gap-[3px]">
            {week.map((cell, d) => (
              <Tooltip key={cell.day} delayDuration={50}>
                <TooltipTrigger asChild>
                  <motion.span
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: reduce ? 0 : Math.min((w * 7 + d) * 0.0008, 0.3) }}
                    className={`size-[10px] shrink-0 rounded-[2px] ${level(cell.count)}`}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {formatDate(cell.day)}: {cell.logins} login(s), {cell.actions} action(s)
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{total.toLocaleString()} events in the last 12 months</span>
        <span className="flex items-center gap-1">
          Less
          <span className="size-[10px] rounded-[2px] bg-muted" />
          <span className="size-[10px] rounded-[2px] bg-primary/25" />
          <span className="size-[10px] rounded-[2px] bg-primary/45" />
          <span className="size-[10px] rounded-[2px] bg-primary/70" />
          <span className="size-[10px] rounded-[2px] bg-primary" />
          More
        </span>
      </div>
    </div>
  );
}
