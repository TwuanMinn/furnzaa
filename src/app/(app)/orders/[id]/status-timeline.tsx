"use client";

import { motion, useReducedMotion } from "motion/react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/format";
import type { OrderStatusDef } from "@/lib/orders/config";
import type { HistoryRow } from "./page";

/** Vertical timeline of status changes, newest first, staggered entrance. */
export function StatusTimeline({
  history,
  statuses,
}: {
  history: HistoryRow[];
  statuses: OrderStatusDef[];
}) {
  const reduce = useReducedMotion();
  const map = new Map(statuses.map((s) => [s.key, s]));

  if (history.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">No status changes recorded yet.</p>;
  }

  return (
    <ol className="relative space-y-5 border-l border-border pl-5">
      {history.map((entry, index) => {
        const def = map.get(entry.to_status);
        return (
          <motion.li
            key={entry.id}
            initial={reduce ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: reduce ? 0 : Math.min(index * 0.04, 0.3) }}
            className="relative"
          >
            <span
              className="absolute top-1.5 -left-[26px] size-2.5 rounded-full bg-primary ring-4 ring-background"
              aria-hidden
            />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {entry.from_status ? (
                <>
                  <StatusBadge status={entry.from_status} label={map.get(entry.from_status)?.label} color={map.get(entry.from_status)?.color} />
                  <span className="text-muted-foreground">→</span>
                </>
              ) : null}
              <StatusBadge status={entry.to_status} label={def?.label} color={def?.color} />
            </div>
            {entry.comment ? <p className="mt-1 text-sm">{entry.comment}</p> : null}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatDateTime(entry.created_at)}
              {entry.changed_by_user ? ` · ${entry.changed_by_user.full_name}` : ""}
            </p>
          </motion.li>
        );
      })}
    </ol>
  );
}
