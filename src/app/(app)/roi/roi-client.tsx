"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, FolderKanban, Layers, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { badgeClass } from "@/lib/badges";
import { formatDate, formatMoney, toDateKey } from "@/lib/format";
import { breakEvenMeta, signTone, type Tone } from "@/lib/roi/formulas";
import type { InvestmentListRow, InvestmentMonthlyRow, RoiBreakdown, RoiData } from "@/lib/roi/types";
import { useDataTable } from "@/lib/datatable/use-data-table";
import { DataTable, type DataTableColumn } from "@/components/datatable/data-table";
import type { FilterDef } from "@/lib/datatable/types";
import { RoiSummary } from "./roi-summary";
import { RoiCharts } from "./roi-charts";
import { CashflowDialog, InvestmentDialog, type ProductOption, type RefOption } from "./roi-dialogs";

const PRESETS = [
  { label: "All", days: null },
  { label: "1y", days: 365 },
  { label: "6m", days: 182 },
  { label: "3m", days: 90 },
] as const;

const TONE_TEXT: Record<Tone, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  low: "text-amber-600 dark:text-amber-400",
  loss: "text-red-600 dark:text-red-400",
  muted: "text-foreground",
};
const TONE_BADGE: Record<Tone, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-400",
  low: "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400",
  loss: "bg-red-500/10 text-red-700 ring-red-500/25 dark:text-red-400",
  muted: "bg-muted text-muted-foreground ring-border",
};

function BreakEvenPill({ status }: { status: string }) {
  const meta = breakEvenMeta(status);
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONE_BADGE[meta.tone])}>
      {meta.label}
    </span>
  );
}

const money = (cents: number, currency: string) => formatMoney(cents, currency);
const pct = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;

