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
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/rbac/context";
import { bulkUserActionsAction } from "@/lib/users/actions";
import type { BulkUserAction } from "@/lib/users/schemas";
import type { RoleOption } from "./page";

const TITLES: Record<BulkUserAction, string> = {
  deactivate: "Deactivate selected users?",
  ban: "Ban selected users?",
  assign_role: "Assign a role to selected users",
  soft_delete: "Delete selected users?",
};

const DESCRIPTIONS: Record<BulkUserAction, string> = {
  deactivate:
    "Selected users can no longer sign in but stay in history. Your own account and the last active Admin are always excluded.",
  ban: "Banning blocks sign-in and records the reason, who banned, and when. Your own account and the last active Admin are always excluded.",
  assign_role:
    "Changes the role for every selected user. Your own account is excluded, and the last active Admin can never be demoted.",
  soft_delete:
    "Bulk delete is a SOFT delete: accounts are deactivated and kept in history. Permanent deletion stays a separate per-user, type-to-confirm action.",
};

/**
 * One confirmation dialog for all four bulk actions. Guardrails (self-
 * exclusion, last-active-Admin protection, one log entry per user) are
 * enforced SERVER-SIDE in bulkUserActionsAction — this dialog is just the
 * required confirmation step.
 */
export function BulkActionDialog({
  state,
  roles,
  onOpenChange,
  onDone,
}: {
  state: { action: BulkUserAction; ids: string[] } | null;
  roles: RoleOption[];
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const session = useSession();
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [banReason, setBanReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state) {
      setRole("staff");
      setBanReason("");
    }
  }, [state]);

  const includesSelf = state?.ids.includes(session.id) ?? false;
  const effectiveCount = (state?.ids.length ?? 0) - (includesSelf ? 1 : 0);

  async function run() {
    if (!state) return;
    setBusy(true);
    try {
      const result = await bulkUserActionsAction({
        action: state.action,
        userIds: state.ids,
        role: state.action === "assign_role" ? role : undefined,
        banReason: state.action === "ban" ? banReason : undefined,
      });
      if (result.ok) {
        toast.success(
          `${result.affected} user(s) updated${result.skipped.length ? ` · ${result.skipped.length} skipped` : ""}`,
          result.skipped.length
            ? { description: result.skipped.slice(0, 3).join("; ") + (result.skipped.length > 3 ? "…" : "") }
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
                {effectiveCount} user(s) affected
                {includesSelf ? " (you are excluded from your own selection)" : ""}.{" "}
                {DESCRIPTIONS[state.action]}
              </DialogDescription>
            </DialogHeader>

            {state.action === "assign_role" ? (
              <div className="space-y-1.5">
                <Label htmlFor="bulk-role">Role to assign</Label>
                <Select value={role} onValueChange={(v) => setRole(v as "admin" | "staff")}>
                  <SelectTrigger id="bulk-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.key}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {state.action === "ban" ? (
              <div className="space-y-1.5">
                <Label htmlFor="bulk-ban-reason">Ban reason (recorded per user)</Label>
                <Textarea
                  id="bulk-ban-reason"
                  rows={2}
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="e.g. policy violation — shared credentials"
                  maxLength={500}
                />
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant={state.action === "assign_role" ? "default" : "destructive"}
                onClick={() => void run()}
                disabled={busy || effectiveCount === 0 || (state.action === "ban" && banReason.trim().length < 3)}
              >
                {busy ? <Loader2 className="animate-spin" /> : null}
                Confirm ({effectiveCount})
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
