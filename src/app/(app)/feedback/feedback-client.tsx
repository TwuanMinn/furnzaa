"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { BarChart3, MessageSquareWarning, Plus, Rows3, Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/datatable/data-table";
import { useDataTable } from "@/lib/datatable/use-data-table";
import { TableSkeleton } from "@/components/states";
import { formatDate } from "@/lib/format";
import type { FeedbackListRow } from "@/lib/datasets/feedback";
import type { FilterDef } from "@/lib/datatable/types";
import { FeedbackDetailSheet } from "./feedback-detail";
import { FeedbackFormDialog, type FeedbackConfigProps } from "./feedback-form-dialog";

const FeedbackAnalytics = dynamic(
  () => import("./feedback-analytics").then((m) => m.FeedbackAnalytics),
  { loading: () => <TableSkeleton rows={6} /> },
);

const STATUS_META: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "blue" },
  in_progress: { label: "In progress", color: "amber" },
  resolved: { label: "Resolved", color: "green" },
  reopened: { label: "Reopened", color: "red" },
};

interface Preset {
  id: string;
  label: string;
  filters: (meId: string) => Record<string, string>;
}

const PRESETS: Preset[] = [
  { id: "all", label: "All", filters: () => ({}) },
  { id: "unassigned", label: "Unassigned", filters: () => ({ assigned: "none", status: "new" }) },
  { id: "mine", label: "My queue", filters: (meId) => ({ assigned: meId }) },
  { id: "negative", label: "Negative (1–2★)", filters: () => ({ rating_max: "2" }) },
  {
    id: "overdue",
    label: "Overdue > 7 days",
    filters: () => ({
      status: "in_progress",
      date_to: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10),
    }),
  },
];

export function FeedbackClient({
  config,
  users,
  me,
  initialOpen,
  currency,
}: {
  config: FeedbackConfigProps;
  currency: string;
  users: { id: string; full_name: string }[];
  me: {
    id: string;
    canAssign: boolean;
    canResolve: boolean;
    canViewAll: boolean;
    canAnalytics: boolean;
  };
  initialOpen: string | null;
}) {
  const reduce = useReducedMotion();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<"records" | "analytics">("records");
  const [preset, setPreset] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialOpen);

  const table = useDataTable<FeedbackListRow>({
    endpoint: "/api/feedback",
    defaultSort: { id: "created_at", dir: "desc" },
  });

  // Notification links land on /feedback?open=<id>; keep the URL in sync so
  // refreshing or sharing keeps the sheet open.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (openId) params.set("open", openId);
    else params.delete("open");
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  function applyPreset(p: Preset) {
    setPreset(p.id);
    table.clearFilters();
    for (const [id, value] of Object.entries(p.filters(me.id))) table.setFilter(id, value);
  }

  const filters: FilterDef[] = [
    {
      type: "select",
      id: "rating",
      label: "Rating",
      options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n}★` })),
    },
    {
      type: "select",
      id: "status",
      label: "Status",
      options: Object.entries(STATUS_META).map(([value, m]) => ({ value, label: m.label })),
    },
    {
      type: "select",
      id: "category",
      label: "Category",
      options: config.categories.map((c) => ({ value: c, label: c })),
    },
    {
      type: "select",
      id: "severity",
      label: "Severity",
      options: config.severities.map((s) => ({ value: s.key, label: s.label })),
    },
    {
      type: "select",
      id: "assigned",
      label: "Assignee",
      options: [
        { value: "none", label: "Unassigned" },
        ...users.map((u) => ({ value: u.id, label: u.full_name })),
      ],
    },
    {
      type: "select",
      id: "channel",
      label: "Channel",
      options: config.channels.map((c) => ({ value: c, label: c })),
    },
    { type: "daterange", id: "date", label: "Created between" },
  ];

  const columns: DataTableColumn<FeedbackListRow>[] = [
    { id: "code", header: "Code", cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
    {
      id: "created_at",
      header: "Created",
      sortable: true,
      hideBelow: "md",
      cell: (r) => <span className="text-muted-foreground">{formatDate(r.created_at)}</span>,
    },
    { id: "customer", header: "Customer", cell: (r) => r.customer_name || "—" },
    {
      id: "rating",
      header: "Rating",
      sortable: true,
      cell: (r) => (
        <span className="inline-flex items-center gap-0.5" aria-label={`${r.rating} of 5 stars`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={cn(
                "size-3.5",
                n <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30",
              )}
              aria-hidden
            />
          ))}
        </span>
      ),
    },
    {
      id: "category",
      header: "Category",
      hideBelow: "lg",
      cell: (r) => <span className="text-muted-foreground">{r.category}</span>,
    },
    {
      id: "severity",
      header: "Severity",
      sortable: true,
      hideBelow: "lg",
      cell: (r) => {
        const meta = config.severities.find((s) => s.key === r.severity);
        return <StatusBadge status={r.severity} label={meta?.label ?? r.severity} color={meta?.color} />;
      },
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      cell: (r) => (
        <StatusBadge
          status={r.status}
          label={STATUS_META[r.status]?.label}
          color={STATUS_META[r.status]?.color}
        />
      ),
    },
    {
      id: "assigned",
      header: "Assignee",
      hideBelow: "lg",
      cell: (r) => <span className="text-muted-foreground">{r.assigned_name ?? "—"}</span>,
    },
    {
      id: "comments",
      header: "Comments",
      hideBelow: "md",
      cell: (r) => <span className="line-clamp-1 max-w-72 text-muted-foreground">{r.comments}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Records | Analytics segmented tabs */}
      {me.canAnalytics ? (
        <div className="flex items-center rounded-lg border border-border p-0.5 w-fit">
          {(
            [
              { id: "records", label: "Records", icon: Rows3 },
              { id: "analytics", label: "Analytics", icon: BarChart3 },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={cn(
                "relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                tab === id ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab === id ? (
                <motion.span
                  layoutId="feedback-tab-pill"
                  className="absolute inset-0 rounded-md bg-muted"
                  transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.4 }}
                />
              ) : null}
              <Icon className="relative size-4" aria-hidden />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {tab === "analytics" && me.canAnalytics ? (
        <FeedbackAnalytics severities={config.severities} />
      ) : (
        <>
          {/* Saved filter presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                aria-pressed={preset === p.id}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  preset === p.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <DataTable
            table={table}
            columns={columns}
            getRowId={(r) => r.id}
            filterDefs={filters}
            searchPlaceholder="Search comments or code…"
            exportDataset="feedback"
            importDataset={me.canViewAll ? "feedback" : undefined}
            onRowClick={(r) => setOpenId(r.id)}
            emptyIcon={MessageSquareWarning}
            emptyTitle="No feedback records"
            emptyDescription="Log what customers tell you — praise and complaints both count."
            toolbar={
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus /> Log feedback
              </Button>
            }
          />
        </>
      )}

      <FeedbackFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        config={config}
        onSaved={table.refresh}
      />

      <FeedbackDetailSheet
        feedbackId={openId}
        onOpenChange={(open) => !open && setOpenId(null)}
        onChanged={table.refresh}
        users={users}
        me={me}
        currency={currency}
      />
    </div>
  );
}
