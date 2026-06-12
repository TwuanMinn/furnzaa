"use client";

import { useState } from "react";
import { ScrollText } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/datatable/data-table";
import { useDataTable } from "@/lib/datatable/use-data-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, initials, truncate } from "@/lib/format";
import type { FilterDef } from "@/lib/datatable/types";
import type { ActivityListRow } from "@/lib/datasets/activity";
import { ACTIVITY_MODULES } from "./constants";
import { LogDetailSheet } from "./log-detail-sheet";

const ACTION_OPTIONS = [
  "auth.login",
  "auth.password_change",
  "user.create",
  "user.update",
  "user.deactivate",
  "user.reactivate",
  "user.delete",
  "order.create",
  "order.update",
  "order.status_change",
  "order.delete",
  "users.import",
  "users.export",
  "orders.import",
  "orders.export",
  "customers.import",
  "customers.export",
  "activity.export",
  "logs.purge",
];

interface ActivityTableProps {
  actors: { id: string; full_name: string }[];
  canViewAll: boolean;
}

export function ActivityTable({ actors, canViewAll }: ActivityTableProps) {
  const table = useDataTable<ActivityListRow>({
    endpoint: "/api/activity",
    defaultSort: { id: "created_at", dir: "desc" },
  });
  const [detail, setDetail] = useState<ActivityListRow | null>(null);

  const columns: DataTableColumn<ActivityListRow>[] = [
    {
      id: "created_at",
      header: "When",
      sortable: true,
      cell: (r) => (
        <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.created_at)}</span>
      ),
    },
    {
      id: "actor",
      header: "Who",
      cell: (r) => (
        <div className="flex items-center gap-2">
          <Avatar className="size-6">
            <AvatarImage src={r.actor?.avatar_url ?? undefined} alt="" />
            <AvatarFallback className="text-[10px]">
              {initials(r.actor?.full_name ?? r.actor_email ?? "?")}
            </AvatarFallback>
          </Avatar>
          <span className="truncate">{r.actor?.full_name ?? r.actor_email ?? "System"}</span>
        </div>
      ),
    },
    {
      id: "action",
      header: "Action",
      hideBelow: "md",
      cell: (r) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.action}</code>
      ),
    },
    {
      id: "module",
      header: "Module",
      hideBelow: "lg",
      cell: (r) => <Badge variant="outline">{r.module}</Badge>,
    },
    {
      id: "summary",
      header: "Summary",
      cell: (r) => <span title={r.summary}>{truncate(r.summary, 80)}</span>,
      className: "max-w-md",
    },
  ];

  const filters: FilterDef[] = [
    {
      type: "select",
      id: "module",
      label: "Module",
      options: ACTIVITY_MODULES.map((m) => ({ value: m, label: m })),
    },
    {
      type: "select",
      id: "action",
      label: "Action",
      options: ACTION_OPTIONS.map((a) => ({ value: a, label: a })),
    },
    ...(canViewAll
      ? ([
          {
            type: "select",
            id: "actor",
            label: "User",
            options: actors.map((a) => ({ value: a.id, label: a.full_name })),
          },
        ] satisfies FilterDef[])
      : []),
    { type: "daterange", id: "created_at", label: "Between" },
  ];

  return (
    <>
      <DataTable
        table={table}
        columns={columns}
        getRowId={(r) => r.id}
        filterDefs={filters}
        searchPlaceholder="Search summaries, actions, emails…"
        exportDataset={canViewAll ? "activity" : undefined}
        onRowClick={setDetail}
        emptyIcon={ScrollText}
        emptyTitle="No activity found"
        emptyDescription="Try widening the date range or clearing filters."
      />
      <LogDetailSheet entry={detail} onOpenChange={(open) => !open && setDetail(null)} />
    </>
  );
}
