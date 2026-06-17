"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, CalendarCheck, Coins, Loader2, Pencil, ReceiptText } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { badgeClass } from "@/lib/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { formatDate, formatMoney, toDateKey } from "@/lib/format";
import { saveAttendanceAction } from "@/lib/payroll/actions";
import { employeeStatusMeta, employmentTypeMeta, runStatusMeta } from "@/lib/payroll/formulas";
import type { EmployeeDetailData, EmployeeListRow } from "@/lib/payroll/types";

const pill = (label: string, color: string) => (
  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeClass(color))}>{label}</span>
);

export function EmployeeDetail({
  employee, currency, canManage, onBack, onSetSalary, onEdit,
}: {
  employee: EmployeeListRow;
  currency: string;
  canManage: boolean;
  onBack: () => void;
  onSetSalary: () => void;
  onEdit: () => void;
}) {
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  const [attOpen, setAttOpen] = useState(false);

  const q = useQuery({
    queryKey: ["payroll-employee-detail", employee.id],
    staleTime: 30_000,
    queryFn: async (): Promise<EmployeeDetailData> => {
      const res = await fetch(`/api/payroll/employees/${employee.id}`);
      const body = (await res.json()) as { ok: boolean; data?: EmployeeDetailData; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Failed to load");
      return body.data;
    },
  });
  const d = q.data;
  const typeMeta = employmentTypeMeta(employee.employment_type);
  const statusMeta = employeeStatusMeta(employee.status);
  const money = (c: number) => formatMoney(c, currency);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2"><ArrowLeft /> All employees</Button>
          <span className="truncate text-sm font-medium">{employee.full_name}</span>
          <span className="font-mono text-xs text-muted-foreground">{employee.employee_code}</span>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setAttOpen(true)}><CalendarCheck /> Record attendance</Button>
            <Button size="sm" variant="outline" onClick={onSetSalary}><Coins /> Set salary</Button>
            <Button size="sm" variant="outline" onClick={onEdit}><Pencil /> Edit</Button>
          </div>
        ) : null}
      </div>

      <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}>
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-5 text-sm">
            <div className="flex items-center gap-2">{pill(typeMeta.label, typeMeta.color)}{pill(statusMeta.label, statusMeta.color)}</div>
            <Field label="Position" value={employee.position || "—"} />
            <Field label="Department" value={d?.employee.department_name ?? "—"} />
            <Field label="Hire date" value={employee.hire_date ? formatDate(employee.hire_date, "MMM d, yyyy") : "—"} />
            {d?.employee.email ? <Field label="Email" value={d.employee.email} /> : null}
            {d?.employee.phone ? <Field label="Phone" value={d.employee.phone} /> : null}
            {d?.employee.bank_masked ? <Field label="Bank" value={d.employee.bank_masked} /> : null}
          </CardContent>
        </Card>
      </motion.div>

      {q.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-48 rounded-xl" /><Skeleton className="h-48 rounded-xl" /></div>
      ) : q.error ? (
        <div className="rounded-lg border border-border"><ErrorState description={q.error instanceof Error ? q.error.message : "Failed to load"} /></div>
      ) : d ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Salary-structure history */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Salary history</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {d.salaryStructures.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No salary structure yet. Set one to include this employee in payroll.</p>
              ) : (
                d.salaryStructures.map((s, i) => (
                  <div key={s.id} className={cn("rounded-lg border border-border p-3", i === 0 && "ring-1 ring-emerald-500/30")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{formatDate(s.effective_from, "MMM d, yyyy")}{i === 0 ? <span className="ml-2 text-xs font-normal text-emerald-600 dark:text-emerald-400">Current</span> : null}</span>
                      <span className="text-xs capitalize text-muted-foreground">{s.pay_basis}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
                      <span>{s.pay_basis === "hourly" ? `${money(s.hourly_rate_cents)}/hr` : `${money(s.base_salary_cents)}/mo`}</span>
                      {s.overtime_rate_cents > 0 ? <span className="text-muted-foreground">OT {money(s.overtime_rate_cents)}/hr</span> : null}
                      {s.recurring_allowances.length > 0 ? <span className="text-emerald-600 dark:text-emerald-400">+{s.recurring_allowances.length} allowance{s.recurring_allowances.length === 1 ? "" : "s"}</span> : null}
                      {s.recurring_deductions.length > 0 ? <span className="text-red-600 dark:text-red-400">−{s.recurring_deductions.length} deduction{s.recurring_deductions.length === 1 ? "" : "s"}</span> : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Attendance history */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Attendance</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {d.attendance.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No attendance recorded.</p>
              ) : (
                d.attendance.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 text-sm last:border-0 last:pb-0">
                    <span className="font-medium">{formatDate(a.period_month, "MMM yyyy")}</span>
                    <span className="flex flex-wrap justify-end gap-x-3 text-xs tabular-nums text-muted-foreground">
                      <span>{a.days_worked}d</span>
                      {a.overtime_hours > 0 ? <span className="text-amber-600 dark:text-amber-400">{a.overtime_hours}h OT</span> : null}
                      {a.leave_days_unpaid > 0 ? <span>{a.leave_days_unpaid} unpaid</span> : null}
                      {a.absences > 0 ? <span className="text-red-600 dark:text-red-400">{a.absences} abs</span> : null}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Payslip history */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-1.5 text-base"><ReceiptText className="size-4 text-muted-foreground" aria-hidden /> Payslip history</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {d.payItems.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No finalized payslips yet.</p>
              ) : (
                d.payItems.map((p) => {
                  const m = runStatusMeta(p.run_status);
                  return (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 text-sm last:border-0 last:pb-0">
                      <div className="flex items-center gap-2"><span className="font-medium">{formatDate(p.period_month, "MMMM yyyy")}</span>{pill(m.label, m.color)}</div>
                      <div className="flex gap-x-4 tabular-nums">
                        <span className="text-muted-foreground">Gross {money(p.gross_cents)}</span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">Net {money(p.net_cents)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <AttendanceDialog
        open={attOpen}
        onOpenChange={setAttOpen}
        employeeId={employee.id}
        employeeName={employee.full_name}
        onSaved={() => void qc.invalidateQueries({ queryKey: ["payroll-employee-detail", employee.id] })}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  );
}

function AttendanceDialog({
  open, onOpenChange, employeeId, employeeName, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employeeId: string;
  employeeName: string;
  onSaved: () => void;
}) {
  const [periodMonth, setPeriodMonth] = useState(`${toDateKey(0).slice(0, 7)}-01`);
  const [daysWorked, setDaysWorked] = useState("22");
  const [hoursWorked, setHoursWorked] = useState("");
  const [overtimeHours, setOvertimeHours] = useState("");
  const [leavePaid, setLeavePaid] = useState("");
  const [leaveUnpaid, setLeaveUnpaid] = useState("");
  const [absences, setAbsences] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await saveAttendanceAction({
        employeeId,
        periodMonth,
        daysWorked: Number(daysWorked) || 0,
        hoursWorked: Number(hoursWorked) || 0,
        overtimeHours: Number(overtimeHours) || 0,
        leaveDaysPaid: Number(leavePaid) || 0,
        leaveDaysUnpaid: Number(leaveUnpaid) || 0,
        absences: Number(absences) || 0,
        notes: notes.trim(),
      });
      if (res.ok) { toast.success("Attendance saved"); onOpenChange(false); onSaved(); }
      else toast.error(res.error);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record attendance — {employeeName}</DialogTitle>
          <DialogDescription>One record per month; saving again updates the period. Editable until the period’s run is approved.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="att-period">Period (month)</Label><Input id="att-period" type="date" value={periodMonth} onChange={(e) => setPeriodMonth(`${e.target.value.slice(0, 7)}-01`)} /></div>
          <div className="space-y-1.5"><Label htmlFor="att-days">Days worked</Label><Input id="att-days" type="number" min={0} max={31} value={daysWorked} onChange={(e) => setDaysWorked(e.target.value)} className="tabular-nums" /></div>
          <div className="space-y-1.5"><Label htmlFor="att-hours">Hours worked</Label><Input id="att-hours" type="number" min={0} value={hoursWorked} placeholder="0" onChange={(e) => setHoursWorked(e.target.value)} className="tabular-nums" /></div>
          <div className="space-y-1.5"><Label htmlFor="att-ot">Overtime hours</Label><Input id="att-ot" type="number" min={0} value={overtimeHours} placeholder="0" onChange={(e) => setOvertimeHours(e.target.value)} className="tabular-nums" /></div>
          <div className="space-y-1.5"><Label htmlFor="att-lp">Paid leave (days)</Label><Input id="att-lp" type="number" min={0} value={leavePaid} placeholder="0" onChange={(e) => setLeavePaid(e.target.value)} className="tabular-nums" /></div>
          <div className="space-y-1.5"><Label htmlFor="att-lu">Unpaid leave (days)</Label><Input id="att-lu" type="number" min={0} value={leaveUnpaid} placeholder="0" onChange={(e) => setLeaveUnpaid(e.target.value)} className="tabular-nums" /></div>
          <div className="space-y-1.5"><Label htmlFor="att-abs">Absences (days)</Label><Input id="att-abs" type="number" min={0} value={absences} placeholder="0" onChange={(e) => setAbsences(e.target.value)} className="tabular-nums" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="att-notes">Notes</Label><Textarea id="att-notes" value={notes} maxLength={1000} rows={2} placeholder="Optional" onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <CalendarCheck />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
