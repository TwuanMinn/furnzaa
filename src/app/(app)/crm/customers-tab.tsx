"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crown, ExternalLink, Loader2, Star, UsersRound } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/datatable/data-table";
import { useDataTable } from "@/lib/datatable/use-data-table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Can } from "@/lib/rbac/context";
import { badgeClass } from "@/lib/badges";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { overrideTierAction } from "@/lib/crm/actions";
import type { CrmCustomerRow, RankHistoryRow, SegmentRow, TierRow } from "@/lib/datasets/crm";
import type { FilterDef } from "@/lib/datatable/types";

export function TierBadge({
  tier,
}: {
  tier: { name: string; badge_color: string } | null;
}) {
  if (!tier) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeClass(tier.badge_color)}`}
    >
      <Crown className="size-3" aria-hidden />
      {tier.name}
    </span>
  );
}

export function CustomersTab({
  tiers,
  segments,
  currency,
  focusCustomerId,
}: {
  tiers: TierRow[];
  segments: SegmentRow[];
  currency: string;
  focusCustomerId: string | null;
}) {
  const table = useDataTable<CrmCustomerRow>({
    endpoint: "/api/crm/customers",
    defaultSort: { id: "lifetime_spend_cents", dir: "desc" },
  });
  const [detail, setDetail] = useState<CrmCustomerRow | null>(null);

  // Deep link (?customer= from tier-upgrade notifications): open the sheet.
  useEffect(() => {
    if (!focusCustomerId) return;
    const hit = table.rows.find((r) => r.id === focusCustomerId);
    if (hit) setDetail(hit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCustomerId, table.rows.length]);

  const columns: DataTableColumn<CrmCustomerRow>[] = [
    {
      id: "name",
      header: "Customer",
      sortable: true,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[r.email, r.region].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      ),
    },
    { id: "tier", header: "Tier", cell: (r) => <TierBadge tier={r.tier} /> },
    {
      id: "lifetime_spend_cents",
      header: "Lifetime spend",
      sortable: true,
      align: "right",
      cell: (r) => <span className="font-medium tabular-nums">{formatMoney(r.lifetime_spend_cents, currency)}</span>,
    },
    {
      id: "annual_spend_cents",
      header: "This year",
      sortable: true,
      align: "right",
      hideBelow: "lg",
      cell: (r) => <span className="text-muted-foreground tabular-nums">{formatMoney(r.annual_spend_cents, currency)}</span>,
    },
    {
      id: "order_count",
      header: "Orders",
      sortable: true,
      align: "right",
      hideBelow: "md",
      cell: (r) => <span className="tabular-nums">{r.order_count}</span>,
    },
    {
      id: "customer_score",
      header: "Score",
      sortable: true,
      align: "right",
      hideBelow: "lg",
      cell: (r) => <span className="text-muted-foreground tabular-nums">{Math.round(r.customer_score)}</span>,
    },
    {
      id: "last_purchase",
      header: "Last purchase",
      hideBelow: "lg",
      cell: (r) => (
        <span className="text-muted-foreground">
          {r.last_purchase_date ? formatDate(r.last_purchase_date) : "Never"}
        </span>
      ),
    },
  ];

  const filters: FilterDef[] = [
    {
      type: "select",
      id: "tier",
      label: "Tier",
      options: tiers.map((t) => ({ value: t.id, label: t.name })),
    },
    {
      type: "select",
      id: "segment",
      label: "Segment",
      options: segments.map((s) => ({ value: s.id, label: s.name })),
    },
    { type: "text", id: "region", label: "Region", placeholder: "Region…" },
    { type: "text", id: "spend_min", label: "Min spend", placeholder: "Min spend" },
    { type: "text", id: "orders_min", label: "Min orders", placeholder: "Min orders" },
    { type: "daterange", id: "last_purchase", label: "Last purchase" },
  ];

  return (
    <>
      <DataTable
        table={table}
        columns={columns}
        getRowId={(r) => r.id}
        filterDefs={filters}
        searchPlaceholder="Search name, email, phone…"
        exportDataset="crm-customers"
        onRowClick={setDetail}
        emptyIcon={UsersRound}
        emptyTitle="No customers match"
        emptyDescription="Adjust the filters or pick a different segment."
      />
      <CustomerSheet
        customer={detail}
        tiers={tiers}
        currency={currency}
        onOpenChange={(open) => !open && setDetail(null)}
        onChanged={table.refresh}
      />
    </>
  );
}

function CustomerSheet({
  customer,
  tiers,
  currency,
  onOpenChange,
  onChanged,
}: {
  customer: CrmCustomerRow | null;
  tiers: TierRow[];
  currency: string;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const [overrideTo, setOverrideTo] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const historyQuery = useQuery({
    queryKey: ["rank-history", customer?.id],
    enabled: !!customer,
    queryFn: async (): Promise<RankHistoryRow[]> => {
      const res = await fetch(`/api/crm/rank-history/${customer!.id}`);
      const body = (await res.json()) as { ok: boolean; data?: { history: RankHistoryRow[] } };
      return body.ok && body.data ? body.data.history : [];
    },
  });

  useEffect(() => {
    setOverrideTo("");
  }, [customer?.id]);

  async function applyOverride() {
    if (!customer || !overrideTo) return;
    setBusy(true);
    try {
      const result = await overrideTierAction(customer.id, overrideTo);
      if (result.ok) {
        toast.success("Tier updated (manual override, logged)");
        onChanged?.();
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!customer} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {customer ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-left">
                {customer.name}
                <TierBadge tier={customer.tier} />
              </SheetTitle>
              <SheetDescription className="text-left">
                {[customer.email, customer.phone, customer.region].filter(Boolean).join(" · ") || "No contact info"}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-6">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                <div>
                  <dt className="text-muted-foreground">Lifetime spend</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {formatMoney(customer.lifetime_spend_cents, currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">This year</dt>
                  <dd className="text-lg font-semibold tabular-nums">
                    {formatMoney(customer.annual_spend_cents, currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Orders</dt>
                  <dd className="tabular-nums">{customer.order_count}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Customer score</dt>
                  <dd className="tabular-nums">{Math.round(customer.customer_score)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last purchase</dt>
                  <dd>{customer.last_purchase_date ? formatDate(customer.last_purchase_date) : "Never"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Birthday</dt>
                  <dd>{customer.birthday ? formatDate(customer.birthday) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Feedback</dt>
                  <dd className="flex items-center gap-1 tabular-nums">
                    {customer.avg_rating != null ? (
                      <>
                        <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
                        {Number(customer.avg_rating).toFixed(1)}
                      </>
                    ) : (
                      "—"
                    )}
                    <span className="text-xs text-muted-foreground">({customer.feedback_count})</span>
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/orders/customers/${customer.id}`}>
                    <ExternalLink /> Full order history
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/feedback?f_customer=${customer.id}`}>
                    <Star /> Feedback
                  </Link>
                </Button>
              </div>

              <Can permission="crm.manage_tiers">
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="tier-override">Manual tier override</Label>
                  <div className="flex items-center gap-2">
                    <Select value={overrideTo || "__none__"} onValueChange={(v) => setOverrideTo(v === "__none__" ? "" : v)}>
                      <SelectTrigger id="tier-override" className="flex-1">
                        <SelectValue placeholder="Pick a tier…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Pick a tier…</SelectItem>
                        {tiers.map((t) => (
                          <SelectItem key={t.id} value={t.id} disabled={t.id === customer.tier?.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" disabled={!overrideTo || busy} onClick={() => void applyOverride()}>
                      {busy ? <Loader2 className="animate-spin" /> : null}
                      Apply
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Overrides are recorded in rank history and the activity log.
                  </p>
                </div>
              </Can>

              <Separator />

              <div>
                <h3 className="mb-2 text-sm font-medium">Rank history</h3>
                {historyQuery.isLoading ? (
                  <div className="space-y-1.5">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full rounded-md" />
                    ))}
                  </div>
                ) : (historyQuery.data?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No tier changes yet.</p>
                ) : (
                  <ol className="relative space-y-4 border-l border-border pl-4">
                    {historyQuery.data!.map((h) => (
                      <li key={h.id} className="relative">
                        <span
                          className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary ring-4 ring-background"
                          aria-hidden
                        />
                        <div className="flex flex-wrap items-center gap-1.5 text-sm">
                          <TierBadge tier={h.previous_tier} />
                          <span className="text-muted-foreground">→</span>
                          <TierBadge tier={h.new_tier} />
                          <span className="text-xs text-muted-foreground">
                            {h.reason === "manual" ? "manual" : "auto"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDateTime(h.created_at)}
                          {h.changed_by_user ? ` · by ${h.changed_by_user.full_name}` : ""}
                          {h.qualifying_snapshot?.lifetime_spend_cents != null
                            ? ` · at ${formatMoney(h.qualifying_snapshot.lifetime_spend_cents, currency)} lifetime`
                            : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
