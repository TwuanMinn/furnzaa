/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { Ban, KeyRound, Loader2, Pencil, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { UserPerformancePanel } from "./user-performance";
import { Can, useSession } from "@/lib/rbac/context";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import {
  banUserAction,
  deactivateUserAction,
  deleteUserAction,
  reactivateUserAction,
  sendPasswordResetAction,
  unbanUserAction,
} from "@/lib/users/actions";
import { GENDER_OPTIONS } from "@/lib/users/schemas";
import type { UserListRow } from "@/lib/datasets/users";
import type { RoleOption } from "./page";
import { UserFormDialog } from "./user-form-dialog";
import { StatusBadgeUser } from "./users-table";

interface UserDetailSheetProps {
  user: UserListRow | null;
  roles: RoleOption[];
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

type ConfirmKind = "deactivate" | "ban" | "delete";

/**
 * Slide-over with user details, the 12-month activity heatmap (rollup-fed),
 * and the privileged actions: ban (with reason), deactivate/reactivate,
 * password reset, and TYPE-TO-CONFIRM permanent deletion (Admin only).
 */
export function UserDetailSheet({ user, roles, onOpenChange, onChanged }: UserDetailSheetProps) {
  const session = useSession();
  const [editOpen, setEditOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [banReason, setBanReason] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const isSelf = user?.id === session.id;

  useEffect(() => {
    setBanReason("");
    setDeleteConfirmText("");
  }, [confirm, user?.id]);

  async function run(
    key: string,
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    successMessage: string,
    { close = false }: { close?: boolean } = {},
  ) {
    setBusy(key);
    try {
      const result = await action();
      if (result.ok) {
        toast.success(successMessage);
        onChanged?.();
        if (close) onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  const genderLabel = user?.gender
    ? (GENDER_OPTIONS.find((g) => g.value === user.gender)?.label ?? user.gender)
    : "—";

  return (
    <>
      <Sheet open={!!user} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {user ? (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <Avatar className="size-12">
                    <AvatarImage src={user.avatar_url ?? undefined} alt="" />
                    <AvatarFallback>{initials(user.full_name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <SheetTitle className="text-left">{user.full_name}</SheetTitle>
                    <SheetDescription className="text-left">{user.email}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-5 px-4 pb-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={user.roles?.key === "admin" ? "default" : "secondary"}>
                    {user.roles?.name ?? "—"}
                  </Badge>
                  <StatusBadgeUser user={user} />
                  {isSelf ? <Badge variant="outline">This is you</Badge> : null}
                </div>

                {user.status === "banned" ? (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm dark:border-red-900/50 dark:bg-red-950/30">
                    <p className="font-medium text-red-700 dark:text-red-300">
                      Banned{user.banned_at ? ` ${formatDate(user.banned_at)}` : ""}
                      {user.banned_by_user ? ` by ${user.banned_by_user.full_name}` : ""}
                    </p>
                    <p className="text-red-600/90 dark:text-red-300/80">
                      {user.ban_reason ?? "No reason recorded"}
                    </p>
                  </div>
                ) : null}

                <Tabs defaultValue="overview">
                  <TabsList className="w-full">
                    <TabsTrigger value="overview" className="flex-1">
                      Overview
                    </TabsTrigger>
                    <TabsTrigger value="performance" className="flex-1">
                      Performance
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="performance" className="pt-3">
                    <UserPerformancePanel userId={user.id} />
                  </TabsContent>
                  <TabsContent value="overview" className="space-y-5 pt-3">
                <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm">
                  <div className="grid grid-cols-[110px_1fr] items-baseline gap-2">
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd>{user.phone ?? "—"}</dd>
                  </div>
                  <div className="grid grid-cols-[110px_1fr] items-baseline gap-2">
                    <dt className="text-muted-foreground">Department</dt>
                    <dd>{user.department ?? "—"}</dd>
                  </div>
                  <div className="grid grid-cols-[110px_1fr] items-baseline gap-2">
                    <dt className="text-muted-foreground">Birthday</dt>
                    <dd>{user.birthday ? formatDate(user.birthday) : "—"}</dd>
                  </div>
                  <div className="grid grid-cols-[110px_1fr] items-baseline gap-2">
                    <dt className="text-muted-foreground">Gender</dt>
                    <dd>{genderLabel}</dd>
                  </div>
                  <div className="grid grid-cols-[110px_1fr] items-baseline gap-2">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd>{formatDateTime(user.created_at)}</dd>
                  </div>
                  <div className="grid grid-cols-[110px_1fr] items-baseline gap-2">
                    <dt className="text-muted-foreground">Last login</dt>
                    <dd>{user.last_login_at ? formatDateTime(user.last_login_at) : "Never"}</dd>
                  </div>
                </dl>

                <Separator />

                <div>
                  <h3 className="mb-2 text-sm font-medium">Activity (last 12 months)</h3>
                  <ActivityHeatmap userId={user.id} />
                </div>

                <Separator />

                <div className="flex flex-col gap-2">
                  <Can permission="users.edit">
                    <Button variant="outline" className="justify-start" onClick={() => setEditOpen(true)}>
                      <Pencil /> Edit details
                    </Button>
                    <Button
                      variant="outline"
                      className="justify-start"
                      disabled={busy === "reset" || user.status !== "active"}
                      onClick={() =>
                        void run(
                          "reset",
                          () => sendPasswordResetAction(user.id),
                          `Password-reset email sent to ${user.email}`,
                        )
                      }
                    >
                      {busy === "reset" ? <Loader2 className="animate-spin" /> : <KeyRound />}
                      Send password reset
                    </Button>
                  </Can>

                  <Can permission="users.deactivate">
                    {user.status === "active" ? (
                      <>
                        <Button
                          variant="outline"
                          className="justify-start text-amber-600 hover:text-amber-600 dark:text-amber-400"
                          disabled={isSelf}
                          onClick={() => setConfirm("deactivate")}
                        >
                          <ShieldOff /> Deactivate account
                        </Button>
                        <Button
                          variant="outline"
                          className="justify-start text-red-600 hover:text-red-600 dark:text-red-400"
                          disabled={isSelf}
                          onClick={() => setConfirm("ban")}
                        >
                          <Ban /> Ban account
                        </Button>
                      </>
                    ) : user.status === "banned" ? (
                      <Button
                        variant="outline"
                        className="justify-start text-emerald-600 hover:text-emerald-600 dark:text-emerald-400"
                        disabled={busy === "unban"}
                        onClick={() =>
                          void run("unban", () => unbanUserAction(user.id), `${user.full_name} unbanned`, {
                            close: true,
                          })
                        }
                      >
                        {busy === "unban" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                        Lift ban
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="justify-start text-emerald-600 hover:text-emerald-600 dark:text-emerald-400"
                        disabled={busy === "reactivate"}
                        onClick={() =>
                          void run(
                            "reactivate",
                            () => reactivateUserAction(user.id),
                            `${user.full_name} can sign in again`,
                            { close: true },
                          )
                        }
                      >
                        {busy === "reactivate" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                        Reactivate account
                      </Button>
                    )}
                  </Can>

                  <Can permission="users.delete">
                    <Button
                      variant="outline"
                      className="justify-start text-destructive hover:text-destructive"
                      disabled={isSelf}
                      onClick={() => setConfirm("delete")}
                    >
                      <Trash2 /> Delete permanently
                    </Button>
                  </Can>
                </div>
                  </TabsContent>
                </Tabs>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {user ? (
        <UserFormDialog
          mode="edit"
          user={user}
          roles={roles}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={() => {
            onChanged?.();
            onOpenChange(false);
          }}
        />
      ) : null}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && busy === null && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "delete"
                ? `Permanently delete ${user?.full_name}?`
                : confirm === "ban"
                  ? `Ban ${user?.full_name}?`
                  : `Deactivate ${user?.full_name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "This removes their account and sign-in entirely. Their name remains on past orders and activity. This cannot be undone."
                : confirm === "ban"
                  ? "Banning blocks sign-in and records the reason, who banned, and when. The account stays in history and the ban can be lifted later."
                  : "They will no longer be able to sign in. Their history is kept and you can reactivate them at any time."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirm === "ban" ? (
            <div className="space-y-1.5">
              <Label htmlFor="uds-ban-reason">Ban reason</Label>
              <Textarea
                id="uds-ban-reason"
                rows={2}
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                maxLength={500}
                placeholder="Required — recorded on the account and in the activity log"
              />
            </div>
          ) : null}

          {confirm === "delete" ? (
            <div className="space-y-1.5">
              <Label htmlFor="uds-delete-confirm">
                Type <span className="font-mono font-semibold">{user?.email}</span> to confirm
              </Label>
              <Input
                id="uds-delete-confirm"
                autoComplete="off"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={user?.email}
              />
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirm !== "deactivate" ? "bg-destructive text-white hover:bg-destructive/90" : undefined
              }
              disabled={
                busy !== null ||
                (confirm === "ban" && banReason.trim().length < 3) ||
                (confirm === "delete" && deleteConfirmText.trim().toLowerCase() !== user?.email.toLowerCase())
              }
              onClick={(e) => {
                e.preventDefault();
                if (!user) return;
                if (confirm === "delete") {
                  void run("delete", () => deleteUserAction(user.id), `${user.full_name} deleted`, {
                    close: true,
                  });
                } else if (confirm === "ban") {
                  void run("ban", () => banUserAction(user.id, banReason), `${user.full_name} banned`, {
                    close: true,
                  });
                } else {
                  void run(
                    "deactivate",
                    () => deactivateUserAction(user.id),
                    `${user.full_name} deactivated`,
                    { close: true },
                  );
                }
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {confirm === "delete" ? "Delete permanently" : confirm === "ban" ? "Ban account" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
