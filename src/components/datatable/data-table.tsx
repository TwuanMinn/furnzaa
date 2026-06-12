"use client";

import type { ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { DataTableToolbar } from "./data-table-toolbar";
import { DataTablePagination } from "./data-table-pagination";
import type { FilterDef } from "@/lib/datatable/types";
import type { DataTableState } from "@/lib/datatable/use-data-table";

export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Server-side sortable (id must be in the endpoint's allow-list). */
  sortable?: boolean;
  align?: "left" | "right";
  /** Hide below a breakpoint to keep mobile tables readable. */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
}

export interface DataTableProps<T> {
  table: DataTableState<T>;
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  /** Filter controls rendered in the toolbar. */
  filterDefs?: FilterDef[];
  searchPlaceholder?: string;
  exportDataset?: string;
  importDataset?: string;
  selectable?: boolean;
  onRowClick?: (row: T) => void;
  /** Rendered when rows are selected (bulk actions). */
  bulkActions?: (selectedIds: string[], clear: () => void) => ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  emptyAction?: ReactNode;
  /** Extra toolbar actions (e.g. "New order"). */
  toolbar?: ReactNode;
}

const HIDE_CLASS = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
} as const;

/**
 * THE reusable list view: server-driven search/filter/sort, keyset cursor
 * pagination, row selection, shared export/print/import toolbar, skeleton
 * loading, and Motion-staggered row entrances (disabled for reduced motion).
 * Every list screen in the app builds on this one component.
 */
export function DataTable<T>({
  table,
  columns,
  getRowId,
  filterDefs = [],
  searchPlaceholder,
  exportDataset,
  importDataset,
  selectable = false,
  onRowClick,
  bulkActions,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyIcon = Inbox,
  emptyAction,
  toolbar,
}: DataTableProps<T>) {
  const reduce = useReducedMotion();
  const rowIds = table.rows.map(getRowId);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => table.selected.has(id));
  const someSelected = rowIds.some((id) => table.selected.has(id));
  const colCount = columns.length + (selectable ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      <DataTableToolbar
        searchValue={table.search}
        onSearchChange={table.onSearchChange}
        searchPlaceholder={searchPlaceholder}
        filterDefs={filterDefs}
        filterValues={table.filters}
        onFilterChange={table.setFilter}
        onClearFilters={table.clearFilters}
        exportDataset={exportDataset}
        importDataset={importDataset}
        exportParams={table.exportParams}
        onImported={table.refresh}
      >
        {toolbar}
      </DataTableToolbar>

      <AnimatePresence>
        {selectable && table.selected.size > 0 && bulkActions ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
          >
            <span className="text-sm font-medium">{table.selected.size} selected</span>
            <div className="flex items-center gap-2">
              {bulkActions([...table.selected], table.clearSelection)}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground"
              onClick={table.clearSelection}
            >
              Clear
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {table.isLoading ? (
        <TableSkeleton rows={8} cols={Math.min(colCount, 6)} />
      ) : table.error ? (
        <div className="rounded-lg border border-border">
          <ErrorState
            description={table.error}
            action={
              <Button variant="outline" size="sm" onClick={table.refresh}>
                Try again
              </Button>
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {selectable ? (
                  <TableHead className="w-10 pl-3">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={(v) => table.setPageSelected(rowIds, v === true)}
                      aria-label="Select all rows on this page"
                    />
                  </TableHead>
                ) : null}
                {columns.map((col) => (
                  <TableHead
                    key={col.id}
                    className={cn(
                      "px-3",
                      col.align === "right" && "text-right",
                      col.hideBelow && HIDE_CLASS[col.hideBelow],
                      col.className,
                    )}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => table.toggleSort(col.id)}
                        className={cn(
                          "-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                          col.align === "right" && "flex-row-reverse",
                          table.sort.id === col.id ? "text-foreground" : "text-muted-foreground",
                        )}
                        aria-label={`Sort by ${col.header}`}
                      >
                        {col.header}
                        {table.sort.id === col.id ? (
                          table.sort.dir === "asc" ? (
                            <ArrowUp className="size-3.5" aria-hidden />
                          ) : (
                            <ArrowDown className="size-3.5" aria-hidden />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className={cn(table.isFetching && "opacity-60 transition-opacity")}>
              {table.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="p-0">
                    <EmptyState
                      icon={emptyIcon}
                      title={emptyTitle}
                      description={emptyDescription}
                      action={emptyAction}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                table.rows.map((row, index) => {
                  const id = getRowId(row);
                  const isSelected = table.selected.has(id);
                  return (
                    <motion.tr
                      key={id}
                      layout={reduce ? false : "position"}
                      initial={reduce ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.2,
                        ease: "easeOut",
                        delay: reduce ? 0 : Math.min(index * 0.025, 0.3),
                      }}
                      data-state={isSelected ? "selected" : undefined}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(
                        "border-b transition-colors last:border-0 hover:bg-muted/50 data-[state=selected]:bg-muted",
                        onRowClick && "cursor-pointer",
                      )}
                    >
                      {selectable ? (
                        <TableCell className="w-10 pl-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => table.toggleSelected(id)}
                            aria-label="Select row"
                          />
                        </TableCell>
                      ) : null}
                      {columns.map((col) => (
                        <TableCell
                          key={col.id}
                          className={cn(
                            "px-3 py-2.5",
                            col.align === "right" && "text-right",
                            col.hideBelow && HIDE_CLASS[col.hideBelow],
                            col.className,
                          )}
                        >
                          {col.cell(row)}
                        </TableCell>
                      ))}
                    </motion.tr>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <DataTablePagination
        page={table.page}
        hasNext={table.hasNext}
        hasPrev={table.hasPrev}
        onNext={table.nextPage}
        onPrev={table.prevPage}
        rowCount={table.rows.length}
        pageSize={table.pageSize}
        estimatedTotal={table.estimatedTotal}
        isFetching={table.isFetching && !table.isLoading}
        selectedCount={table.selected.size}
      />
    </div>
  );
}
