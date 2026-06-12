import type { ActivityModule } from "@/lib/activity/log";
import type { ListQuery } from "@/lib/datatable/types";
import type { SessionUser } from "@/lib/rbac/guards";
import type { PermissionKey } from "@/lib/rbac/permissions";

/**
 * Export-dataset contract. Each module registers ONE dataset describing how to
 * fetch its filtered rows and how to flatten them into cells; the shared
 * export service then produces CSV, branded PDF and the print view from the
 * exact same definition — so all three always match the on-screen filters.
 */

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
  /** Relative width for PDF/print layout (default 1). */
  width?: number;
  align?: "left" | "right";
}

export interface ExportDataset<T = never> {
  /** Document title, e.g. "Customer Orders". */
  title: string;
  /** Filename stem, e.g. "orders". */
  slug: string;
  /** Activity-log module the export is recorded under. */
  module: ActivityModule;
  permission: PermissionKey;
  columns: ExportColumn<T>[];
  /**
   * Fetch up to `limit` rows matching the list query AS THE GIVEN USER
   * (RLS-scoped — staff exports only contain what staff can see). Implementors
   * iterate keyset pages internally; never OFFSET, never COUNT(*).
   */
  fetchRows: (query: ListQuery, user: SessionUser, limit: number) => Promise<T[]>;
}

/** Hard caps so one export can never scan unbounded data. */
export const EXPORT_LIMITS = { csv: 50_000, pdf: 2_000, print: 2_000 } as const;

export interface ExportTableData {
  headers: { label: string; width: number; align: "left" | "right" }[];
  rows: string[][];
}

/** Flatten dataset rows through the column defs into printable cells. */
export function toTableData<T>(dataset: ExportDataset<T>, rows: T[]): ExportTableData {
  return {
    headers: dataset.columns.map((c) => ({
      label: c.header,
      width: c.width ?? 1,
      align: c.align ?? "left",
    })),
    rows: rows.map((row) =>
      dataset.columns.map((c) => {
        const v = c.value(row);
        return v == null ? "" : String(v);
      }),
    ),
  };
}
