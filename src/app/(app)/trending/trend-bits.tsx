"use client";

import { badgeClass } from "@/lib/badges";
import { cn } from "@/lib/utils";

/** Shared bits for the Trending Products views. */

export interface TrendConfigProps {
  platforms: string[];
  statuses: { key: string; label: string; color: string }[];
  targetMarginPct: number;
  currency: string;
  categories: { id: string; name: string }[];
}

/**
 * Estimated-margin pill, reusing the cost-calculator semantics: mint when at or
 * above the configurable target margin, amber below it, red at a loss.
 */
export function marginInfo(
  sellingCents: number | null,
  costCents: number | null,
  targetPct: number,
): { pct: number; label: string; className: string } | null {
  if (!sellingCents || costCents == null) return null;
  const profit = sellingCents - costCents;
  const pct = (profit / sellingCents) * 100;
  const status = profit < 0 ? "loss" : pct < targetPct ? "low" : "ok";
  return {
    pct,
    label: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
    className:
      status === "ok" ? badgeClass("green") : status === "low" ? badgeClass("amber") : badgeClass("red"),
  };
}

export function TrendStatusBadge({
  statusKey,
  statuses,
  className,
}: {
  statusKey: string;
  statuses: TrendConfigProps["statuses"];
  className?: string;
}) {
  const status = statuses.find((s) => s.key === statusKey);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        badgeClass(status?.color ?? "slate"),
        className,
      )}
    >
      {status?.label ?? statusKey}
    </span>
  );
}
