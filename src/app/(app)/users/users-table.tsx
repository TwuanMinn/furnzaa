"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Download, Pin, PinOff, ShieldOff, Trash2, UserCog, UserPlus, UsersRound } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/datatable/data-table";
import { useDataTable } from "@/lib/datatable/use-data-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Can, useSession } from "@/lib/rbac/context";
import { buildCsv, downloadCsv } from "@/lib/export/csv";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import { togglePinUserAction } from "@/lib/users/actions";
import { GENDER_OPTIONS, type BulkUserAction } from "@/lib/users/schemas";
import type { FilterDef } from "@/lib/datatable/types";
import type { UserListRow } from "@/lib/datasets/users";
import type { RoleOption } from "./page";
import { UserFormDialog } from "./user-form-dialog";
import { UserDetailSheet } from "./user-detail-sheet";
import { BulkActionDialog } from "./bulk-action-dialog";

export function StatusBadgeUser({ user }: { user: UserListRow }) {
  if (user.status === "banned") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="cursor-help bg-red-100 text-red-700 ring-red-600/20 dark:bg-red-400/10 dark:text-red-300">
            Banned
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-xs">
          {user.ban_reason ?? "No reason recorded"}
          {user.banned_by_user ? ` — by ${user.banned_by_user.full_name}` : ""}
          {user.banned_at ? ` (${formatDate(user.banned_at)})` : ""}
        </TooltipContent>
      </Tooltip>
    );
  }
  if (user.status === "active") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300">
        Active
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Deactivated
    </Badge>
  );
}

