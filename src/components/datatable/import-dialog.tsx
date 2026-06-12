"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildCsv, downloadCsv } from "@/lib/export/csv";
import {
  autoMapColumns,
  validateRows,
  IMPORT_BATCH_SIZE,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  type ImportField,
  type ImportCommitResult,
  type RowError,
} from "@/lib/import/types";

type Step = "upload" | "map" | "preview" | "committing" | "done";

interface ImportDialogProps {
  dataset: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

interface SpecResponse {
  ok: boolean;
  data?: { title: string; fields: ImportField[]; batchSize: number; maxRows: number };
  error?: string;
}

const SKIP = "__skip__";

/**
 * Shared CSV-import wizard: upload → column mapping (auto-matched) →
 * validation preview with a per-row error report → chunked commit
 * (1,000 rows/request; the server re-validates and batch-inserts).
 */
export function ImportDialog({ dataset, open, onOpenChange, onImported }: ImportDialogProps) {
  const reduce = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [spec, setSpec] = useState<SpecResponse["data"] | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ inserted: number; failed: number; errors: RowError[] }>({
    inserted: 0,
    failed: 0,
    errors: [],
  });

  // Load the field spec when the dialog opens.
  useEffect(() => {
    if (!open || spec) return;
    void fetch(`/api/import/${dataset}`)
      .then(async (res) => (await res.json()) as SpecResponse)
      .then((body) => {
        if (body.ok && body.data) setSpec(body.data);
        else toast.error(body.error ?? "Failed to load import settings");
      })
      .catch(() => toast.error("Failed to load import settings"));
  }, [open, spec, dataset]);

  const reset = useCallback(() => {
    setStep("upload");
    setFileName("");
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setProgress(0);
    setResult({ inserted: 0, failed: 0, errors: [] });
  }, []);

  function handleOpenChange(next: boolean) {
    if (!next && step === "committing") return; // don't abandon a running import
    onOpenChange(next);
    if (!next) reset();
  }

