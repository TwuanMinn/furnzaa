"use client";

import { useState, type DragEvent } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Loader2, Package, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { badgeClass } from "@/lib/badges";
import { formatMinutes } from "@/lib/format";
import { initials } from "@/lib/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  completePrintAction,
  failPrintAction,
  restartPrintAction,
  startPrintAction,
} from "@/lib/orders/print-actions";
import { reorderQueueAction } from "@/lib/schedule/actions";
import { CountdownChip, MiniRing, PriorityBadge, STATE_META } from "./schedule-bits";
import type { BoardData, ScheduleCard, ScheduleState } from "./types";

/**
 * Kanban board (spec v6, Module 3). Columns mirror the orders print state
 * machine — dragging a card RUNS the matching print action (with
 * confirmation); within Queued a drag reorders via the sparse queue keys.
 * Everything else (live countdown, ring, realtime refresh) derives from the
 * one source of truth.
 */

const COLUMNS: ScheduleState[] = ["queued", "printing", "completed", "failed"];

type Payload = { orderId: string; state: ScheduleState; printerId: string | null };

type Confirm =
  | { kind: "start"; card: ScheduleCard; printerBusy: boolean }
  | { kind: "complete"; card: ScheduleCard }
  | { kind: "fail"; card: ScheduleCard };

function readPayload(e: DragEvent): Payload | null {
  try {
    return JSON.parse(e.dataTransfer.getData("application/json")) as Payload;
  } catch {
    return null;
  }
}

