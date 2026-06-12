"use client";

import { useCallback, useMemo, useReducer, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { History, Loader2, Eraser, Bookmark } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getBrowserClient } from "@/lib/supabase/client";
import {
  CALC_DEFAULTS,
  computeCalc,
  type CalcInputs,
  type SavedCalculation,
} from "@/lib/profit/calculator";
import {
  clearAllCalculationsAction,
  deleteCalculationAction,
  saveCalculationAction,
} from "@/lib/profit/calc-actions";

import { CalcForm } from "./calc-form";
import { CalcResultPanel } from "./calc-result";
import { HistoryPanel } from "./calc-history";
import { CalcErrorBoundary } from "./calc-error-boundary";

// ─── Public types ────────────────────────────────────────────────────────────

/** Material option passed from the server page (Settings list). */
export interface CalcMaterial {
  key: string;
  label: string;
  /** Stored hundredths of ₫ per gram → ₫/kg prefill = value / 100 * 1000. */
  cost_per_gram_cents: number;
}

export type FormState = Record<
  | "filamentCostPerKg" | "filamentUsedGrams" | "wastePercent" | "printTimeHours"
  | "electricityRate" | "printerWatts" | "laborCost" | "sellingPrice"
  | "otherCosts" | "targetMarginPercent" | "quantity",
  string
> & { name: string; material: string; filamentSpoolKg: string };

// ─── Reducer (#9) ────────────────────────────────────────────────────────────

type FormAction =
  | { type: "SET_FIELD"; key: keyof FormState; value: string }
  | { type: "SET_MATERIAL"; key: string; prefillCost?: string }
  | { type: "LOAD_ENTRY"; entry: SavedCalculation }
  | { type: "CLEAR"; defaultMaterial: string };

function formReducer(state: FormState, action: FormAction): FormState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.key]: action.value };
    case "SET_MATERIAL":
      return {
        ...state,
        material: action.key,
        filamentSpoolKg: "1", // prefilled cost is always ₫/kg from Settings
        ...(action.prefillCost != null ? { filamentCostPerKg: action.prefillCost } : {}),
      };
    case "LOAD_ENTRY": {
      const e = action.entry;
      return {
        name: e.name,
        material: e.material,
        filamentCostPerKg: String(Number(e.filament_cost_per_kg)),
        filamentUsedGrams: String(Number(e.filament_used_grams)),
        wastePercent: String(Number(e.waste_percent)),
        printTimeHours: String(Number(e.print_time_hours)),
        electricityRate: String(Number(e.electricity_rate)),
        printerWatts: String(Number(e.printer_watts)),
        laborCost: String(Number(e.labor_cost)),
        sellingPrice: String(Number(e.selling_price)),
        otherCosts: String(Number(e.other_costs)),
        targetMarginPercent: String(Number(e.target_margin_percent)),
        quantity: "1",
        filamentSpoolKg: "1", // saved entries always stored as ₫/kg
      };
    }
    case "CLEAR":
      return defaultsToForm(action.defaultMaterial);
    default:
      return state;
  }
}

function defaultsToForm(materialKey: string): FormState {
  return {
    name: "",
    material: materialKey,
    filamentCostPerKg: "",
    filamentUsedGrams: "",
    wastePercent: String(CALC_DEFAULTS.wastePercent),
    printTimeHours: "",
    electricityRate: String(CALC_DEFAULTS.electricityRate),
    printerWatts: String(CALC_DEFAULTS.printerWatts),
    laborCost: "0",
    sellingPrice: "",
    otherCosts: "0",
    targetMarginPercent: String(CALC_DEFAULTS.targetMarginPercent),
    quantity: "1",
    filamentSpoolKg: "1",
  };
}

/** Parse string to finite number, defaulting to 0 (#10: renamed from `n`). */
const parseNum = (s: string) => {
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
};

function formToInputs(f: FormState): CalcInputs {
  const rawCost = parseNum(f.filamentCostPerKg);
  const spoolKg = Math.max(parseNum(f.filamentSpoolKg), 1);
  // Normalize to ₫/kg: if user entered cost for a 3kg or 5kg spool, divide
  const filamentCostPerKg = rawCost / spoolKg;

  return {
    name: f.name.trim(),
    material: f.material,
    filamentCostPerKg,
    filamentUsedGrams: parseNum(f.filamentUsedGrams),
    wastePercent: parseNum(f.wastePercent),
    printTimeHours: parseNum(f.printTimeHours),
    electricityRate: parseNum(f.electricityRate),
    printerWatts: parseNum(f.printerWatts),
    laborCost: parseNum(f.laborCost),
    sellingPrice: parseNum(f.sellingPrice),
    otherCosts: parseNum(f.otherCosts),
    targetMarginPercent: parseNum(f.targetMarginPercent),
    quantity: Math.max(parseNum(f.quantity), 1),
  };
}

