"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toDateKey } from "@/lib/format";
import { createInvestmentAction, recordCashflowAction } from "@/lib/roi/actions";
import type { FlowType } from "@/lib/roi/types";

export type RefOption = { id: string; name: string; color: string };
export type ProductOption = { id: string; name: string; sku: string };

const NONE = "__none__";
const STATUS_OPTIONS = ["active", "recovered", "paused", "closed"] as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function InvestmentDialog({
  open,
  onOpenChange,
  categories,
  projects,
  products,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: RefOption[];
  projects: RefOption[];
  products: ProductOption[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [startDate, setStartDate] = useState(toDateKey(0));
  const [payback, setPayback] = useState("");
  const [status, setStatus] = useState<string>("active");
  const [description, setDescription] = useState("");
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [productFilter, setProductFilter] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setName("");
    setCategoryId("");
    setProjectId("");
    setStartDate(toDateKey(0));
    setPayback("");
    setStatus("active");
    setDescription("");
    setLinked(new Set());
    setProductFilter("");
  }

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setBusy(true);
    try {
      const res = await createInvestmentAction({
        name: name.trim(),
        categoryId: categoryId || null,
        projectId: projectId || null,
        startDate,
        expectedPaybackMonths: payback ? Number(payback) : null,
        status,
        description: description.trim(),
        notes: "",
        attributionProductIds: [...linked],
      });
      if (res.ok) {
        toast.success("Investment created");
        reset();
        onOpenChange(false);
        onSaved();
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Failed to create investment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New investment</DialogTitle>
          <DialogDescription>Track capital, revenue and recovery for a project or business line.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="inv-name">Name</Label>
            <Input id="inv-name" value={name} maxLength={200} placeholder="e.g. CNC machine line" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-cat">Category</Label>
            <Select value={categoryId || NONE} onValueChange={(v) => setCategoryId(v === NONE ? "" : v)}>
              <SelectTrigger id="inv-cat" className="w-full">
                <SelectValue placeholder="No category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No category</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-proj">Project / business</Label>
            <Select value={projectId || NONE} onValueChange={(v) => setProjectId(v === NONE ? "" : v)}>
              <SelectTrigger id="inv-proj" className="w-full">
                <SelectValue placeholder="No project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-start">Start date</Label>
            <Input id="inv-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-payback">Expected payback (months)</Label>
            <Input id="inv-payback" type="number" min={0} value={payback} placeholder="Optional" onChange={(e) => setPayback(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="inv-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="inv-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{cap(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="inv-desc">Description</Label>
            <Textarea id="inv-desc" value={description} maxLength={4000} rows={2} placeholder="Optional notes about this investment…" onChange={(e) => setDescription(e.target.value)} />
          </div>
          {products.length > 0 ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Linked products (auto-attribution)</Label>
              <p className="text-xs text-muted-foreground">
                Delivered &amp; paid order revenue for these products rolls in automatically (when auto-attribution is enabled in Settings).
              </p>
              <Input
                value={productFilter}
                placeholder="Search products…"
                onChange={(e) => setProductFilter(e.target.value)}
                className="h-8"
              />
              <div className="max-h-40 overflow-y-auto rounded-md border border-border p-1">
                {products
                  .filter((p) => {
                    const q = productFilter.trim().toLowerCase();
                    return !q || `${p.name} ${p.sku}`.toLowerCase().includes(q);
                  })
                  .slice(0, 100)
                  .map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent">
                      <Checkbox
                        checked={linked.has(p.id)}
                        onCheckedChange={(v) =>
                          setLinked((prev) => {
                            const next = new Set(prev);
                            if (v === true) next.add(p.id);
                            else next.delete(p.id);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{p.sku}</span>
                    </label>
                  ))}
              </div>
              {linked.size > 0 ? (
                <p className="text-xs text-muted-foreground">{linked.size} product{linked.size === 1 ? "" : "s"} linked</p>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CURRENCY_SYMBOL: Record<string, string> = { VND: "₫", USD: "$", EUR: "€", GBP: "£", JPY: "¥" };

export function CashflowDialog({
  open,
  onOpenChange,
  investmentId,
  investmentName,
  currency,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  investmentId: string;
  investmentName: string;
  currency: string;
  onSaved: () => void;
}) {
  const [flowType, setFlowType] = useState<FlowType>("revenue");
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState(toDateKey(0));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const symbol = CURRENCY_SYMBOL[currency.toUpperCase()] ?? "";

  async function save() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter an amount greater than 0");
      return;
    }
    setBusy(true);
    try {
      const res = await recordCashflowAction({
        investmentId,
        flowType,
        amount: value,
        entryDate,
        notes: notes.trim(),
      });
      if (res.ok) {
        toast.success("Entry recorded");
        setAmount("");
        setNotes("");
        onOpenChange(false);
        onSaved();
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Failed to record entry");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add ledger entry</DialogTitle>
          <DialogDescription>Record capital, revenue or a cost against “{investmentName}”.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cf-type">Type</Label>
            <Select value={flowType} onValueChange={(v) => setFlowType(v as FlowType)}>
              <SelectTrigger id="cf-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="capital">Capital (invested)</SelectItem>
                <SelectItem value="revenue">Revenue (recovered)</SelectItem>
                <SelectItem value="cost">Cost (operating)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-amount">Amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{symbol}</span>
              <Input id="cf-amount" type="number" min={0} inputMode="decimal" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value)} className="pl-7 tabular-nums" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-date">Date</Label>
            <Input id="cf-date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cf-notes">Notes</Label>
            <Textarea id="cf-notes" value={notes} maxLength={1000} rows={2} placeholder="Optional" onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />} Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
