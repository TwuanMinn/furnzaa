"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CalcMaterial, FormState } from "./cost-calculator";

// ─── Shared micro-components ─────────────────────────────────────────────────

/** Small uppercase letter-spaced section label (spec layout language). */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

export function FieldHelp({
  children,
  id,
}: {
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <p id={id} className="text-xs text-muted-foreground">
      {children}
    </p>
  );
}

/** Numeric field stored as string so placeholders show through. */
export function NumField({
  id,
  label,
  value,
  onChange,
  placeholder,
  help,
  suffix,
  min,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  help?: string;
  suffix?: string;
  min?: number;
  error?: string;
}) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={min ?? 0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={suffix ? "pr-14" : undefined}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
        />
        {suffix ? (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : help ? (
        <FieldHelp id={helpId}>{help}</FieldHelp>
      ) : null}
    </div>
  );
}

// ─── Main form ───────────────────────────────────────────────────────────────

export function CalcForm({
  form,
  materials,
  onFieldChange,
  onMaterialChange,
}: {
  form: FormState;
  materials: CalcMaterial[];
  onFieldChange: (key: keyof FormState, value: string) => void;
  onMaterialChange: (key: string) => void;
}) {
  const set = (key: keyof FormState) => (v: string) => onFieldChange(key, v);

  // #16: Client-side validation — inline errors for obviously invalid values
  const validate = (field: string, value: string): string | undefined => {
    if (value === "") return undefined; // empty is ok (treated as 0)
    const n = Number(value);
    if (!Number.isFinite(n)) return "Not a valid number";
    if (n < 0) return "Cannot be negative";
    if (field === "wastePercent" && n > 500) return "Max 500%";
    if (field === "targetMarginPercent" && n > 100) return "Max 100%";
    if (field === "quantity" && n < 1) return "Min 1";
    return undefined;
  };

  return (
    <div className="space-y-4">
      {/* ── 1. PRODUCT INFO ─────────────────────────────────────── */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <SectionLabel>Product info</SectionLabel>
        <div className="space-y-1.5">
          <Label htmlFor="cc-name">Product name</Label>
          <Input
            id="cc-name"
            value={form.name}
            onChange={(e) => set("name")(e.target.value)}
            placeholder="e.g. Phone stand, Custom bracket…"
            maxLength={200}
          />
        </div>
      </section>

      {/* ── 2. MATERIAL ─────────────────────────────────────────── */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <SectionLabel>Material</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cc-material">Material type</Label>
            <Select value={form.material} onValueChange={onMaterialChange}>
              <SelectTrigger id="cc-material" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {materials.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cc-filament-cost">Filament cost</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="cc-filament-cost"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={form.filamentCostPerKg}
                  onChange={(e) => set("filamentCostPerKg")(e.target.value)}
                  placeholder={form.filamentSpoolKg === "1" ? "e.g. 300000" : form.filamentSpoolKg === "3" ? "e.g. 750000" : "e.g. 1100000"}
                  aria-describedby="cc-filament-cost-help"
                  aria-invalid={validate("filamentCostPerKg", form.filamentCostPerKg) ? true : undefined}
                />
              </div>
              <Select value={form.filamentSpoolKg || "1"} onValueChange={(v) => set("filamentSpoolKg")(v)}>
                <SelectTrigger id="cc-spool-size" className="w-28 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">₫ / 1 kg</SelectItem>
                  <SelectItem value="3">₫ / 3 kg</SelectItem>
                  <SelectItem value="5">₫ / 5 kg</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {validate("filamentCostPerKg", form.filamentCostPerKg) ? (
              <p className="text-xs text-destructive">{validate("filamentCostPerKg", form.filamentCostPerKg)}</p>
            ) : (
              <FieldHelp id="cc-filament-cost-help">
                {form.filamentSpoolKg === "1"
                  ? "Price you paid for a 1 kg spool"
                  : `Price for a ${form.filamentSpoolKg} kg spool — auto-converts to ₫/kg`}
              </FieldHelp>
            )}
          </div>
          <NumField
            id="cc-filament-used"
            label="Filament used (g)"
            value={form.filamentUsedGrams}
            onChange={set("filamentUsedGrams")}
            placeholder="e.g. 85"
            help="From your slicer"
            error={validate("filamentUsedGrams", form.filamentUsedGrams)}
          />
          <NumField
            id="cc-waste"
            label="Waste / supports (%)"
            value={form.wastePercent}
            onChange={set("wastePercent")}
            help="Extra material lost to supports/purge"
            suffix="%"
            error={validate("wastePercent", form.wastePercent)}
          />
        </div>
      </section>

      {/* ── 3. PRINTING COST ────────────────────────────────────── */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <SectionLabel>Printing cost</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField
            id="cc-hours"
            label="Print time (hours)"
            value={form.printTimeHours}
            onChange={set("printTimeHours")}
            placeholder="e.g. 4.5"
          />
          <NumField
            id="cc-elec-rate"
            label="Electricity rate (₫/kWh)"
            value={form.electricityRate}
            onChange={set("electricityRate")}
          />
          <NumField
            id="cc-watts"
            label="Printer power (watts)"
            value={form.printerWatts}
            onChange={set("printerWatts")}
            help="Average during print"
            suffix="W"
          />
          <NumField
            id="cc-labor"
            label="Labor cost (₫)"
            value={form.laborCost}
            onChange={set("laborCost")}
            help="Your time for setup, post-processing"
          />
        </div>
      </section>

      {/* ── 4. PRICING ──────────────────────────────────────────── */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <SectionLabel>Pricing</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField
            id="cc-sell"
            label="Selling price (₫)"
            value={form.sellingPrice}
            onChange={set("sellingPrice")}
            placeholder="e.g. 150000"
            error={validate("sellingPrice", form.sellingPrice)}
          />
          <NumField
            id="cc-other"
            label="Other costs (₫)"
            value={form.otherCosts}
            onChange={set("otherCosts")}
            help="Packaging, shipping…"
            error={validate("otherCosts", form.otherCosts)}
          />
          <NumField
            id="cc-target"
            label="Target margin (%)"
            value={form.targetMarginPercent}
            onChange={set("targetMarginPercent")}
            help="Warn me when margin drops below this"
            suffix="%"
            error={validate("targetMarginPercent", form.targetMarginPercent)}
          />
          <NumField
            id="cc-quantity"
            label="Quantity"
            value={form.quantity}
            onChange={set("quantity")}
            placeholder="1"
            help="Batch size — results show per-unit and total"
            min={1}
            error={validate("quantity", form.quantity)}
          />
        </div>
      </section>
    </div>
  );
}
