"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { badgeClass } from "@/lib/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  deleteEmployerProfileAction,
  deletePayrollDepartmentAction,
  deleteTaxProfileAction,
  savePayrollDepartmentAction,
  saveEmployerProfileAction,
  saveTaxProfileAction,
  setPayrollDepartmentActiveAction,
} from "@/lib/settings/actions";
import { ColorSelect } from "./orders-shared";
import type { PayrollHrData } from "./types";

type DeptRow = { id: string; name: string; color: string; isActive: boolean };
type TaxRow = { id: string; name: string; kind: "none" | "flat" | "fixed"; ratePercent: number; fixedAmount: number; isActive: boolean };
type ErRow = { id: string; name: string; ratePercent: number; isActive: boolean };

export function PayrollSection({ data, canEdit }: { data: PayrollHrData; canEdit: boolean }) {
  return (
    <div className="space-y-4">
      <DepartmentList items={data.departments} canEdit={canEdit} />
      <TaxProfileList items={data.taxProfiles} canEdit={canEdit} currency={data.currency} />
      <EmployerProfileList items={data.employerProfiles} canEdit={canEdit} />
    </div>
  );
}

// ── Departments ────────────────────────────────────────────────────────────────

function DepartmentList({ items, canEdit }: { items: DeptRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<DeptRow[]>(items);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("blue");
  const [busy, setBusy] = useState<string | null>(null);

  async function saveRow(row: DeptRow) {
    setBusy(row.id);
    try {
      const res = await savePayrollDepartmentAction({ id: row.id, name: row.name, color: row.color });
      if (res.ok) { toast.success("Department updated"); router.refresh(); }
      else toast.error(res.error);
    } finally { setBusy(null); }
  }
  async function add() {
    const name = newName.trim();
    if (!name) return;
    setBusy("new");
    try {
      const res = await savePayrollDepartmentAction({ name, color: newColor });
      if (res.ok && res.data) { setRows((p) => [...p, { id: res.data!.id, name, color: newColor, isActive: true }]); setNewName(""); router.refresh(); }
      else if (!res.ok) toast.error(res.error);
    } finally { setBusy(null); }
  }
  async function toggle(row: DeptRow) {
    const res = await setPayrollDepartmentActiveAction(row.id, !row.isActive);
    if (res.ok) { setRows((p) => p.map((r) => (r.id === row.id ? { ...r, isActive: !r.isActive } : r))); router.refresh(); }
    else toast.error(res.error);
  }
  async function remove(row: DeptRow) {
    const res = await deletePayrollDepartmentAction(row.id);
    if (res.ok) { setRows((p) => p.filter((r) => r.id !== row.id)); router.refresh(); }
    else toast.error(res.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Departments</CardTitle>
        <CardDescription>Shared with User Management; the grouping dimension for salary-cost analytics.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No departments yet.</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className={cn("flex flex-wrap items-center gap-2", !row.isActive && "opacity-55")}>
              <span className={cn("inline-block size-3 shrink-0 rounded-full ring-1 ring-inset", badgeClass(row.color))} aria-hidden />
              <Input value={row.name} maxLength={80} disabled={!canEdit} aria-label="Department name" className="h-8 w-48" onChange={(e) => setRows((p) => p.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)))} />
              <ColorSelect value={row.color} onChange={(c) => setRows((p) => p.map((r) => (r.id === row.id ? { ...r, color: c } : r)))} disabled={!canEdit} className="h-8 w-28" ariaLabel={`${row.name || "department"} color`} />
              {canEdit ? (
                <>
                  <Button type="button" variant="outline" size="sm" disabled={busy === row.id} onClick={() => void saveRow(row)}>{busy === row.id ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}</Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => void toggle(row)} aria-label={row.isActive ? `Hide ${row.name}` : `Show ${row.name}`}>{row.isActive ? <Eye className="size-4 text-muted-foreground" /> : <EyeOff className="size-4 text-muted-foreground" />}</Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => void remove(row)} aria-label={`Remove ${row.name}`}><Trash2 className="size-4 text-muted-foreground hover:text-destructive" /></Button>
                </>
              ) : null}
            </div>
          ))
        )}
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Input value={newName} maxLength={80} placeholder="New department" onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }} className="h-8 w-48" />
            <ColorSelect value={newColor} onChange={setNewColor} className="h-8 w-28" ariaLabel="New color" />
            <Button type="button" variant="outline" size="sm" disabled={busy === "new" || !newName.trim()} onClick={() => void add()}>{busy === "new" ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-4" />} Add</Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── Tax profiles ─────────────────────────────────────────────────────────────

const KIND_LABEL: Record<TaxRow["kind"], string> = { none: "No tax", flat: "Flat %", fixed: "Fixed amount" };

function TaxProfileList({ items, canEdit, currency }: { items: TaxRow[]; canEdit: boolean; currency: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<TaxRow[]>(items);
  const [draft, setDraft] = useState<{ name: string; kind: TaxRow["kind"]; rate: string; fixed: string }>({ name: "", kind: "flat", rate: "10", fixed: "0" });
  const [busy, setBusy] = useState<string | null>(null);

  async function saveRow(row: TaxRow) {
    setBusy(row.id);
    try {
      const res = await saveTaxProfileAction({ id: row.id, name: row.name, kind: row.kind, ratePercent: row.ratePercent, fixedAmount: row.fixedAmount });
      if (res.ok) { toast.success("Tax profile updated"); router.refresh(); }
      else toast.error(res.error);
    } finally { setBusy(null); }
  }
  async function add() {
    if (!draft.name.trim()) return;
    setBusy("new");
    try {
      const res = await saveTaxProfileAction({ name: draft.name.trim(), kind: draft.kind, ratePercent: Number(draft.rate) || 0, fixedAmount: Number(draft.fixed) || 0 });
      if (res.ok && res.data) {
        setRows((p) => [...p, { id: res.data!.id, name: draft.name.trim(), kind: draft.kind, ratePercent: Number(draft.rate) || 0, fixedAmount: Number(draft.fixed) || 0, isActive: true }]);
        setDraft({ name: "", kind: "flat", rate: "10", fixed: "0" });
        router.refresh();
      } else if (!res.ok) toast.error(res.error);
    } finally { setBusy(null); }
  }
  async function remove(row: TaxRow) {
    const res = await deleteTaxProfileAction(row.id);
    if (res.ok) { setRows((p) => p.filter((r) => r.id !== row.id)); router.refresh(); }
    else toast.error(res.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tax profiles</CardTitle>
        <CardDescription>Applied to the taxable base during a payroll run. Amounts in {currency}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className={cn("flex flex-wrap items-center gap-2", !row.isActive && "opacity-55")}>
            <Input value={row.name} maxLength={80} disabled={!canEdit} aria-label="Tax profile name" className="h-8 w-40" onChange={(e) => setRows((p) => p.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)))} />
            <Select value={row.kind} disabled={!canEdit} onValueChange={(v) => setRows((p) => p.map((r) => (r.id === row.id ? { ...r, kind: v as TaxRow["kind"] } : r)))}>
              <SelectTrigger className="h-8 w-32" aria-label="Tax kind"><SelectValue /></SelectTrigger>
              <SelectContent>{(["none", "flat", "fixed"] as const).map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}</SelectContent>
            </Select>
            {row.kind === "flat" ? (
              <div className="flex items-center gap-1"><Input type="number" min={0} max={100} value={String(row.ratePercent)} disabled={!canEdit} aria-label="Rate %" className="h-8 w-20 tabular-nums" onChange={(e) => setRows((p) => p.map((r) => (r.id === row.id ? { ...r, ratePercent: Number(e.target.value) || 0 } : r)))} /><span className="text-sm text-muted-foreground">%</span></div>
            ) : row.kind === "fixed" ? (
              <Input type="number" min={0} value={String(row.fixedAmount)} disabled={!canEdit} aria-label="Fixed amount" className="h-8 w-28 tabular-nums" onChange={(e) => setRows((p) => p.map((r) => (r.id === row.id ? { ...r, fixedAmount: Number(e.target.value) || 0 } : r)))} />
            ) : null}
            {canEdit ? (
              <>
                <Button type="button" variant="outline" size="sm" disabled={busy === row.id} onClick={() => void saveRow(row)}>{busy === row.id ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}</Button>
                <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => void remove(row)} aria-label={`Remove ${row.name}`}><Trash2 className="size-4 text-muted-foreground hover:text-destructive" /></Button>
              </>
            ) : null}
          </div>
        ))}
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Input value={draft.name} maxLength={80} placeholder="New tax profile" className="h-8 w-40" onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            <Select value={draft.kind} onValueChange={(v) => setDraft((d) => ({ ...d, kind: v as TaxRow["kind"] }))}>
              <SelectTrigger className="h-8 w-32" aria-label="New tax kind"><SelectValue /></SelectTrigger>
              <SelectContent>{(["none", "flat", "fixed"] as const).map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}</SelectContent>
            </Select>
            {draft.kind === "flat" ? (
              <div className="flex items-center gap-1"><Input type="number" min={0} max={100} value={draft.rate} className="h-8 w-20 tabular-nums" onChange={(e) => setDraft((d) => ({ ...d, rate: e.target.value }))} /><span className="text-sm text-muted-foreground">%</span></div>
            ) : draft.kind === "fixed" ? (
              <Input type="number" min={0} value={draft.fixed} placeholder="Amount" className="h-8 w-28 tabular-nums" onChange={(e) => setDraft((d) => ({ ...d, fixed: e.target.value }))} />
            ) : null}
            <Button type="button" variant="outline" size="sm" disabled={busy === "new" || !draft.name.trim()} onClick={() => void add()}>{busy === "new" ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-4" />} Add</Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── Employer contribution profiles ───────────────────────────────────────────

function EmployerProfileList({ items, canEdit }: { items: ErRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<ErRow[]>(items);
  const [newName, setNewName] = useState("");
  const [newRate, setNewRate] = useState("17.5");
  const [busy, setBusy] = useState<string | null>(null);

  async function saveRow(row: ErRow) {
    setBusy(row.id);
    try {
      const res = await saveEmployerProfileAction({ id: row.id, name: row.name, ratePercent: row.ratePercent });
      if (res.ok) { toast.success("Profile updated"); router.refresh(); }
      else toast.error(res.error);
    } finally { setBusy(null); }
  }
  async function add() {
    if (!newName.trim()) return;
    setBusy("new");
    try {
      const res = await saveEmployerProfileAction({ name: newName.trim(), ratePercent: Number(newRate) || 0 });
      if (res.ok && res.data) { setRows((p) => [...p, { id: res.data!.id, name: newName.trim(), ratePercent: Number(newRate) || 0, isActive: true }]); setNewName(""); router.refresh(); }
      else if (!res.ok) toast.error(res.error);
    } finally { setBusy(null); }
  }
  async function remove(row: ErRow) {
    const res = await deleteEmployerProfileAction(row.id);
    if (res.ok) { setRows((p) => p.filter((r) => r.id !== row.id)); router.refresh(); }
    else toast.error(res.error);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Employer contributions</CardTitle>
        <CardDescription>Employer-side social insurance / benefits — a flat % of gross added to employer cost.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className={cn("flex flex-wrap items-center gap-2", !row.isActive && "opacity-55")}>
            <Input value={row.name} maxLength={80} disabled={!canEdit} aria-label="Profile name" className="h-8 w-48" onChange={(e) => setRows((p) => p.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)))} />
            <div className="flex items-center gap-1"><Input type="number" min={0} max={100} value={String(row.ratePercent)} disabled={!canEdit} aria-label="Rate %" className="h-8 w-20 tabular-nums" onChange={(e) => setRows((p) => p.map((r) => (r.id === row.id ? { ...r, ratePercent: Number(e.target.value) || 0 } : r)))} /><span className="text-sm text-muted-foreground">%</span></div>
            {canEdit ? (
              <>
                <Button type="button" variant="outline" size="sm" disabled={busy === row.id} onClick={() => void saveRow(row)}>{busy === row.id ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}</Button>
                <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => void remove(row)} aria-label={`Remove ${row.name}`}><Trash2 className="size-4 text-muted-foreground hover:text-destructive" /></Button>
              </>
            ) : null}
          </div>
        ))}
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Input value={newName} maxLength={80} placeholder="New contribution profile" className="h-8 w-48" onChange={(e) => setNewName(e.target.value)} />
            <div className="flex items-center gap-1"><Input type="number" min={0} max={100} value={newRate} className="h-8 w-20 tabular-nums" onChange={(e) => setNewRate(e.target.value)} /><span className="text-sm text-muted-foreground">%</span></div>
            <Button type="button" variant="outline" size="sm" disabled={busy === "new" || !newName.trim()} onClick={() => void add()}>{busy === "new" ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-4" />} Add</Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
