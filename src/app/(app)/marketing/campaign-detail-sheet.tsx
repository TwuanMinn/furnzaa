"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Play, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Can } from "@/lib/rbac/context";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  cancelCampaignAction,
  launchCampaignAction,
  processCampaignNowAction,
} from "@/lib/marketing/actions";
import type { CampaignListRow, CampaignStatsRow } from "@/lib/datasets/marketing";
import type { SegmentRow } from "@/lib/datasets/crm";
import { audienceSummary, CHANNEL_LABELS, STATUS_BADGE } from "./campaigns-tab";

function rate(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

export function CampaignDetailSheet({
  campaign,
  segments,
  onOpenChange,
  onChanged,
}: {
  campaign: CampaignListRow | null;
  segments: SegmentRow[];
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const statsQuery = useQuery({
    queryKey: ["campaign-stats", campaign?.id],
    enabled: !!campaign && campaign.status !== "draft",
    refetchInterval: campaign?.status === "running" ? 4000 : false, // live progress
    queryFn: async (): Promise<CampaignStatsRow | null> => {
      const res = await fetch(`/api/marketing/campaigns/${campaign!.id}/stats`);
      const body = (await res.json()) as { ok: boolean; data?: { stats: CampaignStatsRow | null } };
      return body.ok ? (body.data?.stats ?? null) : null;
    },
  });

  async function run(key: string, fn: () => Promise<{ ok: boolean } & Record<string, unknown>>, message: string) {
    setBusy(key);
    try {
      const result = await fn();
      if (result.ok) {
        toast.success(message);
        onChanged?.();
        void statsQuery.refetch();
      } else {
        toast.error(String((result as { error?: string }).error ?? "Failed"));
      }
    } finally {
      setBusy(null);
    }
  }

  const stats = statsQuery.data;

  return (
    <Sheet open={!!campaign} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {campaign ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2 text-left">
                {campaign.name}
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[campaign.status] ?? ""}`}
                >
                  {campaign.status}
                </span>
              </SheetTitle>
              <SheetDescription className="text-left">
                {CHANNEL_LABELS[campaign.channel]} · {audienceSummary(campaign, segments)}
                {campaign.voucher ? ` · voucher ${campaign.voucher.code}` : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-6">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {campaign.subject ? <p className="mb-1 font-medium">{campaign.subject}</p> : null}
                {campaign.template}
              </div>

              {campaign.status !== "draft" ? (
                <div>
                  <h3 className="mb-2 text-sm font-medium">
                    Delivery & engagement{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      (pre-aggregated{stats ? `, refreshed ${formatDateTime(stats.refreshed_at)}` : ""})
                    </span>
                  </h3>
                  {statsQuery.isLoading ? (
                    <Skeleton className="h-32 w-full rounded-lg" />
                  ) : (
                    <dl className="grid grid-cols-3 gap-x-3 gap-y-2.5 text-sm">
                      <Stat label="Sent" value={String(stats?.sent ?? campaign.sent_count)} />
                      <Stat label="Delivered" value={String(stats?.delivered ?? 0)} />
                      <Stat label="Failed" value={String(campaign.failed_count)} tone={campaign.failed_count > 0 ? "bad" : undefined} />
                      <Stat label="Open rate" value={rate(stats?.opened ?? 0, stats?.sent ?? 0)} />
                      <Stat label="Click rate" value={rate(stats?.clicked ?? 0, stats?.sent ?? 0)} />
                      <Stat label="Conversion" value={rate(stats?.converted ?? 0, stats?.sent ?? 0)} />
                      <Stat label="Redemptions" value={String(stats?.redemptions ?? 0)} />
                      <Stat label="Revenue" value={formatMoney(stats?.revenue_cents ?? 0)} />
                      <Stat
                        label="Progress"
                        value={`${campaign.sent_count}/${campaign.total_recipients || "…"}`}
                      />
                    </dl>
                  )}
                </div>
              ) : null}

              <Separator />

              <div className="flex flex-col gap-2">
                {campaign.status === "draft" || campaign.status === "scheduled" ? (
                  <Can permission="campaigns.send">
                    <Button
                      className="justify-start"
                      disabled={busy !== null}
                      onClick={() =>
                        void run("launch", () => launchCampaignAction(campaign.id), "Campaign launched")
                      }
                    >
                      {busy === "launch" ? <Loader2 className="animate-spin" /> : <Play />}
                      Launch now
                    </Button>
                  </Can>
                ) : null}
                {campaign.status === "running" ? (
                  <Can permission="campaigns.send">
                    <Button
                      variant="outline"
                      className="justify-start"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(
                          "process",
                          () => processCampaignNowAction(campaign.id),
                          "Processed one batch",
                        )
                      }
                    >
                      {busy === "process" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      Process next batch now
                    </Button>
                  </Can>
                ) : null}
                {campaign.status === "scheduled" || campaign.status === "running" || campaign.status === "draft" ? (
                  <Can permission="campaigns.send">
                    <Button
                      variant="outline"
                      className="justify-start text-destructive hover:text-destructive"
                      disabled={busy !== null}
                      onClick={() =>
                        void run("cancel", () => cancelCampaignAction(campaign.id), "Campaign cancelled")
                      }
                    >
                      {busy === "cancel" ? <Loader2 className="animate-spin" /> : <XCircle />}
                      Cancel campaign
                    </Button>
                  </Can>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground">
                Tracking endpoints: open pixel <code>/api/track?e=open&c=…&r=…</code>, click
                redirect <code>?e=click&url=…</code>, conversion <code>?e=convert&total=…</code>.
              </p>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`font-semibold tabular-nums ${tone === "bad" ? "text-red-600 dark:text-red-400" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
