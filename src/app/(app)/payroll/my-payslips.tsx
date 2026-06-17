"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ReceiptText, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { formatDate, formatMoney } from "@/lib/format";
import { runStatusMeta } from "@/lib/payroll/formulas";
import { badgeClass } from "@/lib/badges";
import type { PayrollItemRow } from "@/lib/payroll/types";
import type { CursorPage } from "@/lib/datatable/types";

/** Staff self-service: their finalized payslips (RLS scopes to own items). */
export function MyPayslips({ currency }: { currency: string }) {
  const reduce = useReducedMotion();
  const q = useQuery({
    queryKey: ["my-payslips"],
    staleTime: 60_000,
    queryFn: async (): Promise<PayrollItemRow[]> => {
      const res = await fetch("/api/payroll/items?limit=60");
      const body = (await res.json()) as { ok: boolean; data?: CursorPage<PayrollItemRow>; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Failed to load");
      return body.data.rows;
    },
  });

  const items = (q.data ?? [])
    .filter((r) => ["approved", "paid", "closed"].includes(r.run_status))
    .sort((a, b) => b.period_month.localeCompare(a.period_month));

  if (q.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }
  if (q.error) {
    return (
      <div className="rounded-lg border border-border">
        <ErrorState description={q.error instanceof Error ? q.error.message : "Failed to load"} />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <ReceiptText className="mx-auto size-8 text-muted-foreground/60" aria-hidden />
        <p className="mt-3 text-sm font-medium">No payslips yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Your payslips appear here once payroll is approved.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3" role="list">
      <AnimatePresence initial={false}>
        {items.map((r, i) => {
          const meta = runStatusMeta(r.run_status);
          return (
            <motion.li
              key={r.id}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut", delay: reduce ? 0 : i * 0.05 }}
            >
              <Card>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Wallet className="size-5" aria-hidden />
                      </span>
                      <div>
                        <p className="font-semibold">{formatDate(r.period_month, "MMMM yyyy")}</p>
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeClass(meta.color))}>
                          {meta.label}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Net pay</p>
                      <p className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatMoney(r.net_cents, currency)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-sm">
                    <Stat label="Gross" value={formatMoney(r.gross_cents, currency)} />
                    <Stat label="Tax" value={formatMoney(r.total_tax_cents, currency)} />
                    <Stat label="Deductions" value={formatMoney(r.total_deductions_cents, currency)} />
                  </div>
                </CardContent>
              </Card>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium tabular-nums">{value}</p>
    </div>
  );
}
