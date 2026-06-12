import "server-only";

import type { ListQuery } from "./types";

/**
 * Server helpers for cursor (keyset) pagination over Supabase/PostgREST.
 *
 * Keyset pagination orders by (sortColumn, id) and filters past the cursor
 * tuple — it never uses OFFSET, so page N is as cheap as page 1 even on
 * multi-million-row tables (backed by the composite btree indexes from the
 * migrations). Cursors are opaque base64url-encoded JSON of the last row's
 * (sortValue, id).
 *
 * Constraint: sortable columns must be NOT NULL (created_at, codes, names…) —
 * tuple comparison with NULLs would silently drop rows.
 */

export interface KeysetCursor {
  /** Last row's sort-column value (ISO timestamp, number, or text). */
  v: string | number;
  /** Last row's id (tiebreaker). */
  id: string;
}

export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): KeysetCursor | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      parsed &&
      typeof parsed === "object" &&
      "v" in parsed &&
      "id" in parsed &&
      (typeof (parsed as KeysetCursor).v === "string" ||
        typeof (parsed as KeysetCursor).v === "number") &&
      typeof (parsed as KeysetCursor).id === "string"
    ) {
      return parsed as KeysetCursor;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Quote a value as a PostgREST literal for use inside `.or(...)` strings.
 * Double-quoting makes values containing , ( ) or spaces safe; embedded
 * backslashes and quotes are escaped.
 */
export function pgLiteral(value: string | number): string {
  if (typeof value === "number") return String(value);
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Build the `.or(...)` expression that selects rows strictly AFTER the cursor
 * in (sortColumn, id) order:  sort > v  OR  (sort = v AND id > cursor.id)
 * (operators flip for descending order).
 */
export function keysetOrExpression(
  cursor: KeysetCursor,
  sortColumn: string,
  ascending: boolean,
): string {
  const op = ascending ? "gt" : "lt";
  const v = pgLiteral(cursor.v);
  const id = pgLiteral(cursor.id);
  return `${sortColumn}.${op}.${v},and(${sortColumn}.eq.${v},id.${op}.${id})`;
}

/**
 * Escape a user-supplied search term for an ilike pattern: quotes the literal
 * and escapes the LIKE wildcards % and _ so users match them literally.
 */
export function ilikePattern(term: string): string {
  const escaped = term.replace(/\\/g, "\\\\").replace(/[%_]/g, (m) => `\\${m}`);
  return `%${escaped}%`;
}

/** `.or(...)` expression matching `term` (ilike, trigram-indexed) on any column. */
export function ilikeAnyExpression(columns: string[], term: string): string {
  const pattern = pgLiteral(ilikePattern(term));
  return columns.map((c) => `${c}.ilike.${pattern}`).join(",");
}

export interface ParsedListQuery {
  q: string;
  sort: string;
  ascending: boolean;
  cursor: KeysetCursor | null;
  limit: number;
  filters: Record<string, string>;
}

export interface ParseListOptions {
  /** Allow-listed sortable column ids mapped to their DB column names. */
  sortable: Record<string, string>;
  defaultSort: string;
  defaultDir?: "asc" | "desc";
  /** Rows per page; clamped to [1, maxLimit]. */
  defaultLimit?: number;
  maxLimit?: number;
}

/**
 * Parse and sanitize DataTable query params from a request URL. Unknown sort
 * columns fall back to the default (never interpolated raw into queries).
 * Filters arrive as `f_<id>` params.
 */
export function parseListQuery(url: URL, opts: ParseListOptions): ParsedListQuery {
  const sp = url.searchParams;
  const requestedSort = sp.get("sort") ?? opts.defaultSort;
  const sort = opts.sortable[requestedSort] ? requestedSort : opts.defaultSort;
  const dirRaw = sp.get("dir");
  const dir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : (opts.defaultDir ?? "desc");

  const maxLimit = opts.maxLimit ?? 50;
  const limitRaw = Number(sp.get("limit") ?? opts.defaultLimit ?? 25);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 25, 1), maxLimit);

  const filters: Record<string, string> = {};
  for (const [key, value] of sp.entries()) {
    if (key.startsWith("f_") && value !== "") filters[key.slice(2)] = value;
  }

  return {
    q: (sp.get("q") ?? "").trim().slice(0, 200),
    sort,
    ascending: dir === "asc",
    cursor: decodeCursor(sp.get("cursor")),
    limit,
    filters,
  };
}

/** Re-create a ListQuery (for export/print fan-out) from a parsed request URL. */
export function listQueryFromUrl(url: URL): ListQuery {
  const sp = url.searchParams;
  const filters: Record<string, string> = {};
  for (const [key, value] of sp.entries()) {
    if (key.startsWith("f_") && value !== "") filters[key.slice(2)] = value;
  }
  return {
    q: sp.get("q") ?? undefined,
    sort: sp.get("sort") ?? undefined,
    dir: (sp.get("dir") as "asc" | "desc" | null) ?? undefined,
    filters,
  };
}

/**
 * Shape a fetched page: callers fetch `limit + 1` rows; this trims the extra
 * row and derives the next cursor from the last visible row.
 */
export function buildPage<T extends Record<string, unknown>>(
  rows: T[],
  limit: number,
  sortColumn: string,
  estimatedTotal: number | null,
): { rows: T[]; nextCursor: string | null; estimatedTotal: number | null } {
  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const last = visible[visible.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ v: last[sortColumn] as string | number, id: String(last["id"]) })
      : null;
  return { rows: visible, nextCursor, estimatedTotal };
}
