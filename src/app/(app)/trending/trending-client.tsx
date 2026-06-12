"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowBigUp,
  ExternalLink,
  Flame,
  LayoutGrid,
  Loader2,
  MoreHorizontal,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  Rows3,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { DataTable, type DataTableColumn } from "@/components/datatable/data-table";
import { DataTableToolbar } from "@/components/datatable/data-table-toolbar";
import { useDataTable } from "@/lib/datatable/use-data-table";
import { EmptyState } from "@/components/states";
import { formatDate, formatMinutes } from "@/lib/format";
import {
  deleteTrendAction,
  promoteTrendAction,
  setTrendStatusAction,
  toggleTrendVoteAction,
} from "@/lib/trends/actions";
import type { TrendListRow } from "@/lib/datasets/trends";
import type { FilterDef } from "@/lib/datatable/types";
import { TrendDialog } from "./trend-dialog";
import { TrendStatusBadge, marginInfo, type TrendConfigProps } from "./trend-bits";

export function TrendingClient({
  config,
  materials,
  perGramCostCents,
  canCreate,
  canManage,
  canPromote,
}: {
  config: TrendConfigProps;
  materials: { key: string; label: string; costPerGramCents: number }[];
  perGramCostCents: number;
  canCreate: boolean;
  canManage: boolean;
  canPromote: boolean;
}) {
  const reduce = useReducedMotion();
  const table = useDataTable<TrendListRow>({
    endpoint: "/api/trends",
    defaultSort: { id: "created_at", dir: "desc" },
  });

  const [view, setView] = useState<"grid" | "table">("grid");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TrendListRow | null>(null);
  const [promoting, setPromoting] = useState<TrendListRow | null>(null);
  const [deleting, setDeleting] = useState<TrendListRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [voteBusy, setVoteBusy] = useState<string | null>(null);

  async function vote(row: TrendListRow) {
    setVoteBusy(row.id);
    try {
      const res = await toggleTrendVoteAction(row.id);
      if (res.ok) table.refresh();
      else toast.error(res.error);
    } finally {
      setVoteBusy(null);
    }
  }

  async function changeStatus(row: TrendListRow, statusKey: string) {
    const res = await setTrendStatusAction(row.id, statusKey);
    if (res.ok) {
      toast.success("Status updated");
      table.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function confirmPromote() {
    if (!promoting) return;
    setBusy(true);
    try {
      const res = await promoteTrendAction(promoting.id);
      if (res.ok) {
        toast.success(
          res.data.already
            ? "Already promoted — linked to the existing product"
            : `Promoted to product ${res.data.sku}`,
        );
        table.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusy(false);
      setPromoting(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await deleteTrendAction(deleting.id);
      if (res.ok) {
        toast.success("Trend entry removed");
        table.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  function rowMenu(row: TrendListRow) {
    if (!canManage && !canPromote) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${row.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {canManage ? (
            <DropdownMenuItem
              onSelect={() => {
                setEditing(row);
                setDialogOpen(true);
              }}
            >
              <Pencil /> Edit
            </DropdownMenuItem>
          ) : null}
          {canPromote ? (
            <DropdownMenuItem disabled={!!row.promoted_product_id} onSelect={() => setPromoting(row)}>
              <PackageCheck /> {row.promoted_product_id ? "Already promoted" : "Promote to product"}
            </DropdownMenuItem>
          ) : null}
          {canManage ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {config.statuses
                .filter((s) => s.key !== row.trend_status)
                .map((s) => (
                  <DropdownMenuItem key={s.key} onSelect={() => void changeStatus(row, s.key)}>
                    {s.label}
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row)}>
                <Trash2 /> Remove
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function VoteButton({ row }: { row: TrendListRow }) {
    return (
      <Button
        variant={row.my_vote ? "secondary" : "outline"}
        size="sm"
        className="h-7 gap-1 px-2 tabular-nums"
        disabled={voteBusy === row.id}
        aria-pressed={row.my_vote}
        aria-label={row.my_vote ? `Remove upvote from ${row.name}` : `Upvote ${row.name}`}
        onClick={(e) => {
          e.stopPropagation();
          void vote(row);
        }}
      >
        {voteBusy === row.id ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <ArrowBigUp className={cn("size-4", row.my_vote && "fill-current")} />
        )}
        {row.votes_count}
      </Button>
    );
  }

  const filters: FilterDef[] = [
    {
      type: "select",
      id: "status",
      label: "Status",
      options: config.statuses.map((s) => ({ value: s.key, label: s.label })),
    },
    {
      type: "select",
      id: "platform",
      label: "Platform",
      options: config.platforms.map((p) => ({ value: p, label: p })),
    },
    {
      type: "select",
      id: "category",
      label: "Category",
      options: config.categories.map((c) => ({ value: c.id, label: c.name })),
    },
    { type: "text", id: "tag", label: "Tag", placeholder: "Tag…" },
    { type: "daterange", id: "created_at", label: "Added between" },
  ];

  const columns: DataTableColumn<TrendListRow>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
            {r.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.images[0]} alt="" className="size-full object-cover" />
            ) : (
              <Flame className="size-4 text-muted-foreground" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{r.name}</p>
            <p className="truncate text-xs text-muted-foreground">{r.source_platform}</p>
          </div>
        </div>
      ),
    },
    {
      id: "category",
      header: "Category",
      hideBelow: "lg",
      cell: (r) => <span className="text-muted-foreground">{r.product_categories?.name ?? "—"}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => <TrendStatusBadge statusKey={r.trend_status} statuses={config.statuses} />,
    },
    { id: "votes_count", header: "Votes", sortable: true, cell: (r) => <VoteButton row={r} /> },
    {
      id: "popularity_score",
      header: "Popularity",
      sortable: true,
      hideBelow: "md",
      cell: (r) => <span className="tabular-nums text-muted-foreground">{r.popularity_score}</span>,
    },
    {
      id: "margin",
      header: "Est. margin",
      hideBelow: "md",
      cell: (r) => {
        const m = marginInfo(r.est_selling_cents, r.est_cost_cents, config.targetMarginPct);
        return m ? (
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", m.className)}>
            {m.label}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "created_at",
      header: "Added",
      sortable: true,
      hideBelow: "lg",
      cell: (r) => <span className="text-muted-foreground">{formatDate(r.created_at)}</span>,
    },
    { id: "menu", header: "", cell: (r) => rowMenu(r) },
  ];

  const viewToggle = (
    <div className="flex items-center rounded-lg border border-border p-0.5">
      {(
        [
          { id: "grid", label: "Cards", icon: LayoutGrid },
          { id: "table", label: "Table", icon: Rows3 },
        ] as const
      ).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setView(id)}
          aria-pressed={view === id}
          className={cn(
            "relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
            view === id ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {view === id ? (
            <motion.span
              layoutId="trend-view-pill"
              className="absolute inset-0 rounded-md bg-muted"
              transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.4 }}
            />
          ) : null}
          <Icon className="relative size-4" aria-hidden />
          <span className="relative hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );

  const addButton = canCreate ? (
    <Button
      size="sm"
      onClick={() => {
        setEditing(null);
        setDialogOpen(true);
      }}
    >
      <Plus /> Add trend
    </Button>
  ) : null;

  return (
    <div className="space-y-4">
      {view === "table" ? (
        <DataTable
          table={table}
          columns={columns}
          getRowId={(r) => r.id}
          filterDefs={filters}
          searchPlaceholder="Search trend names…"
          exportDataset="trends"
          importDataset={canManage ? "trends" : undefined}
          emptyIcon={Flame}
          emptyTitle="No trending products yet"
          emptyDescription="Add ideas the team spots on MakerWorld, TikTok, Etsy and friends."
          toolbar={
            <div className="flex items-center gap-2">
              {viewToggle}
              {addButton}
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <DataTableToolbar
            searchValue={table.search}
            onSearchChange={table.onSearchChange}
            searchPlaceholder="Search trend names…"
            filterDefs={filters}
            filterValues={table.filters}
            onFilterChange={table.setFilter}
            onClearFilters={table.clearFilters}
            exportDataset="trends"
            importDataset={canManage ? "trends" : undefined}
            exportParams={table.exportParams}
            onImported={table.refresh}
          >
            {viewToggle}
            {addButton}
          </DataTableToolbar>

          {table.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="h-64 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : table.rows.length === 0 ? (
            <EmptyState
              icon={Flame}
              title="No trending products yet"
              description="Add ideas the team spots on MakerWorld, TikTok, Etsy and friends."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <AnimatePresence initial={false}>
                {table.rows.map((r, i) => {
                  const m = marginInfo(r.est_selling_cents, r.est_cost_cents, config.targetMarginPct);
                  return (
                    <motion.article
                      key={r.id}
                      layout={!reduce}
                      initial={reduce ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? undefined : { opacity: 0 }}
                      transition={{ duration: 0.22, delay: reduce ? 0 : Math.min(i * 0.04, 0.4), ease: "easeOut" }}
                      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                    >
                      <div className="relative aspect-[4/3] bg-muted">
                        {r.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.images[0]} alt="" className="size-full object-cover" />
                        ) : (
                          <div className="flex size-full items-center justify-center">
                            <Flame className="size-8 text-muted-foreground/50" aria-hidden />
                          </div>
                        )}
                        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
                          {r.source_platform}
                        </span>
                        {r.promoted_product_id ? (
                          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-2 py-0.5 text-xs font-medium text-white">
                            <Package className="size-3" aria-hidden /> In catalog
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-1 flex-col gap-2 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="line-clamp-2 text-sm font-medium leading-snug">{r.name}</h3>
                          {rowMenu(r)}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <TrendStatusBadge statusKey={r.trend_status} statuses={config.statuses} />
                          {m ? (
                            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", m.className)}>
                              {m.label}
                            </span>
                          ) : null}
                          {r.est_print_minutes ? (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {formatMinutes(r.est_print_minutes)}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-auto flex items-center justify-between pt-1">
                          <VoteButton row={r} />
                          {r.source_url ? (
                            <a
                              href={r.source_url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Source <ExternalLink className="size-3" aria-hidden />
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {table.rows.length === 0 ? "No entries" : `Page ${table.page}`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!table.hasPrev} onClick={table.prevPage}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={!table.hasNext} onClick={table.nextPage}>
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      <TrendDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        trend={editing}
        config={config}
        materials={materials}
        perGramCostCents={perGramCostCents}
        onSaved={table.refresh}
      />

      {/* Promote: idempotent server-side; confirm because it creates a product. */}
      <AlertDialog open={promoting !== null} onOpenChange={(o) => !o && !busy && setPromoting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote “{promoting?.name}” to a product?</AlertDialogTitle>
            <AlertDialogDescription>
              Creates a real catalog product with the estimated cost/price and the cover image,
              and moves this entry to In Production. Promoting twice never duplicates the product.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void confirmPromote();
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Promote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && !busy && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The entry is soft-deleted and disappears from the catalog; votes and history stay
              in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
