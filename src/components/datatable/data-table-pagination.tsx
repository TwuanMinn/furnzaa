"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DataTablePaginationProps {
  page: number;
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  rowCount: number;
  pageSize: number;
  estimatedTotal: number | null;
  isFetching: boolean;
  selectedCount: number;
}

/**
 * Cursor pagination footer. Shows a planner ESTIMATE (≈) instead of a live
 * COUNT(*) — exact totals over millions of rows are deliberately avoided.
 */
export function DataTablePagination({
  page,
  hasNext,
  hasPrev,
  onNext,
  onPrev,
  rowCount,
  pageSize,
  estimatedTotal,
  isFetching,
  selectedCount,
}: DataTablePaginationProps) {
  const first = rowCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = (page - 1) * pageSize + rowCount;

  return (
    <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>
          {rowCount === 0
            ? "No rows"
            : `Rows ${first.toLocaleString()}–${last.toLocaleString()}`}
          {estimatedTotal != null && estimatedTotal > rowCount
            ? ` of ≈${estimatedTotal.toLocaleString()}`
            : ""}
        </span>
        {selectedCount > 0 ? (
          <span className="font-medium text-foreground">{selectedCount} selected</span>
        ) : null}
        {isFetching ? <Loader2 className="size-3.5 animate-spin" aria-label="Loading" /> : null}
      </div>

      <div className="flex items-center gap-2">
        <span className="tabular-nums">Page {page}</span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onPrev}
          disabled={!hasPrev}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onNext}
          disabled={!hasNext}
          aria-label="Next page"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
