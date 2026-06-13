/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { bulkOrderActionsAction } from "@/lib/orders/actions";
import type { BulkOrderAction } from "@/lib/orders/schemas";
import type { StaffOption } from "@/app/api/staff/route";

/** Sentinel for the "Unassign" option (Radix Select needs a non-empty value). */
const UNASSIGN = "__unassign__";

const TITLES: Record<BulkOrderAction, string> = {
  delete: "Delete selected orders?",
  restore: "Restore selected orders?",
  assign: "Assign selected orders",
};

const DESCRIPTIONS: Record<BulkOrderAction, string> = {
  delete:
    "This is a SOFT delete — orders are hidden from the list but kept for history and analytics. Stock and loyalty effects already applied are not reversed. You can restore them later.",
  restore: "Brings the selected orders back into the active list. Nothing else about them changes.",
  assign: "Sets the assignee for every selected order. The chosen teammate is notified for each one.",
};

const VERBS: Record<BulkOrderAction, string> = {
  delete: "deleted",
  restore: "restored",
  assign: "updated",
};

/**
 * Confirmation dialog for the Orders bulk bar (delete + assign). Guardrails —
 * soft-delete semantics, RLS scoping, one activity-log row per order — are
 * enforced server-side in bulkOrderActionsAction; this is the confirm step.
 */
export function OrdersBulkActionDialog({
  state,
  staff,
  onOpenChange,
  onDone,
}: {
  state: { action: BulkOrderAction; ids: string[] } | null;
  staff: StaffOption[];
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const [assignee, setAssignee] = useState<string>(UNASSIGN);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state) setAssignee(staff[0]?.id ?? UNASSIGN);
  }, [state, staff]);

  const count = state?.ids.length ?? 0;

  async function run() {
    if (!state) return;
    setBusy(true);
    try {
      const result = await bulkOrderActionsAction({
        action: state.action,
        orderIds: state.ids,
        assignedStaffId:
          state.action === "assign" ? (assignee === UNASSIGN ? null : assignee) : undefined,
      });
      if (result.ok) {
        toast.success(
          `${result.affected} order(s) ${VERBS[state.action]}${
            result.skipped.length ? ` · ${result.skipped.length} skipped` : ""
          }`,
          result.skipped.length
            ? {
                description:
                  result.skipped.slice(0, 3).join("; ") + (result.skipped.length > 3 ? "…" : ""),
              }
            : undefined,
        );
        onOpenChange(false);
        onDone?.();
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!state} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        {state ? (
          <>
            <DialogHeader>
              <DialogTitle>{TITLES[state.action]}</DialogTitle>
              <DialogDescription>
                {count} order(s) affected. {DESCRIPTIONS[state.action]}
              </DialogDescription>
            </DialogHeader>

            {state.action === "assign" ? (
              <div className="space-y-1.5">
                <Label htmlFor="bulk-assignee">Assign to</Label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger id="bulk-assignee" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGN}>Unassign</SelectItem>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant={state.action === "delete" ? "destructive" : "default"}
                onClick={() => void run()}
                disabled={busy || count === 0}
              >
                {busy ? <Loader2 className="animate-spin" /> : null}
                {state.action === "delete"
                  ? `Delete (${count})`
                  : state.action === "restore"
                    ? `Restore (${count})`
                    : `Assign (${count})`}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
