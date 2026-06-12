"use client";

import { useState } from "react";
import { Eraser, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { purgeActivityLogsAction } from "@/lib/activity/actions";

/** Admin-only purge of old log entries; the purge itself is logged. */
export function PurgeLogsButton({ defaultDays = 365 }: { defaultDays?: number }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(String(defaultDays));
  const [busy, setBusy] = useState(false);

  async function purge() {
    const parsed = Number(days);
    if (!Number.isFinite(parsed) || parsed < 7) {
      toast.error("Retention must be at least 7 days");
      return;
    }
    setBusy(true);
    try {
      const result = await purgeActivityLogsAction(parsed);
      if (result.ok) {
        toast.success(`Purged ${result.deleted.toLocaleString()} entr${result.deleted === 1 ? "y" : "ies"}`);
        setOpen(false);
        window.location.reload();
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Eraser /> Purge old logs
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purge old activity logs?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently removes entries older than the retention window below. This action is
              itself recorded in the log and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="purge-days">Keep entries from the last … days</Label>
            <Input
              id="purge-days"
              type="number"
              min={7}
              max={3650}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="max-w-32"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void purge();
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              Purge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