export function ScheduleBoard({
  data,
  userId,
  canManage,
  onMutated,
  onLoadMore,
}: {
  data: BoardData;
  userId: string;
  canManage: boolean;
  onMutated: () => void;
  onLoadMore: (state: "queued" | "completed" | "failed") => void;
}) {
  const reduce = useReducedMotion();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropHint, setDropHint] = useState<{ column: ScheduleState; beforeId: string | null } | null>(
    null,
  );

  const canAct = (card: { assignedTo: string | null }) => canManage || card.assignedTo === userId;

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(true);
    try {
      const res = await action();
      if (res.ok) {
        toast.success(success);
        onMutated();
      } else {
        toast.error(res.error ?? "Action failed");
      }
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  function handleDrop(e: DragEvent, column: ScheduleState) {
    e.preventDefault();
    const hint = dropHint;
    setDropHint(null);
    const payload = readPayload(e);
    if (!payload || payload.state === column) {
      // Same-column drop in Queued = reorder at the hinted position.
      if (payload && column === "queued" && payload.state === "queued") {
        const queue = data.columns.queued;
        const beforeIdx = hint?.beforeId ? queue.findIndex((c) => c.orderId === hint.beforeId) : -1;
        const target = hint?.beforeId
          ? { before: queue[beforeIdx - 1]?.orderId ?? null, after: hint.beforeId }
          : { before: queue.at(-1)?.orderId ?? null, after: null };
        if (target.after === payload.orderId || target.before === payload.orderId) return;
        void run(
          () => reorderQueueAction(payload.orderId, target.before, target.after),
          "Queue reordered",
        );
      }
      return;
    }

    const card = data.columns[payload.state].find((c) => c.orderId === payload.orderId);
    if (!card) return;

    if (payload.state === "queued" && column === "printing") {
      if (!card.printerId) {
        toast.error("Assign a printer before starting the print");
        return;
      }
      const printerBusy = data.capacity.some((p) => p.printerId === card.printerId && p.busy);
      setConfirm({ kind: "start", card, printerBusy });
    } else if (payload.state === "printing" && column === "completed") {
      setConfirm({ kind: "complete", card });
    } else if (payload.state === "printing" && column === "failed") {
      setConfirm({ kind: "fail", card });
    } else {
      // The state machine allows no other jumps (restart is the button on
      // failed cards).
      toast.error(`Can't move a ${STATE_META[payload.state]?.label.toLowerCase()} job to ${STATE_META[column]?.label}`);
    }
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((state, colIdx) => {
          const cards = data.columns[state];
          const meta = STATE_META[state]!;
          return (
            <motion.section
              key={state}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: reduce ? 0 : colIdx * 0.05, ease: "easeOut" }}
              className={cn(
                "flex min-h-48 flex-col rounded-xl border border-border bg-muted/30 p-3",
                dropHint?.column === state && "ring-2 ring-primary/40",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                if (dropHint?.column !== state) setDropHint({ column: state, beforeId: null });
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setDropHint(null);
              }}
              onDrop={(e) => handleDrop(e, state)}
              aria-label={`${meta.label} column`}
            >
              <header className="mb-3 flex items-center gap-2 px-1">
                <span className={cn("size-2 rounded-full", meta.dot)} aria-hidden />
                <h3 className="text-sm font-medium">{meta.label}</h3>
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {cards.length}
                </span>
              </header>

              <div className="flex flex-1 flex-col gap-2">
                <AnimatePresence initial={false}>
                  {cards.map((card) => (
                    <motion.div
                      key={card.orderId}
                      layout={!reduce}
                      initial={reduce ? false : { opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduce ? undefined : { opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      draggable={!busy && canAct(card) && (card.state === "queued" || card.state === "printing")}
                      onDragStart={(e) => {
                        const ev = e as unknown as DragEvent;
                        ev.dataTransfer?.setData(
                          "application/json",
                          JSON.stringify({
                            orderId: card.orderId,
                            state: card.state,
                            printerId: card.printerId,
                          } satisfies Payload),
                        );
                      }}
                      onDragOver={
                        state === "queued"
                          ? (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDropHint({ column: "queued", beforeId: card.orderId });
                            }
                          : undefined
                      }
                      className={cn(
                        "rounded-lg border border-border bg-card p-3 shadow-sm",
                        canAct(card) && (card.state === "queued" || card.state === "printing")
                          ? "cursor-grab active:cursor-grabbing"
                          : "opacity-90",
                        dropHint?.column === "queued" &&
                          dropHint.beforeId === card.orderId &&
                          "border-t-2 border-t-primary",
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                          {card.productImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={card.productImage} alt="" className="size-full object-cover" />
                          ) : (
                            <Package className="size-4 text-muted-foreground" aria-hidden />
                          )}
                          {card.state === "printing" ? (
                            <div className="absolute -right-1 -bottom-1 rounded-full bg-card p-0.5">
                              <MiniRing
                                startedAt={card.printStartedAt}
                                estimatedMinutes={card.estimatedMinutes}
                                size={20}
                              />
                            </div>
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/orders/${card.orderId}`}
                            className="block truncate text-sm font-medium hover:underline"
                          >
                            {card.orderCode}
                            {card.productName ? (
                              <span className="text-muted-foreground"> · {card.productName}</span>
                            ) : null}
                          </Link>
                          {card.customerName ? (
                            <p className="truncate text-xs text-muted-foreground">{card.customerName}</p>
                          ) : null}
                        </div>
                        {card.assigneeName ? (
                          <Avatar className="size-6" title={card.assigneeName}>
                            <AvatarImage src={card.assigneeAvatar ?? undefined} alt="" />
                            <AvatarFallback className="text-[10px]">
                              {initials(card.assigneeName)}
                            </AvatarFallback>
                          </Avatar>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <PriorityBadge priority={card.priority} />
                        {card.printerLabel ? (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-inset",
                              badgeClass(card.printerColor),
                            )}
                          >
                            {card.printerLabel}
                          </span>
                        ) : null}
                        {card.material ? (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {card.material}
                          </span>
                        ) : null}
                        {card.state === "printing" ? (
                          <CountdownChip
                            startedAt={card.printStartedAt}
                            estimatedMinutes={card.estimatedMinutes}
                          />
                        ) : card.estimatedMinutes ? (
                          <span className="text-xs tabular-nums text-muted-foreground">
                            est. {formatMinutes(card.estimatedMinutes)}
                          </span>
                        ) : null}
                        {card.state === "completed" && card.actualMinutes ? (
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {formatMinutes(card.actualMinutes)} actual
                          </span>
                        ) : null}
                      </div>

                      {card.state === "failed" && canAct(card) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 h-7 w-full gap-1.5"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => restartPrintAction(card.orderId),
                              `Restarted print for ${card.orderCode}`,
                            )
                          }
                        >
                          <RotateCcw className="size-3.5" /> Restart
                        </Button>
                      ) : null}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {cards.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    {state === "queued" ? "Nothing queued" : `No ${meta.label.toLowerCase()} jobs`}
                  </p>
                ) : null}

                {state !== "printing" && data.hasMore[state] ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => onLoadMore(state)}
                  >
                    Load more
                  </Button>
                ) : null}
              </div>
            </motion.section>
          );
        })}
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "start"
                ? `Start printing ${confirm.card.orderCode}?`
                : confirm?.kind === "complete"
                  ? `Complete the print for ${confirm.card.orderCode}?`
                  : `Mark the print for ${confirm?.card.orderCode} as failed?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "start"
                ? confirm.printerBusy
                  ? `${confirm.card.printerLabel} is already running another job — starting this one anyway records both as printing.`
                  : "This stamps the start time and begins the live countdown."
                : confirm?.kind === "complete"
                  ? "The actual printing time is filled in automatically from start to now."
                  : "Failed prints can be restarted from the board or the order page."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (!confirm) return;
                const { card } = confirm;
                if (confirm.kind === "start")
                  void run(() => startPrintAction(card.orderId), `Print started for ${card.orderCode}`);
                else if (confirm.kind === "complete")
                  void run(() => completePrintAction(card.orderId), `Print completed for ${card.orderCode}`);
                else void run(() => failPrintAction(card.orderId), `Print marked failed for ${card.orderCode}`);
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