// ─── Main component ──────────────────────────────────────────────────────────

export function CostCalculator({
  materials,
  currency,
  dateFormat,
  timeFormat,
}: {
  materials: CalcMaterial[];
  currency: string;
  dateFormat: string;
  timeFormat: string;
}) {
  const reduce = useReducedMotion();
  const queryClient = useQueryClient();

  const defaultMaterial = materials.some((m) => m.key === "petg")
    ? "petg"
    : (materials[0]?.key ?? "petg");

  const [tab, setTab] = useState<"calculator" | "history">("calculator");
  const [form, dispatch] = useReducer(formReducer, defaultMaterial, defaultsToForm);
  const [saving, setSaving] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  // ── Double-save protection (#18) ──────────────────────────
  // State (not a ref): the save button must re-render disabled immediately
  // after a save, and refs may not be read during render.
  const [lastSavedKey, setLastSavedKey] = useState<string | null>(null);

  // ── Live auto-calculate (#1) ──────────────────────────────
  const inputs = useMemo(() => formToInputs(form), [form]);
  const hasInput = inputs.filamentUsedGrams > 0 || inputs.sellingPrice > 0;
  const liveResult = useMemo(
    () => (hasInput ? { inputs, results: computeCalc(inputs) } : null),
    [inputs, hasInput],
  );

  // ── Client-side validation (#16) ───────────────────────────
  const inputsKey = useMemo(
    () => JSON.stringify(inputs),
    [inputs],
  );
  const alreadySaved = lastSavedKey === inputsKey;

  // ── Callbacks ─────────────────────────────────────────────

  const onFieldChange = useCallback((key: keyof FormState, value: string) => {
    dispatch({ type: "SET_FIELD", key, value });
  }, []);

  const onMaterialChange = useCallback(
    (key: string) => {
      const m = materials.find((x) => x.key === key);
      const prefillCost = m
        ? String(Math.round((m.cost_per_gram_cents / 100) * 1000))
        : undefined;
      dispatch({ type: "SET_MATERIAL", key, prefillCost });
    },
    [materials],
  );

  const clearForm = useCallback(() => {
    dispatch({ type: "CLEAR", defaultMaterial });
  }, [defaultMaterial]);

  // History — RLS pins the query to the signed-in user's own rows.
  const historyQuery = useQuery({
    queryKey: ["cost-calcs"],
    staleTime: 15_000,
    queryFn: async (): Promise<SavedCalculation[]> => {
      const supabase = getBrowserClient();
      const { data, error } = await supabase
        .from("cost_calculations")
        .select(
          "id, name, material, filament_cost_per_kg, filament_used_grams, waste_percent, print_time_hours, electricity_rate, printer_watts, labor_cost, selling_price, other_costs, target_margin_percent, filament_with_waste_g, material_cost, electricity_cost, total_cost, profit, margin_percent, roi_percent, created_at",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SavedCalculation[];
    },
  });
  const history = historyQuery.data ?? [];
  const savedCount = history.length;
  const currentTarget = parseNum(form.targetMarginPercent);

  async function saveToHistory() {
    if (!liveResult) return;
    // #18: Prevent saving the exact same inputs twice
    if (alreadySaved) {
      toast.info("Already saved — change something first");
      return;
    }
    setSaving(true);

    // #17: Optimistic update — immediately add to cache
    const optimisticEntry: SavedCalculation = {
      id: `optimistic-${Date.now()}`,
      name: liveResult.inputs.name,
      material: liveResult.inputs.material,
      filament_cost_per_kg: liveResult.inputs.filamentCostPerKg,
      filament_used_grams: liveResult.inputs.filamentUsedGrams,
      waste_percent: liveResult.inputs.wastePercent,
      print_time_hours: liveResult.inputs.printTimeHours,
      electricity_rate: liveResult.inputs.electricityRate,
      printer_watts: liveResult.inputs.printerWatts,
      labor_cost: liveResult.inputs.laborCost,
      selling_price: liveResult.inputs.sellingPrice,
      other_costs: liveResult.inputs.otherCosts,
      target_margin_percent: liveResult.inputs.targetMarginPercent,
      filament_with_waste_g: liveResult.results.filamentWithWasteGrams,
      material_cost: liveResult.results.materialCost,
      electricity_cost: liveResult.results.electricityCost,
      total_cost: liveResult.results.totalCost,
      profit: liveResult.results.profit,
      margin_percent: liveResult.results.marginPercent,
      roi_percent: liveResult.results.roiPercent,
      created_at: new Date().toISOString(),
    };

    const prevData = queryClient.getQueryData<SavedCalculation[]>(["cost-calcs"]);
    queryClient.setQueryData<SavedCalculation[]>(
      ["cost-calcs"],
      (old) => [optimisticEntry, ...(old ?? [])],
    );

    try {
      const res = await saveCalculationAction(liveResult.inputs);
      if (res.ok) {
        toast.success("Saved to history");
        setLastSavedKey(inputsKey); // #18
        queryClient.invalidateQueries({ queryKey: ["cost-calcs"] }).catch(console.error);
      } else {
        // Revert optimistic update
        queryClient.setQueryData(["cost-calcs"], prevData);
        toast.error(res.error);
      }
    } catch {
      queryClient.setQueryData(["cost-calcs"], prevData);
      toast.error("Failed to save calculation");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: string) {
    const res = await deleteCalculationAction(id);
    if (res.ok) {
      toast.success("Calculation deleted");
      queryClient.invalidateQueries({ queryKey: ["cost-calcs"] }).catch(console.error);
    } else {
      toast.error(res.error);
    }
  }

  async function clearAll() {
    const res = await clearAllCalculationsAction();
    if (res.ok) {
      toast.success(
        `Cleared ${res.data.cleared} entr${res.data.cleared === 1 ? "y" : "ies"}`,
      );
      queryClient.invalidateQueries({ queryKey: ["cost-calcs"] }).catch(console.error);
    } else {
      toast.error(res.error);
    }
  }

  async function exportFile(format: "csv" | "pdf") {
    setExporting(format);
    try {
      const res = await fetch(`/api/export/cost-calculations?format=${format}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cost-calculations.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${format.toUpperCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  /** Re-use a history entry: populate the form and switch to calculator tab (#2). */
  function reuseEntry(entry: SavedCalculation) {
    dispatch({ type: "LOAD_ENTRY", entry });
    setTab("calculator");
    toast.success(`Loaded "${entry.name || "Unnamed product"}" into calculator`);
  }

  const materialLabel = (key: string) =>
    materials.find((m) => m.key === key)?.label ?? key;

  return (
    <div className="space-y-4">
      {/* Header row: sub-tabs + "{n} saved" pill. */}
      <div className="flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Calculator sections"
          className="relative grid w-full max-w-md grid-cols-2 rounded-xl border border-border bg-muted/40 p-1"
        >
          {(["calculator", "history"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "relative z-10 rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                tab === t
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-selected={tab === t}
            >
              {tab === t ? (
                <motion.span
                  layoutId="calc-subtab"
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { type: "spring", duration: 0.35, bounce: 0.15 }
                  }
                  className="absolute inset-0 -z-10 rounded-lg bg-background shadow-sm ring-1 ring-border"
                />
              ) : null}
              {t}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setTab("history")}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <History className="size-3.5" aria-hidden />
          <motion.span
            key={savedCount}
            initial={reduce ? false : { scale: 1.25 }}
            animate={{ scale: 1 }}
            className="tabular-nums"
          >
            {savedCount}
          </motion.span>
          saved
        </button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {tab === "calculator" ? (
          <motion.div
            key="calculator"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="space-y-4"
          >
            <CalcForm
              form={form}
              materials={materials}
              onFieldChange={onFieldChange}
              onMaterialChange={onMaterialChange}
            />

            {/* ── Action bar ──────────────────────────────────────── */}
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => void saveToHistory()}
                disabled={saving || !liveResult || alreadySaved}
              >
                {saving ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Bookmark aria-hidden />
                )}
                Save to history
              </Button>
              <Button variant="outline" onClick={clearForm}>
                <Eraser aria-hidden /> Clear
              </Button>
            </div>

            {/* ── LIVE RESULT ─────────────────────────────────────── */}
            <AnimatePresence>
              {liveResult ? (
                <CalcErrorBoundary section="Result">
                  <CalcResultPanel
                    inputs={liveResult.inputs}
                    results={liveResult.results}
                    saving={saving}
                    currency={currency}
                    materialLabel={materialLabel}
                    onSave={() => void saveToHistory()}
                  />
                </CalcErrorBoundary>
              ) : null}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            key="history"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="space-y-4"
          >
            <CalcErrorBoundary section="History">
              <HistoryPanel
                history={history}
                loading={historyQuery.isLoading}
                currency={currency}
                currentTarget={currentTarget}
                dateFormat={dateFormat}
                timeFormat={timeFormat}
                materials={materials}
                materialLabel={materialLabel}
                exporting={exporting}
                onExport={(fmt) => void exportFile(fmt)}
                onClearAll={() => setClearOpen(true)}
                onDelete={(id) => setDeleteId(id)}
                onReuse={reuseEntry}
              />
            </CalcErrorBoundary>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Destructive confirms (spec: deletes confirm first; soft delete). */}
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all saved calculations?</AlertDialogTitle>
            <AlertDialogDescription>
              All {savedCount} entr{savedCount === 1 ? "y" : "ies"} will be removed from
              your history (soft-deleted and logged).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void clearAll()}
            >
              Clear all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this calculation?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from your history (soft-deleted and logged).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) void deleteEntry(deleteId);
                setDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
