"use client";

import { useMemo, useState, type DragEvent } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Inbox } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { badgeClass } from "@/lib/badges";
import { formatMinutes } from "@/lib/format";
import { assignPrinterAction } from "@/lib/schedule/actions";
import { PriorityBadge, printProgress, useNow } from "./schedule-bits";
import type { BoardData, ScheduleCard } from "./types";

/**
 * Timeline view (spec v6, Module 3): one Gantt-style lane per printer. The
 * currently-printing block fills live; queued blocks stack in queue order with
 * computed estimated starts (previous block's finish); a "now" line sweeps on
 * the shared 30s tick. Dragging a tray chip onto a lane assigns the printer.
 * Queue runs sequentially, so an "overlap" means a job will start later than
 * its scheduled time — both blocks go amber with a tooltip, never blocking.
 */

type Zoom = "day" | "week";
const PX_PER_MIN: Record<Zoom, number> = { day: 1, week: 0.16 };
const LANE_LABEL_W = 200;
/** Drift tolerance before a queued job counts as conflicting (minutes). */
const CONFLICT_TOLERANCE_MIN = 30;

interface Block {
  card: ScheduleCard;
  startMs: number;
  minutes: number;
  kind: "printing" | "queued";
  conflict: boolean;
}

export function ScheduleTimeline({
  data,
  canManage,
  onMutated,
}: {
  data: BoardData;
  canManage: boolean;
  onMutated: () => void;
}) {
  const reduce = useReducedMotion();
  const now = useNow();
  const [zoom, setZoom] = useState<Zoom>("day");
  const [dropLane, setDropLane] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pxPerMin = PX_PER_MIN[zoom];
  const windowStartMs = now - 60 * 60_000; // 1h of history for context

  const lanes = useMemo(() => {
    const active = [...data.columns.printing, ...data.columns.queued];
    const byPrinter = new Map<string, ScheduleCard[]>();
    for (const card of active) {
      const key = card.printerId ?? "none";
      byPrinter.set(key, [...(byPrinter.get(key) ?? []), card]);
    }

    const result = data.capacity.map((printer) => {
      const cards = byPrinter.get(printer.printerId) ?? [];
      const printing = cards
        .filter((c) => c.state === "printing")
        .sort((a, b) => (a.printStartedAt ?? "").localeCompare(b.printStartedAt ?? ""));
      const queued = cards
        .filter((c) => c.state === "queued")
        .sort((a, b) => a.queuePosition - b.queuePosition);

      const blocks: Block[] = [];
      let cursor = now;
      for (const c of printing) {
        const startMs = c.printStartedAt ? new Date(c.printStartedAt).getTime() : now;
        const minutes = c.estimatedMinutes ?? 30;
        blocks.push({ card: c, startMs, minutes, kind: "printing", conflict: false });
        cursor = Math.max(cursor, startMs + minutes * 60_000);
      }
      for (const c of queued) {
        const minutes = c.estimatedMinutes ?? 30;
        const scheduledMs = new Date(c.scheduledAt).getTime();
        const conflict = cursor - scheduledMs > CONFLICT_TOLERANCE_MIN * 60_000;
        blocks.push({ card: c, startMs: cursor, minutes, kind: "queued", conflict });
        cursor += minutes * 60_000;
      }
      return { printer, blocks, endMs: cursor };
    });

    const unassigned = byPrinter.get("none") ?? [];
    return { printers: result, unassigned };
  }, [data, now]);

  const windowEndMs = Math.max(
    now + (zoom === "day" ? 12 : 7 * 24) * 60 * 60_000,
    ...lanes.printers.map((l) => l.endMs + 2 * 60 * 60_000),
  );
  const totalMinutes = (windowEndMs - windowStartMs) / 60_000;
  const trackWidth = totalMinutes * pxPerMin;
  const x = (ms: number) => ((ms - windowStartMs) / 60_000) * pxPerMin;

  const hourTicks = useMemo(() => {
    const stepMin = zoom === "day" ? 60 : 12 * 60;
    const first = Math.ceil(windowStartMs / (stepMin * 60_000)) * stepMin * 60_000;
    const ticks: number[] = [];
    for (let t = first; t <= windowEndMs; t += stepMin * 60_000) ticks.push(t);
    return ticks;
  }, [windowStartMs, windowEndMs, zoom]);

  async function dropOnLane(e: DragEvent, printerId: string) {
    e.preventDefault();
    setDropLane(null);
    if (!canManage || busy) return;
    let orderId: string | null = null;
    try {
      const payload = JSON.parse(e.dataTransfer.getData("application/json")) as {
        orderId?: string;
        tray?: boolean;
        state?: string;
      };
      if (payload.tray || payload.state === "queued") orderId = payload.orderId ?? null;
    } catch {
      /* not ours */
    }
    if (!orderId) return;
    setBusy(true);
    try {
      const res = await assignPrinterAction(orderId, printerId);
      if (res.ok) {
        toast.success("Job assigned to the printer queue");
        onMutated();
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Zoom control */}
      <div className="flex items-center justify-end gap-1 rounded-lg">
        {(["day", "week"] as Zoom[]).map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => setZoom(z)}
            className={cn(
              "relative rounded-md px-3 py-1.5 text-sm capitalize transition-colors",
              zoom === z ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={zoom === z}
          >
            {zoom === z ? (
              <motion.span
                layoutId="schedule-zoom-pill"
                className="absolute inset-0 rounded-md bg-muted"
                transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.4 }}
              />
            ) : null}
            <span className="relative">{z}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <div style={{ width: LANE_LABEL_W + trackWidth }} className="relative min-w-full">
          {/* Time axis */}
          <div className="flex border-b border-border bg-muted/40">
            <div style={{ width: LANE_LABEL_W }} className="shrink-0 border-r border-border px-3 py-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Printer
              </span>
            </div>
            <div className="relative h-8 flex-1">
              {hourTicks.map((t) => (
                <span
                  key={t}
                  style={{ left: x(t) }}
                  className="absolute top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                >
                  {new Date(t).toLocaleString([], {
                    ...(zoom === "week" ? { weekday: "short" } : {}),
                    hour: "numeric",
                  })}
                </span>
              ))}
            </div>
          </div>

          {/* Lanes */}
          {lanes.printers.map(({ printer, blocks }) => (
            <div
              key={printer.printerId}
              className={cn(
                "flex border-b border-border last:border-b-0",
                dropLane === printer.printerId && "bg-primary/5",
              )}
              onDragOver={(e) => {
                if (!canManage) return;
                e.preventDefault();
                setDropLane(printer.printerId);
              }}
              onDragLeave={() => setDropLane((p) => (p === printer.printerId ? null : p))}
              onDrop={(e) => void dropOnLane(e, printer.printerId)}
            >
              {/* Capacity header cell */}
              <div
                style={{ width: LANE_LABEL_W }}
                className="shrink-0 space-y-1 border-r border-border px-3 py-2.5"
              >
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                    badgeClass(printer.color),
                  )}
                >
                  {printer.label}
                </span>
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {printer.queuedJobs} queued · {formatMinutes(printer.queuedMinutes)}
                  <br />
                  free{" "}
                  {printer.queuedJobs === 0 && !printer.busy
                    ? "now"
                    : `by ${new Date(printer.freeBy).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                </p>
              </div>

              {/* Track */}
              <div className="relative h-16 flex-1">
                {blocks.map((b) => {
                  const progress =
                    b.kind === "printing"
                      ? printProgress(b.card.printStartedAt, b.card.estimatedMinutes, now)
                      : null;
                  return (
                    <Link
                      key={b.card.orderId}
                      href={`/orders/${b.card.orderId}`}
                      style={{ left: x(b.startMs), width: Math.max(b.minutes * pxPerMin, 14) }}
                      title={`${b.card.orderCode}${b.card.productName ? ` · ${b.card.productName}` : ""} — est. ${formatMinutes(
                        b.minutes,
                      )}${b.conflict ? " · queue is running behind its scheduled time" : ""}`}
                      className={cn(
                        "absolute top-1/2 flex h-9 -translate-y-1/2 items-center gap-1 overflow-hidden rounded-md border px-1.5 text-[11px] font-medium",
                        b.kind === "printing"
                          ? progress?.overdue
                            ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            : "border-primary/40 bg-primary/10 text-primary"
                          : b.conflict
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            : "border-border bg-muted text-foreground/80",
                      )}
                    >
                      {/* Live progress fill */}
                      {progress ? (
                        <span
                          aria-hidden
                          style={{ width: `${progress.fraction * 100}%` }}
                          className={cn(
                            "absolute inset-y-0 left-0 transition-[width] duration-700 ease-out",
                            progress.overdue ? "bg-amber-500/20" : "bg-primary/15",
                          )}
                        />
                      ) : null}
                      {b.conflict ? <AlertTriangle className="size-3 shrink-0" aria-hidden /> : null}
                      <span className="relative truncate">{b.card.orderCode}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Unassigned queued jobs get their own lane so nothing hides. */}
          {lanes.unassigned.length > 0 ? (
            <div className="flex border-t border-dashed border-border bg-muted/20">
              <div style={{ width: LANE_LABEL_W }} className="shrink-0 border-r border-border px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">No printer yet</p>
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-1.5 px-2 py-2">
                {lanes.unassigned.map((c) => (
                  <span
                    key={c.orderId}
                    draggable={canManage && !busy}
                    onDragStart={(e) =>
                      e.dataTransfer.setData(
                        "application/json",
                        JSON.stringify({ orderId: c.orderId, state: "queued" }),
                      )
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs",
                      canManage && "cursor-grab active:cursor-grabbing",
                    )}
                  >
                    {c.orderCode}
                    {c.estimatedMinutes ? (
                      <span className="text-muted-foreground">{formatMinutes(c.estimatedMinutes)}</span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* The sweeping "now" line */}
          <div
            aria-hidden
            style={{ left: LANE_LABEL_W + x(now) }}
            className="pointer-events-none absolute inset-y-0 w-px bg-red-500/70"
          >
            <span className="absolute -top-0 left-1 rounded bg-red-500/90 px-1 text-[9px] font-medium text-white">
              now
            </span>
          </div>
        </div>
      </div>

      {/* Unassigned-jobs tray: print-ready orders with no printer. */}
      <section className="rounded-xl border border-border p-3">
        <header className="mb-2 flex items-center gap-2">
          <Inbox className="size-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-medium">Unassigned jobs</h3>
          <span className="text-xs text-muted-foreground">
            {canManage ? "— drag onto a printer lane to queue" : ""}
          </span>
        </header>
        {data.tray.length === 0 ? (
          <p className="text-xs text-muted-foreground">Every print-ready order has a printer.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.tray.map((t) => (
              <div
                key={t.orderId}
                draggable={canManage && !busy}
                onDragStart={(e) =>
                  e.dataTransfer.setData(
                    "application/json",
                    JSON.stringify({ orderId: t.orderId, tray: true }),
                  )
                }
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-sm",
                  canManage && "cursor-grab active:cursor-grabbing",
                )}
              >
                <Link href={`/orders/${t.orderId}`} className="font-medium hover:underline">
                  {t.orderCode}
                </Link>
                {t.customerName ? <span className="text-muted-foreground">{t.customerName}</span> : null}
                <PriorityBadge priority={t.priority} />
                {t.estimatedMinutes ? (
                  <span className="tabular-nums text-muted-foreground">
                    {formatMinutes(t.estimatedMinutes)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
