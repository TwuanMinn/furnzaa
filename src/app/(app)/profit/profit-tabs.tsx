"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Calculator, ChartNoAxesCombined, Handshake } from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfitClient } from "./profit-client";
import type { CalcMaterial } from "./cost-calculator";
import type { ProfitSharingConfig } from "@/lib/profit/sharing";

/**
 * Module 4's two top-level sections behind an animated segmented control:
 * "Profitability Dashboard" (pg_cron-refreshed matviews) | "Cost Calculator"
 * (per-user quoting scratchpad). The calculator is code-split — its bundle
 * loads only when the tab is first opened.
 */

const CostCalculator = dynamic(
  () => import("./cost-calculator").then((m) => m.CostCalculator),
  {
    loading: () => (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    ),
  },
);

const ProfitSharing = dynamic(
  () => import("./profit-sharing").then((m) => m.ProfitSharing),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    ),
  },
);

const TABS = [
  { key: "dashboard", label: "Profitability Dashboard", icon: ChartNoAxesCombined },
  { key: "calculator", label: "Cost Calculator", icon: Calculator },
  { key: "sharing", label: "Profit Sharing", icon: Handshake },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ProfitTabs({
  currency,
  materials,
  dateFormat,
  timeFormat,
  initialSharing,
}: {
  currency: string;
  materials: CalcMaterial[];
  dateFormat: string;
  timeFormat: string;
  initialSharing: ProfitSharingConfig | null;
}) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<TabKey>("dashboard");

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Profit & Cost Analysis sections"
        className="relative inline-grid grid-cols-3 rounded-xl border border-border bg-muted/40 p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative z-10 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === t.key ? (
              <motion.span
                layoutId="profit-tab"
                transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.35, bounce: 0.15 }}
                className="absolute inset-0 -z-10 rounded-lg bg-background shadow-sm ring-1 ring-border"
              />
            ) : null}
            <t.icon className="size-4" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {tab === "dashboard" ? (
            <ProfitClient currency={currency} />
          ) : tab === "calculator" ? (
            <CostCalculator
              materials={materials}
              currency={currency}
              dateFormat={dateFormat}
              timeFormat={timeFormat}
            />
          ) : (
            <ProfitSharing initialConfig={initialSharing} defaultCurrency={currency} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
