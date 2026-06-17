"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BarChart3, Users, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { PayrollAnalytics } from "./payroll-analytics";
import { PayrollEmployees, type Ref } from "./payroll-employees";
import { PayrollRuns } from "./payroll-runs";

type Tab = "analytics" | "employees" | "runs";

export function PayrollClient({
  currency,
  departments,
  taxProfiles,
  employerProfiles,
  canManage,
  canRun,
  canApprove,
  canPay,
  canAnalytics,
}: {
  currency: string;
  departments: { id: string; name: string; color: string }[];
  taxProfiles: Ref[];
  employerProfiles: Ref[];
  canManage: boolean;
  canRun: boolean;
  canApprove: boolean;
  canPay: boolean;
  canAnalytics: boolean;
}) {
  const reduce = useReducedMotion();
  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    ...(canAnalytics ? [{ key: "analytics" as const, label: "Analytics", icon: BarChart3 }] : []),
    { key: "employees", label: "Employees", icon: Users },
    { key: "runs", label: "Payroll runs", icon: Wallet },
  ];
  const [tab, setTab] = useState<Tab>(canAnalytics ? "analytics" : "employees");

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Payroll sections" className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative z-10 inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab === t.key ? (
              <motion.span
                layoutId="payroll-tab"
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
          {tab === "analytics" ? (
            <PayrollAnalytics currency={currency} />
          ) : tab === "employees" ? (
            <PayrollEmployees
              currency={currency}
              departments={departments}
              taxProfiles={taxProfiles}
              employerProfiles={employerProfiles}
              canManage={canManage}
            />
          ) : (
            <PayrollRuns currency={currency} canManage={canManage} canRun={canRun} canApprove={canApprove} canPay={canPay} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