export function UsersTable({
  roles,
  pinnedUsers,
}: {
  roles: RoleOption[];
  pinnedUsers: UserListRow[];
}) {
  const session = useSession();
  const router = useRouter();
  const reduce = useReducedMotion();
  const table = useDataTable<UserListRow>({
    endpoint: "/api/users",
    defaultSort: { id: "created_at", dir: "desc" },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<UserListRow | null>(null);
  const [bulkAction, setBulkAction] = useState<{ action: BulkUserAction; ids: string[] } | null>(null);
  const [pinBusy, setPinBusy] = useState<string | null>(null);

  const pinnedIds = new Set(pinnedUsers.map((u) => u.id));

  async function togglePin(user: UserListRow) {
    setPinBusy(user.id);
    try {
      const result = await togglePinUserAction(user.id);
      if (result.ok) {
        toast.success(pinnedIds.has(user.id) ? `Unpinned ${user.full_name}` : `Pinned ${user.full_name}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setPinBusy(null);
    }
  }

  function exportSelected(ids: string[]) {
    const rows = table.rows.filter((r) => ids.includes(r.id));
    if (rows.length === 0) {
      toast.error("The selected rows aren't on this page anymore — adjust the selection.");
      return;
    }
    downloadCsv(
      `users-selected-${new Date().toISOString().slice(0, 10)}.csv`,
      buildCsv(
        ["Name", "Email", "Role", "Status", "Department", "Birthday", "Gender", "Created", "Last login"],
        rows.map((r) => [
          r.full_name,
          r.email,
          r.roles?.name ?? "",
          r.status,
          r.department ?? "",
          r.birthday ?? "",
          r.gender ?? "",
          formatDate(r.created_at),
          r.last_login_at ? formatDateTime(r.last_login_at) : "Never",
        ]),
      ),
    );
    toast.success(`Exported ${rows.length} selected user(s)`);
  }

  const columns: DataTableColumn<UserListRow>[] = [
    {
      id: "full_name",
      header: "Name",
      sortable: true,
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8">
            <AvatarImage src={r.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="text-xs">{initials(r.full_name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">
              {r.full_name}
              {r.id === session.id ? (
                <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
              ) : null}
            </p>
            {r.department ? (
              <p className="truncate text-xs text-muted-foreground">{r.department}</p>
            ) : null}
          </div>
        </div>
      ),
    },
    { id: "email", header: "Email", sortable: true, cell: (r) => r.email, hideBelow: "md" },
    {
      id: "role",
      header: "Role",
      cell: (r) => (
        <Badge variant={r.roles?.key === "admin" ? "default" : "secondary"}>
          {r.roles?.name ?? "—"}
        </Badge>
      ),
    },
    { id: "status", header: "Status", cell: (r) => <StatusBadgeUser user={r} /> },
    {
      // Nullable column → not sortable (keyset cursors need NOT NULL keys).
      id: "birthday",
      header: "Birthday",
      hideBelow: "lg",
      cell: (r) => (
        <span className="text-muted-foreground">
          {r.birthday ? formatDate(r.birthday) : "—"}
        </span>
      ),
    },
    {
      id: "gender",
      header: "Gender",
      hideBelow: "lg",
      cell: (r) => (
        <span className="text-muted-foreground">
          {r.gender
            ? (GENDER_OPTIONS.find((g) => g.value === r.gender)?.label ?? r.gender)
            : "—"}
        </span>
      ),
    },
    {
      id: "created_at",
      header: "Created",
      sortable: true,
      hideBelow: "lg",
      cell: (r) => <span className="text-muted-foreground">{formatDate(r.created_at)}</span>,
    },
    {
      id: "last_login",
      header: "Last login",
      hideBelow: "lg",
      cell: (r) => (
        <span className="text-muted-foreground">
          {r.last_login_at ? formatDateTime(r.last_login_at) : "Never"}
        </span>
      ),
    },
    {
      id: "pin",
      header: "",
      cell: (r) => (
        <Can permission="users.view">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={pinnedIds.has(r.id) ? `Unpin ${r.full_name}` : `Pin ${r.full_name}`}
            disabled={pinBusy === r.id}
            onClick={(e) => {
              e.stopPropagation();
              void togglePin(r);
            }}
            className={pinnedIds.has(r.id) ? "text-primary" : "text-muted-foreground"}
          >
            {pinnedIds.has(r.id) ? <Pin className="fill-current" /> : <Pin />}
          </Button>
        </Can>
      ),
    },
  ];

  const filters: FilterDef[] = [
    {
      type: "select",
      id: "role",
      label: "Role",
      options: roles.map((r) => ({ value: r.id, label: r.name })),
    },
    {
      type: "select",
      id: "status",
      label: "Status",
      options: [
        { value: "active", label: "Active" },
        { value: "deactivated", label: "Deactivated" },
        { value: "banned", label: "Banned" },
      ],
    },
    { type: "daterange", id: "created_at", label: "Created between" },
  ];

  return (
    <>
      {/* Personal pinned strip — per-admin, always on top of THEIR list. */}
      {pinnedUsers.length > 0 ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-2"
        >
          <Pin className="size-4 text-primary" aria-hidden />
          <span className="text-xs font-medium text-muted-foreground">Pinned by you:</span>
          {pinnedUsers.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => setDetailUser(u)}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card py-0.5 pr-2.5 pl-0.5 text-sm transition-colors hover:bg-accent"
            >
              <Avatar className="size-6">
                <AvatarImage src={u.avatar_url ?? undefined} alt="" />
                <AvatarFallback className="text-[10px]">{initials(u.full_name)}</AvatarFallback>
              </Avatar>
              {u.full_name}
              <PinOff
                className="size-3 text-muted-foreground hover:text-destructive"
                aria-hidden
                onClick={(e) => {
                  e.stopPropagation();
                  void togglePin(u);
                }}
              />
            </button>
          ))}
        </motion.div>
      ) : null}

      <DataTable
        table={table}
        columns={columns}
        getRowId={(r) => r.id}
        filterDefs={filters}
        searchPlaceholder="Search name or email…"
        exportDataset="users"
        importDataset="users"
        onRowClick={setDetailUser}
        selectable
        bulkActions={(ids) => (
          <>
            <Can permission="users.deactivate">
              <Button variant="outline" size="xs" onClick={() => setBulkAction({ action: "deactivate", ids })}>
                <ShieldOff /> Deactivate
              </Button>
              <Button
                variant="outline"
                size="xs"
                className="text-red-600 dark:text-red-400"
                onClick={() => setBulkAction({ action: "ban", ids })}
              >
                <Ban /> Ban
              </Button>
            </Can>
            <Can permission="users.edit">
              <Button variant="outline" size="xs" onClick={() => setBulkAction({ action: "assign_role", ids })}>
                <UserCog /> Assign role
              </Button>
            </Can>
            <Button variant="outline" size="xs" onClick={() => exportSelected(ids)}>
              <Download /> Export
            </Button>
            <Can permission="users.delete">
              <Button
                variant="outline"
                size="xs"
                className="text-destructive hover:text-destructive"
                onClick={() => setBulkAction({ action: "soft_delete", ids })}
              >
                <Trash2 /> Delete
              </Button>
            </Can>
          </>
        )}
        emptyIcon={UsersRound}
        emptyTitle="No users found"
        emptyDescription="Adjust the search or filters, or invite someone new."
        toolbar={
          <Can permission="users.create">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <UserPlus /> Add user
            </Button>
          </Can>
        }
      />

      <UserFormDialog
        mode="create"
        roles={roles}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={table.refresh}
      />

      <UserDetailSheet
        user={detailUser}
        roles={roles}
        onOpenChange={(open) => {
          if (!open) setDetailUser(null);
        }}
        onChanged={() => {
          table.refresh();
          router.refresh();
        }}
      />

      <BulkActionDialog
        state={bulkAction}
        roles={roles}
        onOpenChange={(open) => !open && setBulkAction(null)}
        onDone={() => {
          table.clearSelection();
          table.refresh();
        }}
      />
    </>
  );
}
