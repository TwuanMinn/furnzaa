"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { badgeClass } from "@/lib/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { setAttendanceDayAction, deleteAttendanceDayAction } from "@/lib/payroll/actions";
import {
  ATTENDANCE_STATUSES, attendanceStatusMeta,
  type AttendanceDayCell, type AttendanceRangeData, type AttendanceStatus,
} from "@/lib/payroll/attendance";

type Mode = "day" | "week" | "month";

// ── Local date helpers (no UTC drift — build keys from local Y/M/D) ───────────
const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function startOfWeekMonday(d: Date) { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x; }

function rangeKeys(mode: Mode, anchor: Date): string[] {
  if (mode === "day") return [toKey(anchor)];
  if (mode === "week") { const s = startOfWeekMonday(anchor); return Array.from({ length: 7 }, (_, i) => toKey(addDays(s, i))); }
  const y = anchor.getFullYear(), m = anchor.getMonth(), n = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => toKey(new Date(y, m, i + 1)));
}

const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function rangeLabel(mode: Mode, keys: string[]): string {
  if (keys.length === 0) return "";
  const first = new Date(`${keys[0]}T00:00:00`);
  if (mode === "day") return first.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  if (mode === "month") return `${MONTHS[first.getMonth()]} ${first.getFullYear()}`;
  const last = new Date(`${keys[keys.length - 1]}T00:00:00`);
  return `${first.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${last.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

type EditState = { employeeId: string; employeeName: string; dateKey: string; cell: AttendanceDayCell | null } | null;

export function PayrollAttendance({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("month");
  const [anchor, setAnchor] = useState<Date>(() => new Date(2026, 5, 15)); // seeded demo month
  const [editing, setEditing] = useState<EditState>(null);

  const keys = useMemo(() => rangeKeys(mode, anchor), [mode, anchor]);
  const from = keys[0] ?? toKey(anchor);
  const to = keys[keys.length - 1] ?? from;

  const q = useQuery({
    queryKey: ["payroll-attendance", from, to],
    staleTime: 30_000,
    queryFn: async (): Promise<AttendanceRangeData> => {
      const res = await fetch(`/api/payroll/attendance?from=${from}&to=${to}`);
      const body = (await res.json()) as { ok: boolean; data?: AttendanceRangeData; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Failed to load");
      return body.data;
    },
  });

  const cellMap = useMemo(() => {
    const m = new Map<string, AttendanceDayCell>();
    for (const c of q.data?.days ?? []) m.set(`${c.employee_id}|${c.work_date}`, c);
    return m;
  }, [q.data]);

  function shift(dir: -1 | 1) {
    const a = new Date(anchor);
    if (mode === "day") a.setDate(a.getDate() + dir);
    else if (mode === "week") a.setDate(a.getDate() + 7 * dir);
    else a.setMonth(a.getMonth() + dir);
    setAnchor(a);
  }
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["payroll-attendance"] }); void qc.invalidateQueries({ queryKey: ["payroll-employee-detail"] }); void qc.invalidateQueries({ queryKey: ["payroll-analytics"] }); };

  const employees = q.data?.employees ?? [];
  const todayKey = toKey(new Date());

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
          {(["day", "week", "month"] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={cn("rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors", mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}><CalendarDays /> Today</Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Previous" onClick={() => shift(-1)}><ChevronLeft className="size-4" /></Button>
          <span className="min-w-40 text-center text-sm font-medium">{rangeLabel(mode, keys)}</span>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Next" onClick={() => shift(1)}><ChevronRight className="size-4" /></Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {ATTENDANCE_STATUSES.map((s) => {
          const m = attendanceStatusMeta(s);
          return (
            <span key={s} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("inline-flex size-4 items-center justify-center rounded text-[9px] font-bold ring-1 ring-inset", badgeClass(m.color))}>{m.short}</span>
              {m.label}
            </span>
          );
        })}
      </div>

      {q.isLoading ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : q.error ? (
        <div className="rounded-lg border border-border"><ErrorState description={q.error instanceof Error ? q.error.message : "Failed to load"} /></div>
      ) : employees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No employees to show.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="sticky left-0 z-10 bg-muted/30 px-3 py-2 text-left font-medium backdrop-blur">Employee</th>
                {keys.map((k) => {
                  const d = new Date(`${k}T00:00:00`);
                  const weekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <th key={k} className={cn("px-1 py-2 text-center text-xs font-medium tabular-nums", weekend && "text-muted-foreground/60", k === todayKey && "text-primary")}>
                      <div>{WD[d.getDay()]}</div>
                      <div>{d.getDate()}</div>
                    </th>
                  );
                })}
                <th className="px-2 py-2 text-right text-xs font-medium">Worked</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                let worked = 0, absent = 0;
                return (
                  <tr key={emp.id} className="border-b border-border/60 last:border-0">
                    <td className="sticky left-0 z-10 max-w-[180px] truncate bg-background px-3 py-1.5 font-medium">
                      {emp.full_name}
                      <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{emp.employee_code}</span>
                    </td>
                    {keys.map((k) => {
                      const cell = cellMap.get(`${emp.id}|${k}`) ?? null;
                      const d = new Date(`${k}T00:00:00`);
                      const weekend = d.getDay() === 0 || d.getDay() === 6;
                      if (cell) {
                        if (cell.status === "present" || cell.status === "remote") worked += 1;
                        else if (cell.status === "half_day") worked += 0.5;
                        else if (cell.status === "absent") absent += 1;
                      }
                      const meta = cell ? attendanceStatusMeta(cell.status) : null;
                      return (
                        <td key={k} className={cn("p-0.5 text-center", weekend && "bg-muted/20")}>
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() => setEditing({ employeeId: emp.id, employeeName: emp.full_name, dateKey: k, cell })}
                            title={cell ? `${meta!.label}${cell.note ? ` — ${cell.note}` : ""}` : canManage ? "Mark attendance" : undefined}
                            className={cn(
                              "inline-flex size-7 items-center justify-center rounded text-xs font-semibold transition-transform",
                              canManage && "hover:scale-110 cursor-pointer",
                              cell ? cn("ring-1 ring-inset", badgeClass(meta!.color)) : "text-muted-foreground/40 hover:bg-muted",
                            )}
                          >
                            {cell ? meta!.short : "·"}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right text-xs tabular-nums">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{worked}d</span>
                      {absent > 0 ? <span className="ml-1 text-red-600 dark:text-red-400">· {absent}a</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CellEditor editing={editing} canManage={canManage} onOpenChange={(o) => !o && setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
    </div>
  );
}

function CellEditor({
  editing, canManage, onOpenChange, onSaved,
}: {
  editing: EditState;
  canManage: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<AttendanceStatus>("present");
  const [hours, setHours] = useState("8");
  const [ot, setOt] = useState("0");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState<string>("");

  // Re-seed the form when a different cell is opened (no effect needed).
  const cellKey = editing ? `${editing.employeeId}|${editing.dateKey}` : "";
  if (editing && seeded !== cellKey) {
    setSeeded(cellKey);
    setStatus(editing.cell?.status ?? "present");
    setHours(String(editing.cell?.hours_worked ?? 8));
    setOt(String(editing.cell?.overtime_hours ?? 0));
    setNote(editing.cell?.note ?? "");
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await setAttendanceDayAction({
        employeeId: editing.employeeId, workDate: editing.dateKey, status,
        hours: Number(hours) || 0, overtime: Number(ot) || 0, note: note.trim(),
      });
      if (res.ok) { toast.success("Attendance saved"); onSaved(); } else toast.error(res.error);
    } finally { setBusy(false); }
  }
  async function clear() {
    if (!editing?.cell) return;
    setBusy(true);
    try {
      const res = await deleteAttendanceDayAction(editing.cell.id);
      if (res.ok) { toast.success("Attendance cleared"); onSaved(); } else toast.error(res.error);
    } finally { setBusy(false); }
  }

  const dateLabel = editing ? new Date(`${editing.dateKey}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";

  return (
    <Dialog open={editing !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing?.employeeName}</DialogTitle>
          <DialogDescription>{dateLabel}</DialogDescription>
        </DialogHeader>
        {!canManage ? (
          <p className="text-sm text-muted-foreground">You don’t have permission to edit attendance.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ATTENDANCE_STATUSES.map((s) => {
                  const m = attendanceStatusMeta(s);
                  return (
                    <button key={s} type="button" onClick={() => { setStatus(s); if ((s === "absent" || s === "leave_paid" || s === "leave_unpaid" || s === "holiday")) setHours("0"); else if (s === "half_day") setHours("4"); else setHours("8"); }}
                      className={cn("inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium ring-1 ring-inset transition", status === s ? badgeClass(m.color) : "text-muted-foreground ring-border hover:bg-muted")}>
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
            <div className="space-y-1.5"><Label htmlFor="att-n">Note</Label><Textarea id="att-n" value={note} maxLength={500} rows={2} placeholder="Optional" onChange={(e) => setNote(e.target.value)} /></div>
          </div>
        )}
        {canManage ? (
          <DialogFooter className="sm:justify-between">
            <div>{editing?.cell ? <Button variant="ghost" disabled={busy} onClick={() => void clear()} className="text-red-600 hover:text-red-700 dark:text-red-400"><Trash2 /> Clear</Button> : null}</div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={() => void save()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} Save</Button>
            </div>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
