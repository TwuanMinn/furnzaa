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
import { setAttendanceDayAction } from "@/lib/payroll/actions";
import { ATTENDANCE_STATUSES, attendanceStatusMeta, type AttendanceStatus } from "@/lib/payroll/attendance";
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

          {/* Recent daily attendance */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Recent attendance</CardTitle></CardHeader>
            <CardContent>
              {d.attendanceDays.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No attendance recorded. Mark days in the Attendance tab or via “Record attendance”.</p>
              ) : (
                <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1" role="list">
                  {d.attendanceDays.map((a) => {
                    const m = attendanceStatusMeta(a.status);
                    return (
                      <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2">
                          <span className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ring-1 ring-inset", badgeClass(m.color))}>{m.short}</span>
                          <span className="font-medium tabular-nums">{formatDate(a.work_date, "EEE, MMM d")}</span>
                          <span className="text-muted-foreground">{m.label}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
                          {a.hours_worked > 0 ? <span>{a.hours_worked}h</span> : null}
                          {a.overtime_hours > 0 ? <span className="text-amber-600 dark:text-amber-400">+{a.overtime_hours}h OT</span> : null}
                          {a.note ? <span className="max-w-28 truncate italic" title={a.note}>“{a.note}”</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
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
  const [workDate, setWorkDate] = useState(toDateKey(0));
  const [status, setStatus] = useState<AttendanceStatus>("present");
  const [hours, setHours] = useState("8");
  const [ot, setOt] = useState("0");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await setAttendanceDayAction({
        employeeId,
        workDate,
        status,
        hours: Number(hours) || 0,
        overtime: Number(ot) || 0,
        note: note.trim(),
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
          <DialogDescription>Mark this employee’s status for a single day. Saving again updates that day.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="att-date">Date</Label>
            <Input id="att-date" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ATTENDANCE_STATUSES.map((s) => {
                const m = attendanceStatusMeta(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setStatus(s); if (s === "absent" || s === "leave_paid" || s === "leave_unpaid" || s === "holiday") setHours("0"); else if (s === "half_day") setHours("4"); else setHours("8"); }}
                    className={cn("inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium ring-1 ring-inset transition", status === s ? badgeClass(m.color) : "text-muted-foreground ring-border hover:bg-muted")}
                  >
                    <span className="font-bold">{m.short}</span> {m.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="att-h">Hours</Label><Input id="att-h" type="number" min={0} max={24} value={hours} onChange={(e) => setHours(e.target.value)} className="tabular-nums" /></div>
            <div className="space-y-1.5"><Label htmlFor="att-o">Overtime (h)</Label><Input id="att-o" type="number" min={0} max={24} value={ot} onChange={(e) => setOt(e.target.value)} className="tabular-nums" /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="att-note">Note</Label><Textarea id="att-note" value={note} maxLength={500} rows={2} placeholder="Optional" onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <CalendarCheck />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
