"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, CalendarPlus, CheckCircle2, FileText, Loader2, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { badgeClass } from "@/lib/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDataTable } from "@/lib/datatable/use-data-table";
import { DataTable, type DataTableColumn } from "@/components/datatable/data-table";
import type { FilterDef } from "@/lib/datatable/types";
import { formatDate, formatMoney, toDateKey } from "@/lib/format";
import { runStatusMeta } from "@/lib/payroll/formulas";
import {
  approvePayrollRunAction, calculatePayrollRunAction, closePayrollRunAction,
  createPayrollRunAction, generatePayslipsForRunAction, payPayrollRunAction,
} from "@/lib/payroll/actions";
import type { PayrollItemRow, PayrollRunRow } from "@/lib/payroll/types";

export function PayrollRuns({
  currency, canManage, canRun, canApprove, canPay, canGenerate,
}: {
  currency: string;
  canManage: boolean;
  canRun: boolean;
  canApprove: boolean;
  canPay: boolean;
  canGenerate: boolean;
}) {
  const qc = useQueryClient();
  const table = useDataTable<PayrollRunRow>({ endpoint: "/api/payroll/runs", defaultSort: { id: "period_month", dir: "desc" } });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ["/api/payroll/runs"] });
    void qc.invalidateQueries({ queryKey: ["/api/payroll/items"] });
    void qc.invalidateQueries({ queryKey: ["payroll-analytics"] });
  };

  const selected = table.rows.find((r) => r.id === selectedId) ?? null;

  if (selectedId && selected) {
    return (
      <RunDetail
        key={selectedId}
        run={selected}
        currency={currency}
        canRun={canRun}
        canApprove={canApprove}
        canPay={canPay}
        canManage={canManage}
        canGenerate={canGenerate}
        onBack={() => setSelectedId(null)}
        onChanged={refreshAll}
      />
    );
  }

  const filterDefs: FilterDef[] = [
    { type: "select", id: "status", label: "Status", options: ["draft", "calculated", "approved", "paid", "closed"].map((s) => ({ value: s, label: runStatusMeta(s).label })) },
    { type: "select", id: "run_type", label: "Type", options: [{ value: "regular", label: "Regular" }, { value: "adjustment", label: "Adjustment" }, { value: "off_cycle", label: "Off-cycle" }] },
  ];

  const columns: DataTableColumn<PayrollRunRow>[] = [
    { id: "period_month", header: "Period", sortable: true, cell: (r) => <span className="font-medium">{formatDate(r.period_month, "MMM yyyy")}</span> },
    { id: "name", header: "Name", cell: (r) => <span className="truncate">{r.name}</span> },
    { id: "status", header: "Status", cell: (r) => { const m = runStatusMeta(r.status); return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeClass(m.color))}>{m.label}</span>; } },
    { id: "headcount", header: "Headcount", align: "right", hideBelow: "sm", cell: (r) => <span className="tabular-nums">{r.headcount}</span> },
    { id: "net", header: "Net", align: "right", cell: (r) => <span className="tabular-nums">{formatMoney(r.total_net_cents, currency)}</span> },
    { id: "employer", header: "Employer cost", align: "right", hideBelow: "md", cell: (r) => <span className="tabular-nums">{formatMoney(r.total_employer_cost_cents, currency)}</span> },
  ];

  return (
    <>
      <DataTable
        table={table}
        columns={columns}
        getRowId={(r) => r.id}
        filterDefs={filterDefs}
        searchPlaceholder="Search runs…"
        exportDataset="payroll-runs"
        onRowClick={(r) => setSelectedId(r.id)}
        emptyTitle="No payroll runs yet"
        emptyDescription={canManage ? "Create a run, then calculate it." : undefined}
        emptyIcon={Wallet}
        toolbar={canManage ? <Button size="sm" onClick={() => setCreating(true)}><CalendarPlus /> New run</Button> : undefined}
      />
      {canManage ? <RunCreateDialog open={creating} onOpenChange={setCreating} onSaved={() => { setCreating(false); refreshAll(); }} /> : null}
    </>
  );
}

function RunCreateDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [periodMonth, setPeriodMonth] = useState(`${toDateKey(0).slice(0, 7)}-01`);
  const [name, setName] = useState("");
  const [runType, setRunType] = useState<"regular" | "adjustment" | "off_cycle">("regular");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await createPayrollRunAction({ periodMonth, name: name.trim(), runType });
      if (res.ok) { toast.success("Run created"); setName(""); onSaved(); }
      else toast.error(res.error);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New payroll run</DialogTitle>
          <DialogDescription>Creates a Draft run for the period; calculate it to compute every employee’s pay.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="run-period">Period (month)</Label><Input id="run-period" type="date" value={periodMonth} onChange={(e) => setPeriodMonth(`${e.target.value.slice(0, 7)}-01`)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="run-type">Run type</Label>
            <Select value={runType} onValueChange={(v) => setRunType(v as "regular" | "adjustment" | "off_cycle")}>
              <SelectTrigger id="run-type" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="regular">Regular</SelectItem><SelectItem value="adjustment">Adjustment</SelectItem><SelectItem value="off_cycle">Off-cycle</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="run-name">Name (optional)</Label><Input id="run-name" value={name} maxLength={120} placeholder="Auto-named from the period if blank" onChange={(e) => setName(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Plus />} Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunDetail({
  run, currency, canRun, canApprove, canPay, canManage, canGenerate, onBack, onChanged,
}: {
  run: PayrollRunRow;
  currency: string;
  canRun: boolean;
  canApprove: boolean;
  canPay: boolean;
  canManage: boolean;
  canGenerate: boolean;
  onBack: () => void;
  onChanged: () => void;
}) {
  const reduce = useReducedMotion();
  const items = useDataTable<PayrollItemRow>({ endpoint: "/api/payroll/items", defaultSort: { id: "net_cents", dir: "desc" }, initialFilters: { run: run.id } });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "approve" | "pay" | "close">(null);
  const meta = runStatusMeta(run.status);

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (res.ok) { toast.success(ok); items.refresh(); onChanged(); }
      else toast.error(res.error);
    } finally { setBusy(false); setConfirm(null); }
  }

  async function generate() {
    setBusy(true);
    try {
      const res = await generatePayslipsForRunAction(run.id);
      if (res.ok) { const n = res.data?.count ?? 0; toast.success(`Generated ${n} payslip${n === 1 ? "" : "s"}`); onChanged(); }
      else toast.error(res.error);
    } finally { setBusy(false); }
  }

  const columns: DataTableColumn<PayrollItemRow>[] = [
    { id: "employee", header: "Employee", cell: (r) => <div className="min-w-0"><p className="truncate font-medium">{r.employee_name}</p><p className="truncate font-mono text-xs text-muted-foreground">{r.employee_code}</p></div> },
    { id: "department", header: "Department", hideBelow: "lg", cell: (r) => <span className="text-muted-foreground">{r.department_name ?? "—"}</span> },
    { id: "gross", header: "Gross", align: "right", cell: (r) => <span className="tabular-nums">{formatMoney(r.gross_cents, currency)}</span> },
    { id: "tax", header: "Tax", align: "right", hideBelow: "md", cell: (r) => <span className="tabular-nums text-muted-foreground">{formatMoney(r.total_tax_cents, currency)}</span> },
    { id: "deductions", header: "Deductions", align: "right", hideBelow: "sm", cell: (r) => <span className="tabular-nums text-red-600 dark:text-red-400">{formatMoney(r.total_deductions_cents, currency)}</span> },
    { id: "net_cents", header: "Net", sortable: true, align: "right", cell: (r) => <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{formatMoney(r.net_cents, currency)}</span> },
    { id: "employer", header: "Employer cost", align: "right", hideBelow: "md", cell: (r) => <span className="tabular-nums">{formatMoney(r.employer_cost_cents, currency)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2"><ArrowLeft /> All runs</Button>
          <span className="truncate text-sm font-medium">{run.name}</span>
          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeClass(meta.color))}>{meta.label}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {run.status === "draft" && canRun ? <Button size="sm" disabled={busy} onClick={() => void act(() => calculatePayrollRunAction(run.id), "Run calculated")}>{busy ? <Loader2 className="animate-spin" /> : null} Calculate</Button> : null}
          {run.status === "calculated" && canRun ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => calculatePayrollRunAction(run.id), "Recalculated")}>Recalculate</Button> : null}
          {run.status === "calculated" && canApprove ? <Button size="sm" disabled={busy} onClick={() => setConfirm("approve")}><CheckCircle2 /> Approve</Button> : null}
          {run.status === "approved" && canPay ? <Button size="sm" disabled={busy} onClick={() => setConfirm("pay")}>Mark paid</Button> : null}
          {run.status === "paid" && canManage ? <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm("close")}>Close</Button> : null}
          {["approved", "paid", "closed"].includes(run.status) && canGenerate ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void generate()}>{busy ? <Loader2 className="animate-spin" /> : <FileText />} Generate payslips</Button>
          ) : null}
        </div>
      </div>

      <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}>
        <Card>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Period" value={formatDate(run.period_month, "MMM yyyy")} />
            <Stat label="Headcount" value={String(run.headcount)} />
            <Stat label="Gross" value={formatMoney(run.total_gross_cents, currency)} />
            <Stat label="Net" value={formatMoney(run.total_net_cents, currency)} tone="ok" />
            <Stat label="Employer cost" value={formatMoney(run.total_employer_cost_cents, currency)} />
          </CardContent>
        </Card>
      </motion.div>

      <DataTable
        table={items}
        columns={columns}
        getRowId={(r) => r.id}
        searchPlaceholder="Search employees…"
        exportDataset="payroll-items"
        emptyTitle={run.status === "draft" ? "Not calculated yet" : "No items"}
        emptyDescription={run.status === "draft" ? "Calculate the run to compute each employee’s pay." : undefined}
      />

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "approve" ? "Approve this run?" : confirm === "pay" ? "Mark this run paid?" : "Close this run?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "approve"
                ? "Approving freezes every payslip — corrections then require an adjustment run."
                : confirm === "pay"
                  ? "Marks the run paid and stamps the pay date."
                  : "Closes the run. This is final."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm === "approve") void act(() => approvePayrollRunAction(run.id), "Run approved");
                else if (confirm === "pay") void act(() => payPayrollRunAction(run.id), "Run marked paid");
                else if (confirm === "close") void act(() => closePayrollRunAction(run.id), "Run closed");
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 truncate font-semibold tabular-nums", tone === "ok" && "text-emerald-600 dark:text-emerald-400")}>{value}</p>
    </div>
  );
}
