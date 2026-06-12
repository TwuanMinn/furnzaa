"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, FileText, Loader2, Pencil, Trash2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Can } from "@/lib/rbac/context";
import {
  getReceiptUrlAction,
  softDeleteOrderAction,
  updateOrderStatusAction,
} from "@/lib/orders/actions";
import type { OrderStatusDef } from "@/lib/orders/config";

interface OrderDetailActionsProps {
  orderId: string;
  orderCode: string;
  currentStatus: string;
  statuses: OrderStatusDef[];
  hasReceipt: boolean;
  isActive: boolean;
}

/** Detail-page actions: view receipt, change status (+comment), edit, delete. */
export function OrderDetailActions({
  orderId,
  orderCode,
  currentStatus,
  statuses,
  hasReceipt,
  isActive,
}: OrderDetailActionsProps) {
  const router = useRouter();
  const [statusOpen, setStatusOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState(currentStatus);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function openReceipt() {
    setBusy("receipt");
    try {
      const result = await getReceiptUrlAction(orderId);
      if (result.ok) window.open(result.url, "_blank", "noopener");
      else toast.error(result.error);
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus() {
    setBusy("status");
    try {
      const result = await updateOrderStatusAction({ orderId, status: nextStatus, comment });
      if (result.ok) {
        toast.success(`Status updated to ${statuses.find((s) => s.key === nextStatus)?.label ?? nextStatus}`);
        setStatusOpen(false);
        setComment("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(null);
    }
  }

  async function deleteOrder() {
    setBusy("delete");
    try {
      const result = await softDeleteOrderAction(orderId);
      if (result.ok) {
        toast.success(`Order ${orderCode} deleted`);
        router.push("/orders");
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(null);
      setDeleteOpen(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasReceipt ? (
        <Button variant="outline" size="sm" disabled={busy === "receipt"} onClick={() => void openReceipt()}>
          {busy === "receipt" ? <Loader2 className="animate-spin" /> : <FileText />}
          Receipt
        </Button>
      ) : null}

      {isActive ? (
        <>
          <Can permission="orders.update_status">
            <Button variant="outline" size="sm" onClick={() => setStatusOpen(true)}>
              <ArrowRightLeft /> Change status
            </Button>
          </Can>
          <Can permission="orders.edit">
            <Button variant="outline" size="sm" onClick={() => router.push(`/orders/${orderId}/edit`)}>
              <Pencil /> Edit
            </Button>
          </Can>
          <Can permission="orders.delete">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 /> Delete
            </Button>
          </Can>
        </>
      ) : null}

      <Dialog open={statusOpen} onOpenChange={(o) => busy !== "status" && setStatusOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change order status</DialogTitle>
            <DialogDescription>
              {orderCode} — each change is recorded in the order’s history with who made it and when.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="os-status">New status</Label>
              <Select value={nextStatus} onValueChange={setNextStatus}>
                <SelectTrigger id="os-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.key} value={s.key} disabled={s.key === currentStatus}>
                      {s.label}
                      {s.key === currentStatus ? " (current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="os-comment">Comment (optional)</Label>
              <Textarea
                id="os-comment"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Why is the status changing?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStatusOpen(false)} disabled={busy === "status"}>
              Cancel
            </Button>
            <Button onClick={() => void changeStatus()} disabled={busy === "status" || nextStatus === currentStatus}>
              {busy === "status" ? <Loader2 className="animate-spin" /> : null}
              Update status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={(o) => busy !== "delete" && setDeleteOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete order {orderCode}?</AlertDialogTitle>
            <AlertDialogDescription>
              The order is removed from lists but kept in history and analytics (soft delete). An
              administrator can restore it from the database if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "delete"}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy === "delete"}
              onClick={(e) => {
                e.preventDefault();
                void deleteOrder();
              }}
            >
              {busy === "delete" ? <Loader2 className="animate-spin" /> : null}
              Delete order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
