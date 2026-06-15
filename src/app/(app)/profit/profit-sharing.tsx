"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Copy, Download, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { buildCsv, downloadCsv } from "@/lib/export/csv";
import { saveProfitSharingAction } from "@/lib/profit/sharing-actions";
import { saveProfitSharingRecordAction } from "@/lib/profit/sharing-record-actions";
import {
  SHARING_CURRENCIES,
  CURRENCY_FRACTION,
  SHARING_PALETTE as PALETTE,
  allocateAmounts,
  formatSharingMoney as fmt,
  type ProfitSharingConfig,
  type SharingCurrency,
  type SavedSharingRecord,
} from "@/lib/profit/sharing";
import { ProfitSharingRecords, SHARING_RECORDS_KEY } from "./profit-sharing-records";

const MAX_PARTNERS = 10;

const CURRENCY_SYMBOL: Record<SharingCurrency, string> = {
  VND: "₫",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
};

/** Built-in splits. A preset is offered only when its length matches the current
 *  partner count; "Even" (below) works for any count. Each split sums to 100. */
const PRESETS: Array<{ label: string; split: number[] }> = [
  { label: "50/50", split: [50, 50] },
  { label: "60/40", split: [60, 40] },
  { label: "70/30", split: [70, 30] },
  { label: "75/25", split: [75, 25] },
  { label: "80/20", split: [80, 20] },
  { label: "90/10", split: [90, 10] },
  { label: "40/30/30", split: [40, 30, 30] },
  { label: "50/30/20", split: [50, 30, 20] },
  { label: "60/20/20", split: [60, 20, 20] },
  { label: "25×4", split: [25, 25, 25, 25] },
  { label: "40/30/20/10", split: [40, 30, 20, 10] },
];

interface Partner {
  id: string;
  name: string;
  percent: number;
}

/** Distribute integer percentages summing to exactly 100 (largest-remainder). */
function normalizeTo100(weights: number[]): number[] {
  const n = weights.length;
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const base = Math.floor(100 / n);
    const out = weights.map(() => base);
    let rem = 100 - base * n;
    for (let i = 0; rem > 0; i = (i + 1) % n, rem--) out[i] = (out[i] ?? base) + 1;
    return out;
  }
  const exact = weights.map((w) => (w / sum) * 100);
  const out = exact.map(Math.floor);
  const rem = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rem; k++) {
    const idx = order[k % order.length]!.i;
    out[idx] = (out[idx] ?? 0) + 1;
  }
  return out;
}

function uid(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `p-${Math.round(performance.now() * 1000)}`;
}

function initialPartners(config: ProfitSharingConfig | null): Partner[] {
  if (config?.partners && config.partners.length >= 2) {
    const ps = config.partners
      .slice(0, MAX_PARTNERS)
      .map((p) => ({ id: uid(), name: p.name, percent: Math.max(0, Math.round(p.percent)) }));
    // Clean up any legacy config that summed to >100 (the old un-capped model).
    if (ps.reduce((a, p) => a + p.percent, 0) > 100) {
      const bal = normalizeTo100(ps.map((p) => p.percent));
      return ps.map((p, i) => ({ ...p, percent: bal[i]! }));
    }
    return ps;
  }
  return [
    { id: uid(), name: "Partner 1", percent: 50 },
    { id: uid(), name: "Partner 2", percent: 50 },
  ];
}

