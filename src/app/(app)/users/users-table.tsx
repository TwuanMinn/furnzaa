"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Ban, Download, Pin, PinOff, ShieldOff, Trash2, UserCog, UserPlus, UsersRound, LayoutGrid, List, Mail, Phone, Calendar, Clock, AlignJustify, Gauge, Activity, FileCheck2, PrinterCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserPerformance } from "@/app/api/users/[id]/performance/route";

import { DataTable, type DataTableColumn } from "@/components/datatable/data-table";
import { useDataTable } from "@/lib/datatable/use-data-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Can, useSession } from "@/lib/rbac/context";
import { cn } from "@/lib/utils";
import { buildCsv, downloadCsv } from "@/lib/export/csv";
import { formatDate, formatDateTime, initials, toDateKey } from "@/lib/format";
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

type ViewMode = "table" | "grid" | "compact" | "performance";

interface ToggleProps {
  value: ViewMode;
  onChange: (val: ViewMode) => void;
}

function SlidingPillToggle({ value, onChange }: ToggleProps) {
  return (
    <div className="relative flex items-center gap-1 rounded-full bg-muted p-1 border border-border">
      {(["table", "grid", "compact", "performance"] as const).map((mode) => {
        const isActive = value === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className="relative z-10 flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors hover:text-foreground/80 text-muted-foreground data-[active=true]:text-foreground"
            data-active={isActive}
          >
            {isActive && (
              <motion.div
                layoutId="active-pill"
                className="absolute inset-0 -z-10 rounded-full bg-background border border-border/40 shadow-sm"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            {mode === "table" && <List className="size-3.5" />}
            {mode === "grid" && <LayoutGrid className="size-3.5" />}
            {mode === "compact" && <AlignJustify className="size-3.5" />}
            {mode === "performance" && <Gauge className="size-3.5" />}
            <span className="capitalize">{mode === "performance" ? "perf" : mode}</span>
          </button>
        );
      })}
    </div>
  );
}

function UserPerformanceCardContent({ userId }: { userId: string }) {
  const query = useQuery({
    queryKey: ["user-performance", userId],
    queryFn: async (): Promise<UserPerformance> => {
      const res = await fetch(`/api/users/${userId}/performance`);
      const body = (await res.json()) as { ok: boolean; data?: UserPerformance; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Failed to load");
      return body.data;
    },
    staleTime: 60_000,
  });

  if (query.isLoading) {
    return (
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-3">
        <Skeleton className="h-8 w-16 rounded-md" />
        <Skeleton className="h-8 w-16 rounded-md" />
        <Skeleton className="h-8 w-16 rounded-md" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="mt-3 border-t border-border/50 pt-3 text-center text-xs text-muted-foreground">
        Stats temporarily unavailable
      </div>
    );
  }

  const d = query.data;

  return (
    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/50 pt-3 text-center">
      <div className="rounded-lg bg-muted/40 p-1.5 hover:bg-muted/80 transition-colors">
        <div className="flex items-center justify-center gap-1 text-muted-foreground text-[10px] uppercase font-medium tracking-wider">
          <FileCheck2 className="size-3" />
          <span>Orders</span>
        </div>
        <p className="mt-0.5 text-xs font-bold tabular-nums text-foreground">
          {d.orders.total}
        </p>
      </div>

      <div className="rounded-lg bg-muted/40 p-1.5 hover:bg-muted/80 transition-colors">
        <div className="flex items-center justify-center gap-1 text-muted-foreground text-[10px] uppercase font-medium tracking-wider">
          <PrinterCheck className="size-3" />
          <span>Prints</span>
        </div>
        <p className="mt-0.5 text-xs font-bold tabular-nums text-foreground">
          {d.prints.completed}
        </p>
      </div>

      <div className="rounded-lg bg-muted/40 p-1.5 hover:bg-muted/80 transition-colors">
        <div className="flex items-center justify-center gap-1 text-muted-foreground text-[10px] uppercase font-medium tracking-wider">
          <Activity className="size-3" />
          <span>Actions</span>
        </div>
        <p className="mt-0.5 text-xs font-bold tabular-nums text-foreground">
          {d.activity30d.actions}
        </p>
      </div>
    </div>
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
  const [viewMode, setViewMode] = useState<ViewMode>("table");

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
      `users-selected-${toDateKey()}.csv`,
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

  function renderGridUsers(rows: UserListRow[], onRowClick?: (row: UserListRow) => void) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {rows.map((r, index) => {
          const isSelected = table.selected.has(r.id);
          const isPinned = pinnedIds.has(r.id);

          return (
            <motion.div
              key={r.id}
              layout={reduce ? false : "position"}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.2,
                ease: "easeOut",
                delay: reduce ? 0 : Math.min(index * 0.02, 0.2),
              }}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={`group relative flex flex-col justify-between rounded-xl border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
                isSelected
                  ? "border-primary bg-primary/[0.02]"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div>
                {/* Top Row: Checkbox, Avatar, and Pin Action */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* Bulk Select Checkbox */}
                    <div
                      className="relative z-10 flex h-5 items-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => table.toggleSelected(r.id)}
                        aria-label={`Select ${r.full_name}`}
                        className="size-4 rounded border-muted-foreground/30 transition-all hover:scale-105"
                      />
                    </div>

                    <Avatar className="size-10 border border-border shadow-sm group-hover:scale-105 transition-transform duration-200">
                      <AvatarImage src={r.avatar_url ?? undefined} alt="" />
                      <AvatarFallback className="text-xs bg-muted font-semibold">
                        {initials(r.full_name)}
                      </AvatarFallback>
                    </Avatar>
                  </div>

                  {/* Pin Button */}
                  <Can permission="users.view">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={isPinned ? `Unpin ${r.full_name}` : `Pin ${r.full_name}`}
                      disabled={pinBusy === r.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void togglePin(r);
                      }}
                      className={`z-10 size-7 rounded-full transition-colors ${
                        isPinned
                          ? "text-primary bg-primary/10 hover:bg-primary/20"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {isPinned ? (
                        <Pin className="size-3.5 fill-current" />
                      ) : (
                        <Pin className="size-3.5" />
                      )}
                    </Button>
                  </Can>
                </div>

                {/* User Identity Info */}
                <div className="mt-3 min-w-0">
                  <h4 className="truncate font-semibold text-foreground flex items-center gap-1.5 text-sm">
                    {r.full_name}
                    {r.id === session.id && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                        you
                      </span>
                    )}
                  </h4>
                  {r.department ? (
                    <p className="truncate text-xs text-muted-foreground mt-0.5">
                      {r.department}
                    </p>
                  ) : (
                    <p className="truncate text-xs text-muted-foreground/40 mt-0.5">
                      No department
                    </p>
                  )}
                </div>

                {/* Badges: Role and Status */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant={r.roles?.key === "admin" ? "default" : "secondary"}
                    className="text-[10px] px-2 py-0"
                  >
                    {r.roles?.name ?? "—"}
                  </Badge>
                  <StatusBadgeUser user={r} />
                </div>
              </div>

              {/* Bottom Metadata: Email, Created, Last Login OR Performance stats */}
              {viewMode === "performance" ? (
                <UserPerformanceCardContent userId={r.id} />
              ) : (
                <div className="mt-4 border-t border-border/50 pt-3 space-y-1.5 text-[11px] text-muted-foreground">
                  {/* Email */}
                  <a
                    href={`mailto:${r.email}`}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-2 hover:text-primary transition-colors group/link truncate"
                  >
                    <Mail className="size-3.5 shrink-0" />
                    <span className="truncate">{r.email}</span>
                  </a>

                  {/* Phone */}
                  {r.phone ? (
                    <a
                      href={`tel:${r.phone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 hover:text-primary transition-colors truncate"
                    >
                      <Phone className="size-3.5 shrink-0" />
                      <span>{r.phone}</span>
                    </a>
                  ) : null}

                  {/* Birthday */}
                  {r.birthday ? (
                    <div className="flex items-center gap-2">
                      <Calendar className="size-3.5 shrink-0" />
                      <span>Born {formatDate(r.birthday)}</span>
                    </div>
                  ) : null}

                  {/* Last login */}
                  <div className="flex items-center gap-2 text-muted-foreground/80">
                    <Clock className="size-3.5 shrink-0" />
                    <span>
                      Last active: {r.last_login_at ? formatDateTime(r.last_login_at) : "Never"}
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    );
  }

  const columns: DataTableColumn<UserListRow>[] = [
    {
      id: "full_name",
      header: "Name",
      sortable: true,
      cell: (r) => (
        <div className="flex items-center gap-2">
          {viewMode !== "compact" && (
            <Avatar className="size-8">
              <AvatarImage src={r.avatar_url ?? undefined} alt="" />
              <AvatarFallback className="text-xs">{initials(r.full_name)}</AvatarFallback>
            </Avatar>
          )}
          <div className="min-w-0">
            <p className={cn("truncate font-medium", viewMode === "compact" && "text-xs")}>
              {r.full_name}
              {r.id === session.id ? (
                <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>
              ) : null}
            </p>
            {r.department && viewMode !== "compact" ? (
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
        <Badge
          variant={r.roles?.key === "admin" ? "default" : "secondary"}
          className={cn(viewMode === "compact" && "text-[10px] px-1.5 py-0")}
        >
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
        viewMode={viewMode}
        renderGrid={renderGridUsers}
        viewToggle={<SlidingPillToggle value={viewMode} onChange={setViewMode} />}
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
