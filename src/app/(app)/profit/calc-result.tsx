"use client";

import { memo } from "react";

import { motion, useReducedMotion } from "motion/react";
import { Bookmark, Info, Layers, Loader2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/format";
import type { CalcInputs, CalcResults, MarginStatus } from "@/lib/profit/calculator";
import { SectionLabel } from "./calc-form";

/** Semantic coloring: mint = profit ok, amber = low margin, red = loss. */
export const STATUS_CLASSES: Record<MarginStatus, string> = {
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25",
  low: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25",
  loss: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/25",
};

export const CalcResultPanel = memo(function CalcResultPanel({
  inputs,
  results,
  saving,
  currency,
  materialLabel,
  onSave,
}: {
  inputs: CalcInputs;
  results: CalcResults;
  saving: boolean;
  currency: string;
  materialLabel: (key: string) => string;
  onSave: () => void;
}) {
  const reduce = useReducedMotion();
  const money = (v: number) => formatAmount(v, currency);
  const qty = Math.max(inputs.quantity, 1);
  const showBatch = qty > 1;

  return (
    <motion.section
      key="result"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-4 rounded-xl border border-border bg-card p-4"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Result{showBatch ? ` (per unit × ${qty})` : ""}</SectionLabel>
        <Button size="sm" variant="outline" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Bookmark aria-hidden />}
          Save to history
        </Button>
      </div>
      <h3 className="font-semibold">
        {inputs.name || "Unnamed product"} — {materialLabel(inputs.material)}
      </h3>

      {/* ── KPI tiles ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: "Material", value: money(results.materialCost) },
          { label: "Electricity", value: money(results.electricityCost) },
          { label: "Total cost", value: money(results.totalCost) },
          {
            label: "Profit",
            value: money(results.profit),
            status: results.marginStatus,
          },
        ].map((tile) => (
          <div
            key={tile.label}
            className={cn(
              "rounded-lg border border-border p-3 ring-1 ring-transparent ring-inset",
              tile.status ? STATUS_CLASSES[tile.status] : "bg-muted/30",
            )}
          >
            <p className={cn("text-xs", tile.status ? "opacity-80" : "text-muted-foreground")}>
              {tile.label}
            </p>
            <p className="mt-0.5 truncate font-semibold tabular-nums">{tile.value}</p>
          </div>
        ))}
      </div>

      {/* ── Batch totals row (only when qty > 1) ──────────────── */}
      {showBatch ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Batch total cost (×{qty})</p>
            <p className="mt-0.5 truncate font-semibold tabular-nums">
              {money(results.batchTotalCost)}
            </p>
          </div>
          <div
            className={cn(
              "rounded-lg border border-border p-3 ring-1 ring-transparent ring-inset",
              STATUS_CLASSES[results.marginStatus],
            )}
          >
            <p className="text-xs opacity-80">Batch profit (×{qty})</p>
            <p className="mt-0.5 truncate font-semibold tabular-nums">
              {money(results.batchProfit)}
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Margin warning ────────────────────────────────────── */}
      {results.marginStatus !== "ok" ? (
        <div
          role="alert"
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-inset",
            STATUS_CLASSES[results.marginStatus],
          )}
        >
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {results.marginStatus === "loss"
            ? "Selling at a loss — your price doesn't cover costs"
            : `Margin ${results.marginPercent.toFixed(1)}% is below your ${inputs.targetMarginPercent}% target`}
        </div>
      ) : null}

      {/* ── Break-even & recommended price ────────────────────── */}
      {results.totalCost > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="space-y-0.5">
            <p>
              <span className="text-muted-foreground">Break-even price:</span>{" "}
              <span className="font-medium tabular-nums">{money(results.breakEvenPrice)}</span>
              <span className="text-muted-foreground"> (0% margin)</span>
            </p>
            <p>
              <span className="text-muted-foreground">Recommended price:</span>{" "}
              <span className="font-medium tabular-nums">{money(results.recommendedPrice)}</span>
              <span className="text-muted-foreground">
                {" "}
                (at {inputs.targetMarginPercent}% margin)
              </span>
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Yield estimate (units per spool) ──────────────────── */}
      {results.filamentWithWasteGrams > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm">
          <Layers className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium text-muted-foreground">
              Units per spool ({results.filamentWithWasteGrams.toFixed(1)}g each incl. waste)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { kg: 1, units: results.unitsPerKg },
                { kg: 3, units: results.unitsPer3Kg },
                { kg: 5, units: results.unitsPer5Kg },
              ] as const).map(({ kg, units }) => (
                <div
                  key={kg}
                  className="rounded-md border border-border bg-background px-2.5 py-1.5 text-center"
                >
                  <p className="text-lg font-semibold tabular-nums">{units}</p>
                  <p className="text-[11px] text-muted-foreground">from {kg} kg</p>
                  {results.totalCost > 0 ? (
                    <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                      {money(results.totalCost * units)} total cost
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Detailed breakdown ────────────────────────────────── */}
      <dl className="text-sm [&>div]:flex [&>div]:items-baseline [&>div]:justify-between [&>div]:gap-4 [&>div]:border-b [&>div]:border-border/60 [&>div]:py-1.5 [&>div:last-child]:border-0">
        <div>
          <dt className="text-muted-foreground">
            Filament (incl. {inputs.wastePercent}% waste)
          </dt>
          <dd className="tabular-nums">{results.filamentWithWasteGrams.toFixed(1)}g</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Material cost</dt>
          <dd className="tabular-nums">{money(results.materialCost)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            Electricity ({inputs.printTimeHours || 0}h × {inputs.printerWatts || 0}W)
          </dt>
          <dd className="tabular-nums">{money(results.electricityCost)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Labor / setup</dt>
          <dd className="tabular-nums">{money(inputs.laborCost)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Other costs</dt>
          <dd className="tabular-nums">{money(inputs.otherCosts)}</dd>
        </div>
        <div>
          <dt className="font-medium">Total cost</dt>
          <dd className="font-medium tabular-nums">{money(results.totalCost)}</dd>
        </div>
        <div>
          <dt className="font-medium">Selling price</dt>
          <dd className="font-medium tabular-nums">{money(inputs.sellingPrice)}</dd>
        </div>
        <div>
          <dt className="font-medium">Profit</dt>
          <dd className="flex items-center gap-2">
            <span className="font-semibold tabular-nums">{money(results.profit)}</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset tabular-nums",
                STATUS_CLASSES[results.marginStatus],
              )}
            >
              {results.marginPercent >= 0 ? "+" : ""}
              {results.marginPercent.toFixed(1)}% margin
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">ROI</dt>
          <dd className="tabular-nums">{results.roiPercent.toFixed(1)}%</dd>
        </div>
      </dl>
    </motion.section>
  );
});