export function ProfitSharing({
  initialConfig,
  defaultCurrency,
  dateFormat,
  timeFormat,
}: {
  initialConfig: ProfitSharingConfig | null;
  defaultCurrency: string;
  dateFormat: string;
  timeFormat: string;
}) {
  const reduce = useReducedMotion();
  const queryClient = useQueryClient();

  const [view, setView] = useState<"calculator" | "records">("calculator");
  const [partners, setPartners] = useState<Partner[]>(() => initialPartners(initialConfig));
  const [currency, setCurrency] = useState<SharingCurrency>(() => {
    const fromConfig = initialConfig?.currency;
    if (fromConfig && (SHARING_CURRENCIES as readonly string[]).includes(fromConfig)) return fromConfig;
    return (SHARING_CURRENCIES as readonly string[]).includes(defaultCurrency)
      ? (defaultCurrency as SharingCurrency)
      : "VND";
  });
  const [totalInput, setTotalInput] = useState<string>(() =>
    initialConfig?.total ? String(initialConfig.total) : "",
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // ── "Save as record" dialog ────────────────────────────────────────────────
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordLabel, setRecordLabel] = useState("");
  const [recordNote, setRecordNote] = useState("");
  const [recording, setRecording] = useState(false);

  // Negative / NaN inputs collapse to 0 so a stray "-" can never flip the split.
  const total = Math.max(0, Number(totalInput) || 0);
  const sumPercent = partners.reduce((a, p) => a + p.percent, 0);
  const remainingPercent = Math.max(0, 100 - sumPercent);

  // ── Debounced backend auto-save of the WORKING split (survives a clear) ─────
  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    setSaveState("saving");
    const t = setTimeout(() => {
      void saveProfitSharingAction({
        partners: partners.map((p) => ({ name: p.name, percent: p.percent })),
        currency,
        total,
      })
        .then((r) => setSaveState(r.ok ? "saved" : "error"))
        .catch(() => setSaveState("error"));
    }, 700);
    return () => clearTimeout(t);
  }, [partners, currency, total]);

  function updateName(id: string, name: string) {
    setPartners((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  }

  /**
   * Set a partner's share, CLAMPED to the budget left by everyone else. This is
   * the whole model: the splits can never exceed 100% — a partner can only take
   * what's still unallocated (e.g. with one partner at 60, another caps at 40).
   */
  function setPercent(id: string, raw: number) {
    setPartners((prev) => {
      const others = prev.reduce((a, p) => (p.id === id ? a : a + p.percent), 0);
      const cap = Math.max(0, 100 - others);
      const value = Math.max(0, Math.min(cap, Math.round(raw) || 0));
      return prev.map((p) => (p.id === id ? { ...p, percent: value } : p));
    });
  }

  function addPartner() {
    setPartners((prev) => {
      if (prev.length >= MAX_PARTNERS) return prev;
      const sum = prev.reduce((a, p) => a + p.percent, 0);
      // New partner takes whatever is still unallocated (0 when fully split).
      const remainder = Math.max(0, 100 - sum);
      return [...prev, { id: uid(), name: `Partner ${prev.length + 1}`, percent: remainder }];
    });
  }

  function removePartner(id: string) {
    // Non-destructive: the removed share simply returns to the unallocated pool;
    // everyone else keeps the percentage they were given.
    setPartners((prev) => (prev.length <= 2 ? prev : prev.filter((p) => p.id !== id)));
  }

  /** Apply a preset whose length matches the current partner count. */
  function applyPreset(split: number[]) {
    setPartners((prev) =>
      prev.length === split.length ? prev.map((p, i) => ({ ...p, percent: split[i]! })) : prev,
    );
  }

  /** Even split across every partner — works for any count (2–10). */
  function evenSplit() {
    setPartners((prev) => {
      const bal = normalizeTo100(prev.map(() => 1));
      return prev.map((p, i) => ({ ...p, percent: bal[i]! }));
    });
  }

  const { rows, remainingAmount, allocatedSum } = useMemo(() => {
    const fraction = CURRENCY_FRACTION[currency];
    const remPct = Math.max(0, 100 - sumPercent);
    const alloc = allocateAmounts(total, [...partners.map((p) => p.percent), remPct], fraction);
    const built = partners.map((p, i) => ({
      ...p,
      color: PALETTE[i % PALETTE.length]!,
      amount: alloc[i] ?? 0,
    }));
    return {
      rows: built,
      remainingAmount: alloc[partners.length] ?? 0,
      allocatedSum: built.reduce((s, r) => s + r.amount, 0),
    };
  }, [partners, total, currency, sumPercent]);

  function summaryText(): string {
    const lines = [
      `Profit Sharing — Total: ${fmt(total, currency)}`,
      ...rows.map((r) => `${r.name || `Partner`}: ${r.percent}% → ${fmt(r.amount, currency)}`),
    ];
    if (remainingPercent > 0) {
      lines.push(`Unallocated: ${remainingPercent}% → ${fmt(remainingAmount, currency)}`);
    }
    return lines.join("\n");
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }

  function exportCsv() {
    const fraction = CURRENCY_FRACTION[currency];
    const dataRows = rows.map((r) => [r.name, `${r.percent}%`, r.amount.toFixed(fraction)]);
    if (remainingPercent > 0) {
      dataRows.push(["Unallocated", `${remainingPercent}%`, remainingAmount.toFixed(fraction)]);
    }
    const csv = buildCsv(["Partner", "Percentage", "Amount"], dataRows);
    downloadCsv(`profit-sharing-${currency.toLowerCase()}.csv`, csv);
    toast.success("Exported CSV");
  }

  /** Persist the current split as a record in the shared collection. */
  async function saveRecord() {
    setRecording(true);
    try {
      const res = await saveProfitSharingRecordAction({
        label: recordLabel,
        note: recordNote,
        currency,
        total,
        partners: partners.map((p) => ({ name: p.name, percent: p.percent })),
      });
      if (res.ok) {
        toast.success("Saved to records");
        setRecordOpen(false);
        setRecordLabel("");
        setRecordNote("");
        queryClient.invalidateQueries({ queryKey: SHARING_RECORDS_KEY }).catch(console.error);
        setView("records");
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Failed to save record");
    } finally {
      setRecording(false);
    }
  }

  /** Load a saved record back into the calculator. */
  function loadRecord(rec: SavedSharingRecord) {
    setPartners(
      rec.partners
        .slice(0, MAX_PARTNERS)
        .map((p) => ({ id: uid(), name: p.name, percent: Math.max(0, Math.min(100, Math.round(p.percent))) })),
    );
    if ((SHARING_CURRENCIES as readonly string[]).includes(rec.currency)) setCurrency(rec.currency);
    setTotalInput(rec.total ? String(rec.total) : "");
    setView("calculator");
    toast.success(`Loaded “${rec.label || "Untitled split"}”`);
  }

  return (
    <div className="space-y-5">
      {/* ── Calculator | Records sub-tabs ───────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Profit Sharing sections"
        className="relative grid w-full max-w-sm grid-cols-2 rounded-xl border border-border bg-muted/40 p-1"
      >
        {(["calculator", "records"] as const).map((v) => (
          <button
            key={v}
            role="tab"
            type="button"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              "relative z-10 rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors",
              view === v ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {view === v ? (
              <motion.span
                layoutId="sharing-subtab"
                transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.35, bounce: 0.15 }}
                className="absolute inset-0 -z-10 rounded-lg bg-background shadow-sm ring-1 ring-border"
              />
            ) : null}
            {v === "records" ? "Records" : "Calculator"}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {view === "records" ? (
          <motion.div
            key="records"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <ProfitSharingRecords dateFormat={dateFormat} timeFormat={timeFormat} onLoad={loadRecord} />
          </motion.div>
        ) : (
          <motion.div
            key="calculator"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="space-y-5"
          >
            {/* ── Total income + currency ───────────────────────────────────── */}
            <Card>
              <CardContent className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-50 space-y-1.5">
                  <Label htmlFor="ps-total">Total amount to split</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      {CURRENCY_SYMBOL[currency]}
                    </span>
                    <Input
                      id="ps-total"
                      type="number"
                      min={0}
                      inputMode="decimal"
                      placeholder="0"
                      value={totalInput}
                      onChange={(e) => setTotalInput(e.target.value)}
                      className="pl-7 tabular-nums"
                    />
                  </div>
                </div>
                <div className="w-40 space-y-1.5">
                  <Label htmlFor="ps-currency">Currency</Label>
                  <Select value={currency} onValueChange={(v) => setCurrency(v as SharingCurrency)}>
                    <SelectTrigger id="ps-currency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHARING_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CURRENCY_SYMBOL[c]} {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div
                  aria-live="polite"
                  className="ml-auto flex h-9 items-center gap-1.5 text-xs text-muted-foreground"
                >
                  {saveState === "saving" ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Saving…
                    </>
                  ) : saveState === "saved" ? (
                    <>
                      <Check className="size-3.5 text-success" /> Saved
                    </>
                  ) : saveState === "error" ? (
                    <span className="text-destructive">Save failed</span>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            {/* ── Partners & split ──────────────────────────────────────────── */}
            <Card>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Partners &amp; split</h3>
                    <span className="text-xs text-muted-foreground">
                      ({partners.length} of {MAX_PARTNERS})
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addPartner}
                    disabled={partners.length >= MAX_PARTNERS}
                  >
                    <Plus /> Add partner
                  </Button>
                </div>

                {/* Presets — "Even" works for any count; ratio presets match the count */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Presets:</span>
                  <Button variant="outline" size="xs" onClick={evenSplit}>
                    Even
                  </Button>
                  {PRESETS.filter((preset) => preset.split.length === partners.length).map((preset) => (
                    <Button
                      key={preset.label}
                      variant="outline"
                      size="xs"
                      onClick={() => applyPreset(preset.split)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>

                {/* Partner rows */}
                <div className="space-y-2.5">
                  {rows.map((r) => {
                    const others = sumPercent - r.percent;
                    const cap = Math.max(0, 100 - others); // most this partner may take
                    return (
                      <div key={r.id} className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                        <span
                          className="size-3 shrink-0 rounded-full"
                          style={{ backgroundColor: r.color }}
                          aria-hidden
                        />
                        <Input
                          aria-label="Partner name"
                          value={r.name}
                          maxLength={60}
                          placeholder="Partner name"
                          onChange={(e) => updateName(r.id, e.target.value)}
                          className="h-9 w-full sm:w-44"
                        />
                        <input
                          type="range"
                          aria-label={`${r.name} percentage`}
                          min={0}
                          max={100}
                          value={r.percent}
                          onChange={(e) => setPercent(r.id, Number(e.target.value))}
                          style={{ accentColor: r.color }}
                          className="h-9 flex-1 cursor-pointer"
                        />
                        <div className="relative w-20 shrink-0">
                          <Input
                            type="number"
                            aria-label={`${r.name} percentage value`}
                            min={0}
                            max={cap}
                            value={r.percent}
                            onChange={(e) => setPercent(r.id, Number(e.target.value))}
                            className="h-9 pr-6 tabular-nums"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            %
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${r.name}`}
                          disabled={partners.length <= 2}
                          onClick={() => removePartner(r.id)}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {/* Split bar — partner shares fill from the left; the muted track that
                    remains is the unallocated budget. */}
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                  {rows.map((r) =>
                    r.percent > 0 ? (
                      <div
                        key={r.id}
                        className="h-full transition-[width] duration-300"
                        style={{ width: `${r.percent}%`, backgroundColor: r.color }}
                        title={`${r.name}: ${r.percent}%`}
                      />
                    ) : null,
                  )}
                </div>

                {/* Allocation status (gentle, not a warning — the splits can't exceed 100) */}
                {remainingPercent > 0 ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-block size-2 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden />
                    <span className="tabular-nums">{remainingPercent}%</span> unallocated
                    {total > 0 ? <span className="tabular-nums"> · {fmt(remainingAmount, currency)}</span> : null} —
                    drag a slider up or pick a preset to assign it.
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-success">
                    <Check className="size-3.5 shrink-0" /> Fully allocated
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ── Summary ───────────────────────────────────────────────────── */}
            <Card>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Summary</h3>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setRecordOpen(true)}>
                      <Save /> Save as record
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void copy(summaryText(), "Full summary")}>
                      <Copy /> Copy full summary
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportCsv}>
                      <Download /> Export CSV
                    </Button>
                  </div>
                </div>

                {/* Metric cards */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl border border-border p-3"
                      style={{ borderLeft: `3px solid ${r.color}` }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{r.name || "Partner"}</span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Copy ${r.name} share`}
                          onClick={() =>
                            void copy(`${r.name}: ${r.percent}% → ${fmt(r.amount, currency)}`, r.name || "Share")
                          }
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Copy />
                        </Button>
                      </div>
                      <div className="mt-1 text-lg font-semibold tabular-nums">{fmt(r.amount, currency)}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">{r.percent}% of total</div>
                    </div>
                  ))}
                </div>

                {/* Proportional bar chart */}
                <div className="space-y-2 pt-1">
                  {rows.map((r) => (
                    <div key={r.id} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{r.name || "Partner"}</span>
                      <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
                        <div
                          className="flex h-full items-center justify-end rounded px-2 text-[10px] font-semibold text-white transition-[width] duration-300"
                          style={{ width: `${Math.max(r.percent, 2)}%`, backgroundColor: r.color }}
                        >
                          {r.percent >= 8 ? `${r.percent}%` : ""}
                        </div>
                      </div>
                      <span className="w-28 shrink-0 text-right text-xs font-medium tabular-nums">
                        {fmt(r.amount, currency)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Reconciliation — partner amounts always sum to the allocated pot */}
                <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                  <span className="font-medium">Total allocated</span>
                  <span className="font-semibold tabular-nums">
                    {fmt(allocatedSum, currency)}
                    {total > 0 ? (
                      <span className="text-muted-foreground"> of {fmt(total, currency)}</span>
                    ) : null}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Save-as-record dialog ───────────────────────────────────────────── */}
      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this split as a record</DialogTitle>
            <DialogDescription>
              Snapshots the current split ({partners.length} partners · {fmt(total, currency)}) into the
              shared records collection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ps-record-label">Label</Label>
              <Input
                id="ps-record-label"
                value={recordLabel}
                maxLength={120}
                placeholder="e.g. Q2 2026 distribution"
                onChange={(e) => setRecordLabel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-record-note">Note (optional)</Label>
              <Textarea
                id="ps-record-note"
                value={recordNote}
                maxLength={2000}
                placeholder="Anything worth remembering about this distribution…"
                onChange={(e) => setRecordNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordOpen(false)} disabled={recording}>
              Cancel
            </Button>
            <Button onClick={() => void saveRecord()} disabled={recording}>
              {recording ? <Loader2 className="animate-spin" /> : <Save />}
              Save record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
