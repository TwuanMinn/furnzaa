"use client";

import { useEffect, useState } from "react";
import { Megaphone, Plus } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/datatable/data-table";
import { useDataTable } from "@/lib/datatable/use-data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/lib/rbac/context";
import { formatDateTime } from "@/lib/format";
import type { CampaignListRow } from "@/lib/datasets/marketing";
import type { SegmentRow, TierRow } from "@/lib/datasets/crm";
import type { FilterDef } from "@/lib/datatable/types";
import type { VoucherOption } from "./page";
import { CampaignCreateDialog } from "./campaign-create-dialog";
import { CampaignDetailSheet } from "./campaign-detail-sheet";

export const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  in_app: "In-App",
};

export const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300",
  scheduled: "bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-400/10 dark:text-red-300",
};

export function audienceSummary(row: CampaignListRow, segments: SegmentRow[]): string {
  if (row.audience_type === "all") return "All customers";
  if (row.audience_type === "tier") {
    const keys = (row.audience_value.tier_keys as string[] | undefined) ?? [];
    return `Tier: ${keys.join(", ") || "—"}`;
  }
  if (row.audience_type === "segment") {
    const id = row.audience_value.segment_id as string | undefined;
    return `Segment: ${segments.find((s) => s.id === id)?.name ?? "—"}`;
  }
  return "Custom filter";
}

export function CampaignsTab({
  segments,
  tiers,
  vouchers,
  focusCampaignId,
}: {
  segments: SegmentRow[];
  tiers: TierRow[];
  vouchers: VoucherOption[];
  focusCampaignId: string | null;
}) {
  const table = useDataTable<CampaignListRow>({
    endpoint: "/api/marketing/campaigns",
    defaultSort: { id: "created_at", dir: "desc" },
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<CampaignListRow | null>(null);

  useEffect(() => {
    if (!focusCampaignId) return;
    const hit = table.rows.find((r) => r.id === focusCampaignId);
    if (hit) setDetail(hit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCampaignId, table.rows.length]);

  const columns: DataTableColumn<CampaignListRow>[] = [
    {
      id: "name",
      header: "Campaign",
      sortable: true,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.name}</p>
          <p className="truncate text-xs text-muted-foreground">{audienceSummary(r, segments)}</p>
        </div>
      ),
    },
    {
      id: "channel",
      header: "Channel",
      cell: (r) => <Badge variant="outline">{CHANNEL_LABELS[r.channel]}</Badge>,
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status] ?? ""}`}
        >
          {r.status}
        </span>
      ),
    },
    {
      id: "progress",
      header: "Progress",
      align: "right",
      cell: (r) =>
        r.status === "draft" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular-nums">
            {r.sent_count.toLocaleString()}
            {r.total_recipients > 0 ? ` / ${r.total_recipients.toLocaleString()}` : ""}
            {r.failed_count > 0 ? (
              <span className="ml-1 text-xs text-red-600 dark:text-red-400">({r.failed_count} failed)</span>
            ) : null}
          </span>
        ),
    },
    {
      id: "schedule",
      header: "Schedule",
      hideBelow: "lg",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.status === "scheduled" && r.schedule_at
            ? `at ${formatDateTime(r.schedule_at)}`
            : r.completed_at
              ? `done ${formatDateTime(r.completed_at)}`
              : r.started_at
                ? `started ${formatDateTime(r.started_at)}`
                : "—"}
        </span>
      ),
    },
    {
      id: "created",
      header: "Created",
      sortable: false,
      hideBelow: "lg",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {formatDateTime(r.created_at)}
          {r.created_by_user ? ` · ${r.created_by_user.full_name}` : ""}
        </span>
      ),
    },
  ];

  const filters: FilterDef[] = [
    {
      type: "select",
      id: "status",
      label: "Status",
      options: ["draft", "scheduled", "running", "completed", "cancelled"].map((s) => ({
        value: s,
        label: s,
      })),
    },
    {
      type: "select",
      id: "channel",
      label: "Channel",
      options: Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label })),
    },
  ];

  return (
    <>
      <DataTable
        table={table}
        columns={columns}
        getRowId={(r) => r.id}
        filterDefs={filters}
        searchPlaceholder="Search campaigns…"
        onRowClick={setDetail}
        emptyIcon={Megaphone}
        emptyTitle="No campaigns yet"
        emptyDescription="Create a campaign targeting all customers, a loyalty tier, or a saved segment."
        toolbar={
          <Can permission="campaigns.create">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus /> New campaign
            </Button>
          </Can>
        }
      />

      <CampaignCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        segments={segments}
        tiers={tiers}
        vouchers={vouchers}
        onSaved={table.refresh}
      />
      <CampaignDetailSheet
        campaign={detail}
        segments={segments}
        onOpenChange={(open) => !open && setDetail(null)}
        onChanged={table.refresh}
      />
    </>
  );
}