export function RoiClient({
  currency,
  categories,
  projects,
  products,
  canCreate,
  canDelete: _canDelete,
}: {
  currency: string;
  categories: RefOption[];
  projects: RefOption[];
  products: ProductOption[];
  canCreate: boolean;
  canDelete: boolean;
}) {
  const reduce = useReducedMotion();
  const queryClient = useQueryClient();
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [activePreset, setActivePreset] = useState<string>("All");
  const [newOpen, setNewOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);

  const dash = useQuery({
    queryKey: ["roi", scopeId, from, to],
    staleTime: 60_000,
    queryFn: async (): Promise<RoiData> => {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (scopeId) p.set("investment", scopeId);
      const res = await fetch(`/api/roi?${p}`);
      const body = (await res.json()) as { ok: boolean; data?: RoiData; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Failed to load");
      return body.data;
    },
  });

  const data = dash.data;
  const chartKey = `${scopeId ?? "all"}-${from}-${to}`;

  function applyPreset(p: (typeof PRESETS)[number]) {
    setActivePreset(p.label);
    setFrom(p.days ? toDateKey(p.days) : "");
    setTo(p.days ? toDateKey(0) : "");
  }

  function onSaved() {
    void queryClient.invalidateQueries({ queryKey: ["roi"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/roi/investments"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/roi/monthly"] });
  }

  return (
    <div className="space-y-6">
      {/* ── Header: scope + date range ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {scopeId ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setScopeId(null)} className="-ml-2">
                <ArrowLeft /> All investments
              </Button>
              <span className="truncate text-sm font-medium">
                {data?.investmentName ?? "Investment"}
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Layers className="size-4" aria-hidden /> Portfolio
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  activePreset === p.label ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {canCreate && !scopeId ? (
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus /> New investment
            </Button>
          ) : null}
          {canCreate && scopeId ? (
            <Button size="sm" onClick={() => setEntryOpen(true)}>
              <Plus /> Add entry
            </Button>
          ) : null}
        </div>
      </div>

      {dash.isLoading ? (
        <DashboardSkeleton />
      ) : dash.error ? (
        <div className="rounded-lg border border-border">
          <ErrorState description={dash.error instanceof Error ? dash.error.message : "Failed to load"} />
        </div>
      ) : data ? (
        <AnimatePresence mode="wait">
          <motion.div
            key={chartKey}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="space-y-6"
          >
            <RoiSummary data={data} currency={currency} />
            <RoiCharts data={data} currency={currency} chartKey={chartKey} />

            {data.scope === "portfolio" ? (
              <>
                <Breakdowns categories={data.categories} projects={data.projects} currency={currency} />
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">All investments</h3>
                  <InvestmentsTable
                    categories={categories}
                    projects={projects}
                    currency={currency}
                    onSelect={setScopeId}
                  />
                </section>
              </>
            ) : (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Monthly recovery</h3>
                <MonthlyTable key={scopeId} investmentId={scopeId!} currency={currency} />
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      ) : null}

      <InvestmentDialog open={newOpen} onOpenChange={setNewOpen} categories={categories} projects={projects} products={products} onSaved={onSaved} />
      {scopeId ? (
        <CashflowDialog
          open={entryOpen}
          onOpenChange={setEntryOpen}
          investmentId={scopeId}
          investmentName={data?.investmentName ?? "investment"}
          currency={currency}
          onSaved={onSaved}
        />
      ) : null}
    </div>
  );
}

// ── Category / project breakdowns (portfolio) ──────────────────────────────────

function Breakdowns({
  categories,
  projects,
  currency,
}: {
  categories: RoiBreakdown[];
  projects: RoiBreakdown[];
  currency: string;
}) {
  if (categories.length === 0 && projects.length === 0) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BreakdownCard title="By category" icon={Layers} rows={categories} currency={currency} />
      <BreakdownCard title="By project / business" icon={FolderKanban} rows={projects} currency={currency} />
    </div>
  );
}

function BreakdownCard({
  title,
  icon: Icon,
  rows,
  currency,
}: {
  title: string;
  icon: typeof Layers;
  rows: RoiBreakdown[];
  currency: string;
}) {
  const reduce = useReducedMotion();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-base">
          <Icon className="size-4 text-muted-foreground" aria-hidden /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No investments yet.</p>
        ) : (
          rows.map((r, i) => (
            <div key={r.id ?? "none"} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{r.name}</span>
                <span className={cn("shrink-0 tabular-nums", TONE_TEXT[signTone(r.roiPct)])}>{pct(r.roiPct)} ROI</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400"
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${Math.max(0, Math.min(100, r.recoveryPct))}%` }}
                  transition={{ duration: 0.5, ease: "easeOut", delay: reduce ? 0 : i * 0.05 }}
                />
              </div>
              <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                <span>{money(r.totalCapitalCents, currency)} invested · {r.investmentCount} item{r.investmentCount === 1 ? "" : "s"}</span>
                <span>{pct(r.recoveryPct)} recovered</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ── Investments table ──────────────────────────────────────────────────────────

function InvestmentsTable({
  categories,
  projects,
  currency,
  onSelect,
}: {
  categories: RefOption[];
  projects: RefOption[];
  currency: string;
  onSelect: (id: string) => void;
}) {
  const table = useDataTable<InvestmentListRow>({
    endpoint: "/api/roi/investments",
    defaultSort: { id: "created_at", dir: "desc" },
  });

  const filterDefs: FilterDef[] = useMemo(
    () => [
      { type: "select", id: "category", label: "Category", options: categories.map((c) => ({ value: c.id, label: c.name })) },
      { type: "select", id: "project", label: "Project", options: projects.map((p) => ({ value: p.id, label: p.name })) },
      {
        type: "select",
        id: "break_even_status",
        label: "Status",
        options: [
          { value: "pending", label: "Pending" },
          { value: "in_progress", label: "In progress" },
          { value: "recovered", label: "Recovered" },
          { value: "underperforming", label: "Underperforming" },
        ],
      },
    ],
    [categories, projects],
  );

  const columns: DataTableColumn<InvestmentListRow>[] = [
    { id: "name", header: "Name", sortable: true, cell: (r) => <span className="font-medium">{r.name}</span> },
    {
      id: "category",
      header: "Category",
      hideBelow: "md",
      cell: (r) =>
        r.category_name ? (
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeClass(r.category_color ?? "slate"))}>
            {r.category_name}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "project",
      header: "Project",
      hideBelow: "lg",
      cell: (r) =>
        r.project_name ? (
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeClass(r.project_color ?? "slate"))}>
            {r.project_name}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { id: "total_capital_cents", header: "Invested", sortable: true, align: "right", cell: (r) => <span className="tabular-nums">{money(r.total_capital_cents, currency)}</span> },
    { id: "recovered", header: "Recovered", align: "right", hideBelow: "sm", cell: (r) => <span className={cn("tabular-nums", TONE_TEXT[signTone(r.recovered_cents)])}>{money(r.recovered_cents, currency)}</span> },
    { id: "roi_pct", header: "ROI %", sortable: true, align: "right", cell: (r) => <span className={cn("font-medium tabular-nums", TONE_TEXT[signTone(r.roi_pct)])}>{pct(r.roi_pct)}</span> },
    { id: "recovery_pct", header: "Recovery %", sortable: true, align: "right", hideBelow: "sm", cell: (r) => <span className="tabular-nums">{pct(r.recovery_pct)}</span> },
    { id: "break_even_status", header: "Status", cell: (r) => <BreakEvenPill status={r.break_even_status} /> },
  ];

  return (
    <DataTable
      table={table}
      columns={columns}
      getRowId={(r) => r.id}
      filterDefs={filterDefs}
      searchPlaceholder="Search investments…"
      exportDataset="roi-investments"
      onRowClick={(r) => onSelect(r.id)}
      emptyTitle="No investments yet"
      emptyDescription="Create your first investment to start tracking recovery and ROI."
      emptyIcon={Layers}
    />
  );
}

// ── Monthly recovery table (single investment) ─────────────────────────────────

function MonthlyTable({ investmentId, currency }: { investmentId: string; currency: string }) {
  const table = useDataTable<InvestmentMonthlyRow>({
    endpoint: "/api/roi/monthly",
    defaultSort: { id: "period_month", dir: "desc" },
    initialFilters: { investment: investmentId },
  });

  const columns: DataTableColumn<InvestmentMonthlyRow>[] = [
    { id: "period_month", header: "Month", sortable: true, cell: (r) => <span className="font-medium">{formatDate(r.period_month, "MMM yyyy")}</span> },
    { id: "capital_cents", header: "Invested", align: "right", cell: (r) => <span className="tabular-nums">{money(r.capital_cents, currency)}</span> },
    { id: "revenue_cents", header: "Revenue", align: "right", hideBelow: "sm", cell: (r) => <span className="tabular-nums">{money(r.revenue_cents, currency)}</span> },
    { id: "profit_cents", header: "Profit", align: "right", cell: (r) => <span className={cn("font-medium tabular-nums", TONE_TEXT[signTone(r.profit_cents)])}>{money(r.profit_cents, currency)}</span> },
    { id: "cumulative_profit_cents", header: "Cumulative profit", align: "right", hideBelow: "md", cell: (r) => <span className="tabular-nums">{money(r.cumulative_profit_cents, currency)}</span> },
    { id: "remaining_recovery_cents", header: "Remaining", align: "right", cell: (r) => (
      <span className={cn("tabular-nums", r.remaining_recovery_cents === 0 ? "font-semibold text-emerald-600 dark:text-emerald-400" : "")}>
        {money(r.remaining_recovery_cents, currency)}
      </span>
    ) },
  ];

  return (
    <DataTable
      table={table}
      columns={columns}
      getRowId={(r) => r.id}
      searchPlaceholder="Search months…"
      exportDataset="roi-monthly"
      emptyTitle="No monthly activity yet"
      emptyDescription="Add capital and revenue entries to build the monthly recovery view."
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-16 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