  function handleFile(file: File | null) {
    if (!file) return;
    if (file.size > IMPORT_MAX_FILE_BYTES) {
      toast.error(`File is too large (max ${Math.round(IMPORT_MAX_FILE_BYTES / 1024 / 1024)} MB)`);
      return;
    }
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      toast.error("Choose a .csv file");
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (parsed) => {
        const headers = (parsed.meta.fields ?? []).filter(Boolean);
        if (headers.length === 0) {
          toast.error("Could not find a header row in that file");
          return;
        }
        if (parsed.data.length === 0) {
          toast.error("The file has no data rows");
          return;
        }
        if (parsed.data.length > IMPORT_MAX_ROWS) {
          toast.error(`Too many rows (max ${IMPORT_MAX_ROWS.toLocaleString()})`);
          return;
        }
        setFileName(file.name);
        setCsvHeaders(headers);
        setCsvRows(parsed.data);
        if (spec) setMapping(autoMapColumns(headers, spec.fields));
        setStep("map");
      },
      error: () => toast.error("Failed to parse the CSV file"),
    });
  }

  /** Raw rows re-keyed by target field according to the current mapping. */
  const mappedRows = useMemo(() => {
    if (!spec) return [];
    return csvRows.map((row) => {
      const out: Record<string, string> = {};
      for (const field of spec.fields) {
        const source = mapping[field.key];
        if (source && source !== SKIP) out[field.key] = row[source] ?? "";
      }
      return out;
    });
  }, [csvRows, mapping, spec]);

  const validation = useMemo(() => {
    if (!spec || step !== "preview") return null;
    return validateRows(spec.fields, mappedRows);
  }, [spec, step, mappedRows]);

  const requiredUnmapped = useMemo(
    () =>
      (spec?.fields ?? []).filter(
        (f) => f.required && (!mapping[f.key] || mapping[f.key] === SKIP),
      ),
    [spec, mapping],
  );

  async function commit() {
    if (!spec || !validation) return;
    setStep("committing");
    setProgress(0);

    const rows = validation.valid;
    let inserted = 0;
    let failed = validation.errors.length;
    const errors: RowError[] = [...validation.errors];

    try {
      for (let i = 0; i < rows.length; i += IMPORT_BATCH_SIZE) {
        const chunk = rows.slice(i, i + IMPORT_BATCH_SIZE);
        const isFinal = i + IMPORT_BATCH_SIZE >= rows.length;
        const res = await fetch(`/api/import/${dataset}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: chunk.map((r) => {
              // Send raw-ish strings; server re-validates from scratch.
              const out: Record<string, string | null> = {};
              for (const [k, v] of Object.entries(r.values)) out[k] = v == null ? null : String(v);
              return out;
            }),
            startRow: chunk[0]?.row ?? 1,
            final: isFinal,
            totals: { inserted, failed, fileName },
          }),
        });
        const body = (await res.json()) as { ok: boolean; data?: ImportCommitResult; error?: string };
        if (!res.ok || !body.ok || !body.data) {
          throw new Error(body.error ?? `Import failed (${res.status})`);
        }
        inserted += body.data.inserted;
        failed += body.data.skipped;
        errors.push(...body.data.errors);
        setProgress(Math.min(i + IMPORT_BATCH_SIZE, rows.length) / Math.max(rows.length, 1));
      }
      setResult({ inserted, failed, errors });
      setStep("done");
      if (inserted > 0) onImported?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
      setResult({ inserted, failed, errors });
      setStep("preview");
    }
  }

  function downloadErrorReport(errors: RowError[]) {
    downloadCsv(
      `${dataset}-import-errors.csv`,
      buildCsv(["Row", "Field", "Problem"], errors.map((e) => [e.row, e.field, e.message])),
    );
  }

  const stepIndex = { upload: 0, map: 1, preview: 2, committing: 2, done: 3 }[step];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import {spec?.title ?? "data"} from CSV</DialogTitle>
          <DialogDescription>
            {["Upload a CSV file", "Match columns to fields", "Review & confirm", "Done"][stepIndex]}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= stepIndex ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduce ? false : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="min-h-48"
          >
            {step === "upload" ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFile(e.dataTransfer.files[0] ?? null);
                }}
                className="flex h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors outline-none hover:border-primary/50 hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Upload className="size-8" aria-hidden />
                <span className="text-sm font-medium text-foreground">
                  Drop a CSV here or click to browse
                </span>
                <span className="text-xs">
                  Up to {IMPORT_MAX_ROWS.toLocaleString()} rows ·{" "}
                  {Math.round(IMPORT_MAX_FILE_BYTES / 1024 / 1024)} MB max
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
              </button>
            ) : null}

            {step === "map" && spec ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileSpreadsheet className="size-4" aria-hidden />
                  {fileName} · {csvRows.length.toLocaleString()} rows
                </div>
                <div className="grid gap-2.5">
                  {spec.fields.map((field) => (
                    <div key={field.key} className="grid grid-cols-2 items-center gap-3">
                      <Label className="justify-self-start">
                        {field.label}
                        {field.required ? <span className="text-destructive"> *</span> : null}
                        {field.example ? (
                          <span className="ml-1 font-normal text-muted-foreground">
                            e.g. {field.example}
                          </span>
                        ) : null}
                      </Label>
                      <Select
                        value={mapping[field.key] ?? SKIP}
                        onValueChange={(v) => setMapping((m) => ({ ...m, [field.key]: v }))}
                      >
                        <SelectTrigger size="sm" aria-label={`CSV column for ${field.label}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SKIP}>— Not in file —</SelectItem>
                          {csvHeaders.map((h) => (
                            <SelectItem key={h} value={h}>
                              {h}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                {requiredUnmapped.length > 0 ? (
                  <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                    <TriangleAlert className="size-4" aria-hidden />
                    Map required field{requiredUnmapped.length > 1 ? "s" : ""}:{" "}
                    {requiredUnmapped.map((f) => f.label).join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}

            {step === "preview" && spec && validation ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-4" aria-hidden />
                    {validation.valid.length.toLocaleString()} valid row(s)
                  </span>
                  {validation.errors.length > 0 ? (
                    <>
                      <span className="flex items-center gap-1.5 text-destructive">
                        <TriangleAlert className="size-4" aria-hidden />
                        {validation.errors.length.toLocaleString()} problem(s) — those rows will be
                        skipped
                      </span>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => downloadErrorReport(validation.errors)}
                      >
                        <Download /> Error report
                      </Button>
                    </>
                  ) : null}
                </div>

                <ScrollArea className="h-56 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        {spec.fields.map((f) => (
                          <TableHead key={f.key}>{f.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validation.valid.slice(0, 8).map((row) => (
                        <TableRow key={row.row}>
                          <TableCell className="text-muted-foreground">{row.row}</TableCell>
                          {spec.fields.map((f) => (
                            <TableCell key={f.key} className="max-w-40 truncate">
                              {row.values[f.key] ?? ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
                {validation.errors.length > 0 ? (
                  <ScrollArea className="h-24 rounded-md border bg-destructive/5 p-2">
                    <ul className="space-y-1 text-xs text-destructive">
                      {validation.errors.slice(0, 50).map((e, i) => (
                        <li key={i}>
                          Row {e.row}: {e.message}
                        </li>
                      ))}
                      {validation.errors.length > 50 ? (
                        <li>… and {validation.errors.length - 50} more (download the report)</li>
                      ) : null}
                    </ul>
                  </ScrollArea>
                ) : null}
              </div>
            ) : null}

            {step === "committing" ? (
              <div className="flex h-48 flex-col items-center justify-center gap-4">
                <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
                <div className="w-64">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      animate={{ width: `${Math.round(progress * 100)}%` }}
                      transition={{ duration: 0.2 }}
                    />
                  </div>
                  <p className="mt-2 text-center text-sm text-muted-foreground">
                    Importing… {Math.round(progress * 100)}%
                  </p>
                </div>
              </div>
            ) : null}

            {step === "done" ? (
              <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
                <CheckCircle2 className="size-10 text-emerald-500" aria-hidden />
                <p className="font-medium">
                  Imported {result.inserted.toLocaleString()} row(s)
                  {result.failed > 0 ? ` · ${result.failed.toLocaleString()} skipped` : ""}
                </p>
                {result.errors.length > 0 ? (
                  <Button variant="outline" size="sm" onClick={() => downloadErrorReport(result.errors)}>
                    <Download /> Download error report
                  </Button>
                ) : null}
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>

        <DialogFooter>
          {step === "map" ? (
            <>
              <Button variant="ghost" onClick={reset}>
                Back
              </Button>
              <Button onClick={() => setStep("preview")} disabled={requiredUnmapped.length > 0}>
                Review
              </Button>
            </>
          ) : null}
          {step === "preview" ? (
            <>
              <Button variant="ghost" onClick={() => setStep("map")}>
                Back
              </Button>
              <Button onClick={() => void commit()} disabled={(validation?.valid.length ?? 0) === 0}>
                Import {validation?.valid.length.toLocaleString()} row(s)
              </Button>
            </>
          ) : null}
          {step === "done" ? <Button onClick={() => handleOpenChange(false)}>Close</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
