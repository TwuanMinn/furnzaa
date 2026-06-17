"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Coins, Loader2, Pencil, Plus, Users } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { badgeClass } from "@/lib/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDataTable } from "@/lib/datatable/use-data-table";
import { DataTable, type DataTableColumn } from "@/components/datatable/data-table";
import type { FilterDef } from "@/lib/datatable/types";
import { toDateKey } from "@/lib/format";
import { createEmployeeAction, updateEmployeeAction, addSalaryStructureAction } from "@/lib/payroll/actions";
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, type EmployeeListRow } from "@/lib/payroll/types";
import { employeeStatusMeta, employmentTypeMeta } from "@/lib/payroll/formulas";

export type Ref = { id: string; name: string };
const NONE = "__none__";
const cap = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function PayrollEmployees({
  currency: _currency,
  departments,
  taxProfiles,
  employerProfiles,
  canManage,
}: {
  currency: string;
  departments: { id: string; name: string; color: string }[];
  taxProfiles: Ref[];
  employerProfiles: Ref[];
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const table = useDataTable<EmployeeListRow>({ endpoint: "/api/payroll/employees", defaultSort: { id: "created_at", dir: "desc" } });
  const [editing, setEditing] = useState<EmployeeListRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [salaryFor, setSalaryFor] = useState<EmployeeListRow | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["/api/payroll/employees"] });
    void qc.invalidateQueries({ queryKey: ["payroll-analytics"] });
  };

  const filterDefs: FilterDef[] = useMemo(
    () => [
      { type: "select", id: "department", label: "Department", options: departments.map((d) => ({ value: d.id, label: d.name })) },
      { type: "select", id: "employment_type", label: "Type", options: EMPLOYMENT_TYPES.map((t) => ({ value: t, label: employmentTypeMeta(t).label })) },
      { type: "select", id: "status", label: "Status", options: EMPLOYEE_STATUSES.map((s) => ({ value: s, label: employeeStatusMeta(s).label })) },
    ],
    [departments],
  );

  const columns: DataTableColumn<EmployeeListRow>[] = [
    { id: "employee_code", header: "Code", cell: (r) => <span className="font-mono text-xs">{r.employee_code}</span> },
    { id: "full_name", header: "Name", sortable: true, cell: (r) => <span className="font-medium">{r.full_name}</span> },
    { id: "position", header: "Position", hideBelow: "md", cell: (r) => <span className="text-muted-foreground">{r.position || "—"}</span> },
    {
      id: "department", header: "Department", hideBelow: "lg",
      cell: (r) => r.department_name ? <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeClass(r.department_color ?? "slate"))}>{r.department_name}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      id: "employment_type", header: "Type", hideBelow: "sm",
      cell: (r) => { const m = employmentTypeMeta(r.employment_type); return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeClass(m.color))}>{m.label}</span>; },
    },
    {
      id: "status", header: "Status",
      cell: (r) => { const m = employeeStatusMeta(r.status); return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeClass(m.color))}>{m.label}</span>; },
    },
    ...(canManage
      ? [{
          id: "actions", header: "", align: "right" as const,
          cell: (r: EmployeeListRow) => (
            <div className="flex justify-end gap-1">
              <Button size="icon-sm" variant="ghost" aria-label={`Set salary for ${r.full_name}`} onClick={() => setSalaryFor(r)}><Coins className="text-muted-foreground" /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Edit ${r.full_name}`} onClick={() => setEditing(r)}><Pencil className="text-muted-foreground" /></Button>
            </div>
          ),
        }]
      : []),
  ];

  return (
    <>
      <DataTable
        table={table}
        columns={columns}
        getRowId={(r) => r.id}
        filterDefs={filterDefs}
        searchPlaceholder="Search name or code…"
        exportDataset="payroll-employees"
        emptyTitle="No employees yet"
        emptyDescription={canManage ? "Add your first employee to start running payroll." : undefined}
        emptyIcon={Users}
        toolbar={canManage ? <Button size="sm" onClick={() => setCreating(true)}><Plus /> New employee</Button> : undefined}
      />
      {canManage ? (
        <>
          <EmployeeDialog open={creating} onOpenChange={setCreating} departments={departments} onSaved={refresh} />
          <EmployeeDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} departments={departments} employee={editing} onSaved={refresh} />
          <SalaryDialog open={salaryFor !== null} onOpenChange={(o) => !o && setSalaryFor(null)} employee={salaryFor} currency={_currency} taxProfiles={taxProfiles} employerProfiles={employerProfiles} onSaved={refresh} />
        </>
      ) : null}
    </>
  );
}

function EmployeeDialog({
  open, onOpenChange, departments, employee, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  departments: { id: string; name: string }[];
  employee?: EmployeeListRow | null;
  onSaved: () => void;
}) {
  const editing = !!employee;
  const [code, setCode] = useState(employee?.employee_code ?? "");
  const [name, setName] = useState(employee?.full_name ?? "");
  const [position, setPosition] = useState(employee?.position ?? "");
  const [departmentId, setDepartmentId] = useState(employee?.department_id ?? "");
  const [type, setType] = useState(employee?.employment_type ?? "full_time");
  const [status, setStatus] = useState(employee?.status ?? "active");
  const [hireDate, setHireDate] = useState(employee?.hire_date ?? "");
  const [bankAccount, setBankAccount] = useState("");
  const [busy, setBusy] = useState(false);

  // Re-seed when the target employee changes (edit dialog reused per row).
  const key = employee?.id ?? "new";
  const [seeded, setSeeded] = useState(key);
  if (seeded !== key) {
    setSeeded(key);
    setCode(employee?.employee_code ?? "");
    setName(employee?.full_name ?? "");
    setPosition(employee?.position ?? "");
    setDepartmentId(employee?.department_id ?? "");
    setType(employee?.employment_type ?? "full_time");
    setStatus(employee?.status ?? "active");
    setHireDate(employee?.hire_date ?? "");
    setBankAccount("");
  }

  async function save() {
    if (!code.trim() || !name.trim()) { toast.error("Code and name are required"); return; }
    setBusy(true);
    try {
      const payload = {
        employeeCode: code.trim(), fullName: name.trim(), position: position.trim(),
        departmentId: departmentId || null, employmentType: type, status: status as "active" | "on_leave" | "terminated",
        hireDate: hireDate || null, bankAccount: bankAccount || "",
      };
      const res = editing ? await updateEmployeeAction(employee!.id, payload) : await createEmployeeAction(payload);
      if (res.ok) { toast.success(editing ? "Employee updated" : "Employee created"); onOpenChange(false); onSaved(); }
      else toast.error(res.error);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit employee" : "New employee"}</DialogTitle>
          <DialogDescription>{editing ? "Update employee details." : "Add an employee to the payroll register."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="emp-code">Employee code</Label><Input id="emp-code" value={code} maxLength={40} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="emp-name">Full name</Label><Input id="emp-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="emp-pos">Position</Label><Input id="emp-pos" value={position} maxLength={120} onChange={(e) => setPosition(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="emp-dept">Department</Label>
            <Select value={departmentId || NONE} onValueChange={(v) => setDepartmentId(v === NONE ? "" : v)}>
              <SelectTrigger id="emp-dept" className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>None</SelectItem>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emp-type">Employment type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="emp-type" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{EMPLOYMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{cap(t)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emp-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="emp-status" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{EMPLOYEE_STATUSES.map((s) => <SelectItem key={s} value={s}>{cap(s)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="emp-hire">Hire date</Label><Input id="emp-hire" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="emp-bank">Bank account</Label><Input id="emp-bank" value={bankAccount} maxLength={60} placeholder={editing ? "•••• (unchanged if blank)" : "Optional"} onChange={(e) => setBankAccount(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} {editing ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SalaryDialog({
  open, onOpenChange, employee, currency, taxProfiles, employerProfiles, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employee: EmployeeListRow | null;
  currency: string;
  taxProfiles: Ref[];
  employerProfiles: Ref[];
  onSaved: () => void;
}) {
  const [payBasis, setPayBasis] = useState<"salaried" | "hourly">("salaried");
  const [base, setBase] = useState("");
  const [hourly, setHourly] = useState("");
  const [otRate, setOtRate] = useState("");
  const [taxId, setTaxId] = useState("");
  const [erId, setErId] = useState("");
  const [days, setDays] = useState("22");
  const [effectiveFrom, setEffectiveFrom] = useState(toDateKey(0));
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!employee) return;
    setBusy(true);
    try {
      const res = await addSalaryStructureAction({
        employeeId: employee.id, effectiveFrom, payBasis,
        baseSalary: Number(base) || 0, hourlyRate: Number(hourly) || 0, overtimeRate: Number(otRate) || 0,
        recurringAllowances: [], recurringDeductions: [],
        taxProfileId: taxId || null, employerContributionProfileId: erId || null,
        standardWorkingDays: Number(days) || 22,
      });
      if (res.ok) { toast.success("Salary structure saved"); onOpenChange(false); onSaved(); }
      else toast.error(res.error);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set salary{employee ? ` — ${employee.full_name}` : ""}</DialogTitle>
          <DialogDescription>Creates a new effective-dated salary structure (old ones are kept as history). Amounts in {currency}.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sal-basis">Pay basis</Label>
            <Select value={payBasis} onValueChange={(v) => setPayBasis(v as "salaried" | "hourly")}>
              <SelectTrigger id="sal-basis" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="salaried">Salaried</SelectItem><SelectItem value="hourly">Hourly</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="sal-eff">Effective from</Label><Input id="sal-eff" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} /></div>
          {payBasis === "salaried" ? (
            <div className="space-y-1.5"><Label htmlFor="sal-base">Monthly base salary</Label><Input id="sal-base" type="number" min={0} value={base} onChange={(e) => setBase(e.target.value)} className="tabular-nums" /></div>
          ) : (
            <div className="space-y-1.5"><Label htmlFor="sal-hourly">Hourly rate</Label><Input id="sal-hourly" type="number" min={0} value={hourly} onChange={(e) => setHourly(e.target.value)} className="tabular-nums" /></div>
          )}
          <div className="space-y-1.5"><Label htmlFor="sal-ot">Overtime rate / hour</Label><Input id="sal-ot" type="number" min={0} value={otRate} onChange={(e) => setOtRate(e.target.value)} className="tabular-nums" /></div>
          <div className="space-y-1.5">
            <Label htmlFor="sal-tax">Tax profile</Label>
            <Select value={taxId || NONE} onValueChange={(v) => setTaxId(v === NONE ? "" : v)}>
              <SelectTrigger id="sal-tax" className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>No tax</SelectItem>{taxProfiles.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sal-er">Employer contribution</Label>
            <Select value={erId || NONE} onValueChange={(v) => setErId(v === NONE ? "" : v)}>
              <SelectTrigger id="sal-er" className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>None</SelectItem>{employerProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {payBasis === "salaried" ? (
            <div className="space-y-1.5"><Label htmlFor="sal-days">Standard working days / month</Label><Input id="sal-days" type="number" min={1} max={31} value={days} onChange={(e) => setDays(e.target.value)} /></div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : null} Save salary</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
