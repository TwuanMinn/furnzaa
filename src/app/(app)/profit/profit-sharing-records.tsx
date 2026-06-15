"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { format as formatDateFns } from "date-fns";
import { Copy, Handshake, RotateCcw, Trash2, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { getBrowserClient } from "@/lib/supabase/client";
import { deleteProfitSharingRecordAction } from "@/lib/profit/sharing-record-actions";
import {
  SHARING_PALETTE,
  formatSharingMoney,
  type SavedSharingRecord,
} from "@/lib/profit/sharing";

export const SHARING_RECORDS_KEY = ["profit-sharing-records"] as const;

const SELECT_COLS =
  "id, created_by, created_by_name, label, note, currency, total, partners, partner_count, created_at";

/**
 * The Profit Sharing "collection" — every saved split (shared across all profit
 * viewers via RLS). Reads run as the signed-in user; the shared-ledger SELECT
 * policy returns the whole collection. Save happens in the calculator view; here
 * you load a record back, copy it, or delete it.
 */
export function ProfitSharingRecords({
  dateFormat,
  timeFormat,
  onLoad,
}: {
  dateFormat: string;
  timeFormat: string;
  onLoad: (record: SavedSharingRecord) => void;
}) {
  const reduce = useReducedMotion();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const recordsQuery = useQuery({
    queryKey: SHARING_RECORDS_KEY,
    staleTime: 15_000,
    queryFn: async (): Promise<SavedSharingRecord[]> => {
      const supabase = getBrowserClient();
      const { data, error } = await supabase
        .from("profit_sharing_records")
        .select(SELECT_COLS)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SavedSharingRecord[];
    },
  });
  const records = recordsQuery.data ?? [];

  async function confirmDelete(id: string) {
    const res = await deleteProfitSharingRecordAction(id);
    if (res.ok) {
      toast.success("Record deleted");
      queryClient.invalidateQueries({ queryKey: SHARING_RECORDS_KEY }).catch(console.error);
    } else {
      toast.error(res.error);
    }
  }

  function copyRecord(r: SavedSharingRecord) {
    const lines = [
      `${r.label || "Untitled split"} — Total: ${formatSharingMoney(r.total, r.currency)}`,
      ...r.partners.map(
        (p) => `${p.name || "Partner"}: ${p.percent}% → ${formatSharingMoney(p.amount, r.currency)}`,
      ),
    ];
    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => toast.success("Record copied"))
      .catch(() => toast.error("Couldn't copy to clipboard"));
  }

  if (recordsQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <Handshake className="mx-auto size-8 text-muted-foreground/60" aria-hidden />
        <p className="mt-3 text-sm font-medium">No saved records yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Set up a split, then hit &ldquo;Save as record&rdquo; to keep it in this collection.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">
        {records.length} saved record{records.length === 1 ? "" : "s"}
      </p>
      <ul className="space-y-2.5" role="list" aria-label="Saved profit-sharing records">
        <AnimatePresence initial={false}>
          {records.map((r) => {
            const when = new Date(r.created_at);
            return (
              <motion.li
                key={r.id}
                layout={reduce ? false : "position"}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.label || "Untitled split"}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <User className="size-3" aria-hidden /> {r.created_by_name || "Unknown"}
                      </span>
                      <span aria-hidden>·</span>
                      <span>
                        {formatDateFns(when, timeFormat)} {formatDateFns(when, dateFormat)}
                      </span>
                      <span aria-hidden>·</span>
                      <span>
                        {r.partner_count} partner{r.partner_count === 1 ? "" : "s"}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Load "${r.label || "Untitled split"}" into calculator`}
                      onClick={() => onLoad(r)}
                    >
                      <RotateCcw className="text-muted-foreground" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Copy "${r.label || "Untitled split"}"`}
                      onClick={() => copyRecord(r)}
                    >
                      <Copy className="text-muted-foreground" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete "${r.label || "Untitled split"}"`}
                      onClick={() => setDeleteId(r.id)}
                      className="hover:text-destructive"
                    >
                      <Trash2 className="text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                <div className="mt-2 flex items-baseline justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Total</span>
                  <span className="font-semibold tabular-nums">
                    {formatSharingMoney(r.total, r.currency)}
                  </span>
                </div>

                {/* Split bar */}
                <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  {r.partners.map((p, i) =>
                    p.percent > 0 ? (
                      <div
                        key={i}
                        className="h-full"
                        style={{
                          width: `${p.percent}%`,
                          backgroundColor: SHARING_PALETTE[i % SHARING_PALETTE.length],
                        }}
                        title={`${p.name}: ${p.percent}%`}
                      />
                    ) : null,
                  )}
                </div>

                {/* Partner breakdown */}
                <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                  {r.partners.map((p, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: SHARING_PALETTE[i % SHARING_PALETTE.length] }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{p.name || "Partner"}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {p.percent}%
                      </span>
                      <span className="w-24 shrink-0 text-right tabular-nums">
                        {formatSharingMoney(p.amount, r.currency)}
                      </span>
                    </li>
                  ))}
                </ul>

                {r.note ? <p className="mt-2 text-xs text-muted-foreground">{r.note}</p> : null}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from the shared collection (soft-deleted and logged).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) void confirmDelete(deleteId);
                setDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
