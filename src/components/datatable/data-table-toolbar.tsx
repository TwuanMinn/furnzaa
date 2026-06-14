"use client";

import { useState, type ReactNode } from "react";
import { Download, FileText, Loader2, Printer, Search, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTableFilters } from "./data-table-filters";
import { ImportDialog } from "./import-dialog";
import { downloadFromFetch } from "@/lib/export/csv";
import { toDateKey } from "@/lib/format";
import type { FilterDef } from "@/lib/datatable/types";

interface DataTableToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filterDefs: FilterDef[];
  filterValues: Record<string, string>;
  onFilterChange: (id: string, value: string) => void;
  onClearFilters: () => void;
  /** Dataset slug for /api/export + /print; omit to hide export buttons. */
  exportDataset?: string;
  /** Dataset slug for the CSV import wizard; omit to hide the Import button. */
  importDataset?: string;
  /** Current filter/sort/search query string appended to export/print URLs. */
  exportParams: URLSearchParams;
  onImported?: () => void;
  /** Module-specific primary actions (e.g. "New user"). */
  children?: ReactNode;
  viewToggle?: ReactNode;
}

/**
 * Standard list-screen toolbar: debounced keyword search, filter controls and
 * the shared Export PDF / Print / Export CSV / Import CSV actions. Exports
 * carry the CURRENT search+filters so files match what's on screen.
 */
export function DataTableToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  filterDefs,
  filterValues,
  onFilterChange,
  onClearFilters,
  exportDataset,
  importDataset,
  exportParams,
  onImported,
  children,
  viewToggle,
}: DataTableToolbarProps) {
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  async function download(format: "csv" | "pdf") {
    if (!exportDataset) return;
    setExporting(format);
    try {
      const params = new URLSearchParams(exportParams);
      params.set("format", format);
      await downloadFromFetch(
        `/api/export/${exportDataset}?${params}`,
        `${exportDataset}-${toDateKey()}.${format}`,
      );
      toast.success(`Exported ${format.toUpperCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  function openPrint() {
    if (!exportDataset) return;
    window.open(`/print/${exportDataset}?${exportParams}`, "_blank", "noopener");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 pl-8"
          />
        </div>

        <div className="flex items-center gap-2">
          {exportDataset ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={exporting !== null}>
                  {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Current filters apply</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void download("csv")}>
                  <Download /> Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void download("pdf")}>
                  <FileText /> Export PDF
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={openPrint}>
                  <Printer /> Print
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {importDataset ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload /> Import CSV
              </Button>
              <ImportDialog
                dataset={importDataset}
                open={importOpen}
                onOpenChange={setImportOpen}
                onImported={onImported}
              />
            </>
          ) : null}

          {children}
        </div>
      </div>

      {filterDefs.length > 0 || viewToggle ? (
        <DataTableFilters
          defs={filterDefs}
          values={filterValues}
          onChange={onFilterChange}
          onClear={onClearFilters}
          hasSearch={searchValue.trim() !== ""}
          viewToggle={viewToggle}
        />
      ) : null}
    </div>
  );
}
