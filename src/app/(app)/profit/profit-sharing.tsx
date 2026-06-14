"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Copy, Download, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildCsv, downloadCsv } from "@/lib/export/csv";
import { saveProfitSharingAction } from "@/lib/profit/sharing-actions";
import {
  SHARING_CURRENCIES,
  type ProfitSharingConfig,
  type SharingCurrency,
} from "@/lib/profit/sharing";

// ── Partner colors (blue, green, orange, pink, purple, amber) ────────────────
const PALETTE = ["#3b82f6", "#22c55e", "#f97316", "#ec4899", "#a855f7", "#eab308"];

const CURRENCY_META: Record<SharingCurrency, { symbol: string; locale: string; fraction: number }> = {
  VND: { symbol: "₫", locale: "vi-VN", fraction: 0 },
  USD: { symbol: "$", locale: "en-US", fraction: 2 },
  EUR: { symbol: "€", locale: "de-DE", fraction: 2 },
  GBP: { symbol: "£", locale: "en-GB", fraction: 2 },
  JPY: { symbol: "¥", locale: "ja-JP", fraction: 0 },
};

const PRESETS: Array<{ label: string; split: [number, number] }> = [
  { label: "50/50", split: [50, 50] },
  { label: "60/40", split: [60, 40] },
  { label: "70/30", split: [70, 30] },
  { label: "75/25", split: [75, 25] },
];

interface Partner {
  id: string;
  name: string;
  percent: number;
}

function fmt(amount: number, currency: SharingCurrency): string {
  const meta = CURRENCY_META[currency];
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency,
    maximumFractionDigits: meta.fraction,
  }).format(Number.isFinite(amount) ? amount : 0);
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
    return config.partners.map((p) => ({ id: uid(), name: p.name, percent: Math.round(p.percent) }));
  }
  return [
    { id: uid(), name: "Partner 1", percent: 50 },
    { id: uid(), name: "Partner 2", percent: 50 },
  ];
}

export function ProfitSharing({
  initialConfig,
  defaultCurrency,
}: {
  initialConfig: ProfitSharingConfig | null;
  defaultCurrency: string;
}) {
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

  const total = Number(totalInput) || 0;
  const sumPercent = partners.reduce((a, p) => a + p.percent, 0);
  const balanced = sumPercent === 100;

  // ── Debounced backend auto-save (survives a browser clear) ─────────────────
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

  function updatePartner(id: string, patch: Partial<Partner>) {
    setPartners((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function addPartner() {
    setPartners((prev) => {
      if (prev.length >= 6) return prev;
      const share = 100 / (prev.length + 1);
      // Scale existing proportionally to make room, then normalize to exactly 100.
      const weights = [...prev.map((p) => p.percent * (1 - share / 100)), share];
      const balancedPercents = normalizeTo100(weights);
      return [
        ...prev.map((p, i) => ({ ...p, percent: balancedPercents[i]! })),
        { id: uid(), name: `Partner ${prev.length + 1}`, percent: balancedPercents[prev.length]! },
      ];
    });
  }

  function removePartner(id: string) {
    setPartners((prev) => {
      if (prev.length <= 2) return prev;
      const kept = prev.filter((p) => p.id !== id);
      const balancedPercents = normalizeTo100(kept.map((p) => p.percent));
      return kept.map((p, i) => ({ ...p, percent: balancedPercents[i]! }));
    });
  }

  function applyPreset(split: [number, number]) {
    setPartners((prev) =>
      prev.length === 2 ? prev.map((p, i) => ({ ...p, percent: split[i]! })) : prev,
    );
  }

  const rows = useMemo(
    () =>
      partners.map((p, i) => ({
        ...p,
        color: PALETTE[i % PALETTE.length]!,
        amount: total * (p.percent / 100),
      })),
    [partners, total],
  );

  function summaryText(): string {
    const lines = [
      `Profit Sharing — Total: ${fmt(total, currency)}`,
      ...rows.map((r) => `${r.name || `Partner`}: ${r.percent}% → ${fmt(r.amount, currency)}`),
    ];
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
    const csv = buildCsv(
      ["Partner", "Percentage", "Amount"],
      rows.map((r) => [r.name, `${r.percent}%`, r.amount.toFixed(CURRENCY_META[currency].fraction)]),
    );
    downloadCsv(`profit-sharing-${currency.toLowerCase()}.csv`, csv);
    toast.success("Exported CSV");
  }

  return (
    <div className="space-y-5">
      {/* ── Total income + currency ─────────────────────────────────────────── */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-50 space-y-1.5">
            <Label htmlFor="ps-total">Total amount to split</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {CURRENCY_META[currency].symbol}
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
                    {CURRENCY_META[c].symbol} {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex h-9 items-center gap-1.5 text-xs text-muted-foreground">
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

      {/* ── Partners & split ────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Partners &amp; split</h3>
              <span className="text-xs text-muted-foreground">({partners.length} of 6)</span>
            </div>
            <Button variant="outline" size="sm" onClick={addPartner} disabled={partners.length >= 6}>
              <Plus /> Add partner
            </Button>
          </div>

          {/* Presets (2-partner splits) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Presets:</span>
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                size="xs"
                disabled={partners.length !== 2}
                onClick={() => applyPreset(preset.split)}
                title={partners.length !== 2 ? "Presets apply to a 2-partner split" : undefined}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Partner rows */}
          <div className="space-y-2.5">
            {rows.map((r) => (
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
                  onChange={(e) => updatePartner(r.id, { name: e.target.value })}
                  className="h-9 w-full sm:w-44"
                />
                <input
                  type="range"
                  aria-label={`${r.name} percentage`}
                  min={0}
                  max={100}
                  value={r.percent}
                  onChange={(e) => updatePartner(r.id, { percent: Number(e.target.value) })}
                  style={{ accentColor: r.color }}
                  className="h-9 flex-1 cursor-pointer"
                />
                <div className="relative w-20 shrink-0">
                  <Input
                    type="number"
                    aria-label={`${r.name} percentage value`}
                    min={0}
                    max={100}
                    value={r.percent}
                    onChange={(e) =>
                      updatePartner(r.id, {
                        percent: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))),
                      })
                    }
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
            ))}
          </div>

          {/* Split bar */}
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

          {/* 100% warning */}
          {!balanced ? (
            <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
              <AlertTriangle className="size-4 shrink-0 text-warning" />
              <span>
                Percentages add up to <span className="font-semibold tabular-nums">{sumPercent}%</span>, not
                100% — adjust the splits so they total 100%.
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Summary ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Summary</h3>
            <div className="flex gap-2">
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
        </CardContent>
      </Card>
    </div>
  );
}
