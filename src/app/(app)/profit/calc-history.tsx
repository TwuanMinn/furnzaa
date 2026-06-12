"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format as formatDateFns } from "date-fns";
import {
  ArrowLeftRight,
  Check,
  Download,
  FileText,
  History,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatAmount } from "@/lib/format";
import {
  statusAgainstTarget,
  summarizeHistory,
  type SavedCalculation,
} from "@/lib/profit/calculator";
import { SectionLabel } from "./calc-form";
import { STATUS_CLASSES } from "./calc-result";
import type { CalcMaterial } from "./cost-calculator";

// ─── History panel ────────────────────────────────────────────────────────────

export function HistoryPanel({
  history,
  loading,
  currency,
  currentTarget,
  dateFormat,
  timeFormat,
  materials,
  materialLabel,
  exporting,
  onExport,
  onClearAll,
  onDelete,
  onReuse,
}: {
  history: SavedCalculation[];
  loading: boolean;
  currency: string;
  currentTarget: number;
  dateFormat: string;
  timeFormat: string;
  materials: CalcMaterial[];
  materialLabel: (key: string) => string;
  exporting: "csv" | "pdf" | null;
  onExport: (format: "csv" | "pdf") => void;
  onClearAll: () => void;
  onDelete: (id: string) => void;
  onReuse: (entry: SavedCalculation) => void;
}) {
  const reduce = useReducedMotion();
  const money = (v: number) => formatAmount(v, currency);
  const summary = useMemo(() => summarizeHistory(history), [history]);

  // ── Search & filter state (#6) ────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [materialFilter, setMaterialFilter] = useState("__all__");

  // ── Compare mode state (#4) ───────────────────────────────
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());

  const filteredHistory = useMemo(() => {
    let rows = history;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter((r) => (r.name || "").toLowerCase().includes(q));
    }
    if (materialFilter !== "__all__") {
      rows = rows.filter((r) => r.material === materialFilter);
    }
    return rows;
  }, [history, searchQuery, materialFilter]);

  function toggleCompareId(id: string) {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 2) {
        next.add(id);
      }
      return next;
    });
  }

  function exitCompare() {
    setCompareMode(false);
    setCompareIds(new Set());
  }

  // #15: virtualization ref (for large lists)
  const listRef = useRef<HTMLDivElement>(null);

  // ── Loading state ────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────
  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <History className="mx-auto size-8 text-muted-foreground/60" aria-hidden />
        <p className="mt-3 text-sm font-medium">No saved calculations yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Run a calculation and hit &ldquo;Save to history&rdquo; — your analytics will appear here.
        </p>
      </div>
    );
  }

  const maxAbsProfit = Math.max(
    ...summary.topByProfit.map((r) => Math.abs(Number(r.profit))),
    1,
  );

  // Compare entries (when exactly 2 selected)
  const compareEntries =
    compareMode && compareIds.size === 2
      ? [...compareIds].map((id) => history.find((h) => h.id === id)!).filter(Boolean)
      : [];

  return (
    <div className="space-y-4">
      {/* ── ANALYTICS ────────────────────────────────────────────── */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <SectionLabel>Analytics</SectionLabel>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {[
            {
              label: "Total profit",
              value: money(summary.totalProfit),
              tone: summary.totalProfit >= 0 ? "ok" : "loss",
            },
            { label: "Total revenue", value: money(summary.totalRevenue) },
            { label: "Overall margin", value: `${summary.overallMargin.toFixed(1)}%` },
            { label: "Total filament", value: `${summary.totalFilament.toFixed(1)}g` },
            { label: "Total print time", value: `${summary.totalHours.toFixed(1)}h` },
          ].map((tile) => (
            <div
              key={tile.label}
              className={cn(
                "rounded-lg border border-border p-3",
                tile.tone
                  ? STATUS_CLASSES[tile.tone as keyof typeof STATUS_CLASSES]
                  : "bg-muted/30",
              )}
            >
              <p className={cn("text-xs", tile.tone ? "opacity-80" : "text-muted-foreground")}>
                {tile.label}
              </p>
              <p className="mt-0.5 truncate font-semibold tabular-nums">{tile.value}</p>
            </div>
          ))}
        </div>

        {summary.best ? (
          <dl className="space-y-1.5 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Best product</dt>
              <dd className="text-right">
                <span className="font-medium">
                  {summary.best.name || "Unnamed product"}
                </span>{" "}
                <span className="tabular-nums">
                  · {money(Number(summary.best.profit))} ·{" "}
                  {Number(summary.best.margin_percent).toFixed(1)}%
                </span>
              </dd>
            </div>
            {summary.worst ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Worst product</dt>
                <dd className="text-right">
                  <span className="font-medium">
                    {summary.worst.name || "Unnamed product"}
                  </span>{" "}
                  <span className="tabular-nums">
                    · {money(Number(summary.worst.profit))} ·{" "}
                    {Number(summary.worst.margin_percent).toFixed(1)}%
                  </span>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {/* Top-5 profit — plain CSS bars (mint positive, red negative). */}
        <div className="space-y-1.5">
          {summary.topByProfit.map((r) => {
            const profit = Number(r.profit);
            const width = Math.max((Math.abs(profit) / maxAbsProfit) * 100, 2);
            return (
              <div
                key={r.id}
                className="grid grid-cols-[8rem_1fr_auto] items-center gap-2 text-xs"
              >
                <span className="truncate text-muted-foreground">
                  {r.name || "Unnamed product"}
                </span>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted/50">
                  <motion.div
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${width}%` }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className={cn(
                      "h-full rounded-full",
                      profit >= 0
                        ? "bg-emerald-500/80 dark:bg-emerald-400/70"
                        : "bg-red-500/80 dark:bg-red-400/70",
                    )}
                  />
                </div>
                <span className="tabular-nums">{money(profit)}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Search, filter & toolbar ─────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {filteredHistory.length === history.length
              ? `${history.length} saved calculation${history.length === 1 ? "" : "s"}`
              : `${filteredHistory.length} of ${history.length} calculation${history.length === 1 ? "" : "s"}`}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={compareMode ? "default" : "outline"}
              onClick={() => (compareMode ? exitCompare() : setCompareMode(true))}
            >
              {compareMode ? (
                <>
                  <X aria-hidden /> Done
                </>
              ) : (
                <>
                  <ArrowLeftRight aria-hidden /> Compare
                </>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={exporting !== null}>
                  {exporting ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Download aria-hidden />
                  )}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onExport("csv")}>
                  <Download aria-hidden />
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExport("pdf")}>
                  <FileText aria-hidden />
                  Export as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" onClick={onClearAll}>
              <Trash2 aria-hidden /> Clear all
            </Button>
          </div>
        </div>

        {/* Search & material filter */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by product name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-9"
            />
          </div>
          <Select value={materialFilter} onValueChange={setMaterialFilter}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="All materials" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All materials</SelectItem>
              {materials.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Compare table (when 2 selected) ──────────────────── */}
      {compareEntries.length === 2 ? (
        <CompareTable
          entries={compareEntries as [SavedCalculation, SavedCalculation]}
          money={money}
          materialLabel={materialLabel}
        />
      ) : compareMode ? (
        <p className="text-center text-sm text-muted-foreground">
          Select {2 - compareIds.size} more calculation{compareIds.size === 1 ? "" : "s"} to
          compare.
        </p>
      ) : null}

      {filteredHistory.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No calculations match your filters.</p>
        </div>
      ) : filteredHistory.length > 50 ? (
        // #15: Virtualized list for large histories
        <VirtualizedHistoryList
          items={filteredHistory}
          listRef={listRef}
          currentTarget={currentTarget}
          money={money}
          materialLabel={materialLabel}
          dateFormat={dateFormat}
          timeFormat={timeFormat}
          compareMode={compareMode}
          compareIds={compareIds}
          onToggleCompare={toggleCompareId}
          onReuse={onReuse}
          onDelete={onDelete}
        />
      ) : (
        <ul className="space-y-2.5" role="list" aria-label="Saved calculations">
          <AnimatePresence initial={false}>
            {filteredHistory.map((r) => {
              const status = statusAgainstTarget(
                Number(r.profit),
                Number(r.margin_percent),
                currentTarget,
              );
              const when = new Date(r.created_at);
              const isSelected = compareIds.has(r.id);
              return (
                <motion.li
                  key={r.id}
                  layout={reduce ? false : "position"}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className={cn(
                    "rounded-xl border border-border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    compareMode && isSelected && "ring-2 ring-primary",
                  )}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    const li = e.currentTarget;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      (li.nextElementSibling as HTMLElement | null)?.focus();
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      (li.previousElementSibling as HTMLElement | null)?.focus();
                    } else if (e.key === "Delete" || e.key === "Backspace") {
                      e.preventDefault();
                      onDelete(r.id);
                    } else if (e.key === "Enter" && compareMode) {
                      e.preventDefault();
                      toggleCompareId(r.id);
                    }
                  }}
                >
                  <HistoryCardContent
                    r={r}
                    status={status}
                    when={when}
                    isSelected={isSelected}
                    compareMode={compareMode}
                    materialLabel={materialLabel}
                    dateFormat={dateFormat}
                    timeFormat={timeFormat}
                    money={money}
                    onToggleCompare={toggleCompareId}
                    onReuse={onReuse}
                    onDelete={onDelete}
                  />
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

// ─── Compare table ────────────────────────────────────────────────────────────

function CompareTable({
  entries,
  money,
  materialLabel,
}: {
  entries: [SavedCalculation, SavedCalculation];
  money: (v: number) => string;
  materialLabel: (key: string) => string;
}) {
  const [a, b] = entries;

  const rows: { label: string; a: string; b: string; diff?: string }[] = [
    { label: "Material", a: materialLabel(a.material), b: materialLabel(b.material) },
    {
      label: "Filament cost (₫/kg)",
      a: money(Number(a.filament_cost_per_kg)),
      b: money(Number(b.filament_cost_per_kg)),
    },
    {
      label: "Filament used (g)",
      a: `${Number(a.filament_used_grams)}g`,
      b: `${Number(b.filament_used_grams)}g`,
    },
    {
      label: "Waste %",
      a: `${Number(a.waste_percent)}%`,
      b: `${Number(b.waste_percent)}%`,
    },
    {
      label: "Print time (h)",
      a: `${Number(a.print_time_hours)}h`,
      b: `${Number(b.print_time_hours)}h`,
    },
    {
      label: "Total cost",
      a: money(Number(a.total_cost)),
      b: money(Number(b.total_cost)),
      diff: money(Number(b.total_cost) - Number(a.total_cost)),
    },
    {
      label: "Selling price",
      a: money(Number(a.selling_price)),
      b: money(Number(b.selling_price)),
      diff: money(Number(b.selling_price) - Number(a.selling_price)),
    },
    {
      label: "Profit",
      a: money(Number(a.profit)),
      b: money(Number(b.profit)),
      diff: money(Number(b.profit) - Number(a.profit)),
    },
    {
      label: "Margin",
      a: `${Number(a.margin_percent).toFixed(1)}%`,
      b: `${Number(b.margin_percent).toFixed(1)}%`,
      diff: `${(Number(b.margin_percent) - Number(a.margin_percent)).toFixed(1)}pp`,
    },
    {
      label: "ROI",
      a: `${Number(a.roi_percent).toFixed(1)}%`,
      b: `${Number(b.roi_percent).toFixed(1)}%`,
      diff: `${(Number(b.roi_percent) - Number(a.roi_percent)).toFixed(1)}pp`,
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-left">
            <th className="px-3 py-2 font-medium text-muted-foreground" />
            <th className="px-3 py-2 font-medium">
              {a.name || "Unnamed product"}
            </th>
            <th className="px-3 py-2 font-medium">
              {b.name || "Unnamed product"}
            </th>
            <th className="px-3 py-2 font-medium text-muted-foreground">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b last:border-0">
              <td className="px-3 py-1.5 text-muted-foreground">{row.label}</td>
              <td className="px-3 py-1.5 tabular-nums">{row.a}</td>
              <td className="px-3 py-1.5 tabular-nums">{row.b}</td>
              <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                {row.diff ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ─── Extracted card content (shared by animated & virtualized list) ───────────

function HistoryCardContent({
  r,
  status,
  when,
  isSelected,
  compareMode,
  materialLabel,
  dateFormat,
  timeFormat,
  money,
  onToggleCompare,
  onReuse,
  onDelete,
}: {
  r: SavedCalculation;
  status: import("@/lib/profit/calculator").MarginStatus;
  when: Date;
  isSelected: boolean;
  compareMode: boolean;
  materialLabel: (key: string) => string;
  dateFormat: string;
  timeFormat: string;
  money: (v: number) => string;
  onToggleCompare: (id: string) => void;
  onReuse: (entry: SavedCalculation) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "min-w-0",
            compareMode && "flex cursor-pointer items-center gap-2",
          )}
          onClick={compareMode ? () => onToggleCompare(r.id) : undefined}
        >
          {compareMode ? (
            <div
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded border",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border",
              )}
            >
              {isSelected ? <Check className="size-3" /> : null}
            </div>
          ) : null}
          <div className="min-w-0">
            <p className="truncate font-medium">
              {r.name || "Unnamed product"}
            </p>
            <p className="text-xs text-muted-foreground">
              {materialLabel(r.material)} ·{" "}
              {formatDateFns(when, timeFormat)}{" "}
              {formatDateFns(when, dateFormat)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Re-use ${r.name || "calculation"}`}
            onClick={() => onReuse(r)}
          >
            <RotateCcw className="text-muted-foreground" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Delete ${r.name || "calculation"}`}
            onClick={() => onDelete(r.id)}
          >
            <Trash2 className="text-muted-foreground" />
          </Button>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {[
          { label: "Total cost", value: money(Number(r.total_cost)) },
          { label: "Sell price", value: money(Number(r.selling_price)) },
          { label: "Profit", value: money(Number(r.profit)), tone: status },
          {
            label: "Margin",
            value: `${Number(r.margin_percent).toFixed(1)}%`,
            tone: status,
          },
        ].map((chip) => (
          <div
            key={chip.label}
            className={cn(
              "rounded-md px-2 py-1 text-xs ring-1 ring-border ring-inset",
              chip.tone ? STATUS_CLASSES[chip.tone] : "bg-muted/30",
            )}
          >
            <span className={cn(chip.tone ? "opacity-80" : "text-muted-foreground")}>
              {chip.label}:
            </span>{" "}
            <span className="font-medium tabular-nums">{chip.value}</span>
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {Number(r.filament_with_waste_g).toFixed(0)}g{" "}
        {materialLabel(r.material)} ·{" "}
        {Number(r.print_time_hours)}h print ·{" "}
        {Number(r.roi_percent).toFixed(1)}% ROI
      </p>
    </>
  );
}

// ─── Virtualized list for large histories (#15) ──────────────────────────────

function VirtualizedHistoryList({
  items,
  listRef,
  currentTarget,
  money,
  materialLabel,
  dateFormat,
  timeFormat,
  compareMode,
  compareIds,
  onToggleCompare,
  onReuse,
  onDelete,
}: {
  items: SavedCalculation[];
  listRef: React.RefObject<HTMLDivElement | null>;
  currentTarget: number;
  money: (v: number) => string;
  materialLabel: (key: string) => string;
  dateFormat: string;
  timeFormat: string;
  compareMode: boolean;
  compareIds: Set<string>;
  onToggleCompare: (id: string) => void;
  onReuse: (entry: SavedCalculation) => void;
  onDelete: (id: string) => void;
}) {
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 140, // estimated card height in px
    overscan: 5,
  });

  return (
    <div
      ref={listRef}
      className="max-h-[600px] overflow-auto rounded-xl"
      role="list"
      aria-label="Saved calculations"
    >
      <div
        style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const r = items[virtualRow.index]!;
          const status = statusAgainstTarget(
            Number(r.profit),
            Number(r.margin_percent),
            currentTarget,
          );
          const when = new Date(r.created_at);
          const isSelected = compareIds.has(r.id);
          return (
            <div
              key={r.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="pb-2.5"
            >
              <div
                className={cn(
                  "rounded-xl border border-border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  compareMode && isSelected && "ring-2 ring-primary",
                )}
                tabIndex={0}
                role="listitem"
              >
                <HistoryCardContent
                  r={r}
                  status={status}
                  when={when}
                  isSelected={isSelected}
                  compareMode={compareMode}
                  materialLabel={materialLabel}
                  dateFormat={dateFormat}
                  timeFormat={timeFormat}
                  money={money}
                  onToggleCompare={onToggleCompare}
                  onReuse={onReuse}
                  onDelete={onDelete}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
