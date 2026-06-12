/**
 * Shared contracts for the reusable DataTable: list-query parameters, the
 * cursor-paginated response envelope, and filter definitions. Used by the
 * client hook (use-data-table), every list API route, and the export/print
 * services so the SAME filtered dataset flows through all of them.
 */

/** One page of results from a cursor-paginated list endpoint. */
export interface CursorPage<T> {
  rows: T[];
  /** Opaque cursor for the next page; null when this is the last page. */
  nextCursor: string | null;
  /**
   * Planner-estimated total for the CURRENT filter (never a live COUNT(*) on
   * huge tables). Only computed for the first page; null afterwards.
   */
  estimatedTotal: number | null;
}

/** Query parameters every list endpoint understands. */
export interface ListQuery {
  /** Keyword search (debounced client-side). */
  q?: string;
  /** Sort column id — must be allow-listed by the endpoint. */
  sort?: string;
  dir?: "asc" | "desc";
  /** Opaque keyset cursor returned by the previous page. */
  cursor?: string;
  limit?: number;
  /** Flat filter values: { status: "delivered", buying_date_from: "2026-01-01", … } */
  filters?: Record<string, string>;
}

/** Serialize a ListQuery to URLSearchParams (client → API → export/print). */
export function listQueryToSearchParams(query: ListQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.sort) params.set("sort", query.sort);
  if (query.dir) params.set("dir", query.dir);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  for (const [key, value] of Object.entries(query.filters ?? {})) {
    if (value !== "" && value != null) params.set(`f_${key}`, value);
  }
  return params;
}

/** Filter control definitions rendered by the DataTable toolbar. */
export type FilterDef =
  | {
      type: "select";
      id: string;
      label: string;
      options: { value: string; label: string }[];
      /** Optional placeholder shown when nothing is selected. */
      placeholder?: string;
    }
  | { type: "text"; id: string; label: string; placeholder?: string }
  /** Produces `<id>_from` / `<id>_to` filter values (ISO dates). */
  | { type: "daterange"; id: string; label: string };
