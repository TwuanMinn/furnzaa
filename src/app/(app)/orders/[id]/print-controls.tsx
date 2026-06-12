"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, Loader2, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Can } from "@/lib/rbac/context";
import {
  completePrintAction,
  failPrintAction,
  restartPrintAction,
  startPrintAction,
} from "@/lib/orders/print-actions";

/**
 * Start / Complete / Fail / Restart controls for the print state machine.
 * Gated by orders.update_status (also enforced in the server actions).
 */
export function PrintControls({
  orderId,
  printState,
}: {
  orderId: string;
  printState: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const [failReason, setFailReason] = useState("");

  async function run(
    action: () => Promise<{ ok: boolean } & ({ ok: true } | { ok: false; error: string })>,
    success: string,
  ) {
    setBusy(true);
    try {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error((result as { error: string }).error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Can permission="orders.update_status">
      <div className="flex flex-wrap items-center gap-2">
        {printState === "not_started" ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => void run(() => startPrintAction(orderId), "Print started — countdown running")}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Play />}
            Start print
          </Button>
        ) : null}

        {printState === "printing" ? (
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(() => completePrintAction(orderId), "Print completed — actual time recorded")
              }
            >
              {busy ? <Loader2 className="animate-spin" /> : <CircleCheck />}
              Complete print
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setFailOpen(true)}>
              <CircleX />
              Mark failed
            </Button>
          </>
        ) : null}

        {printState === "failed" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void run(() => restartPrintAction(orderId), "Print restarted — fresh countdown")}
          >
            {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            Restart print
          </Button>
        ) : null}
      </div>

      <Dialog open={failOpen} onOpenChange={(o) => !busy && setFailOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark print as failed</DialogTitle>
            <DialogDescription>
              The job can be restarted later. The reason lands in the activity log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="pf-reason">Reason (optional)</Label>
            <Textarea
              id="pf-reason"
              rows={2}
              maxLength={500}
              value={failReason}
              onChange={(e) => setFailReason(e.target.value)}
              placeholder="e.g. spaghetti at layer 142, bed adhesion lost"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setFailOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void run(() => failPrintAction(orderId, failReason), "Print marked as failed").then(
                  () => {
                    setFailOpen(false);
                    setFailReason("");
                  },
                )
              }
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              Mark failed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Can>
  );
}
