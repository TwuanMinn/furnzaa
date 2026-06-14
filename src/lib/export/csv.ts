/**
 * Shared CSV builder used by the export service and per-row error reports.
 * RFC 4180 quoting + UTF-8 BOM so Excel opens files correctly. Cells are
 * guarded against spreadsheet formula injection (leading = + - @).
 */

export function csvEscape(value: unknown): string {
  if (value == null) return "";
  let s = String(value);
  // Formula-injection guard for spreadsheet apps.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(headerRow: string[], rows: (unknown[] | Record<string, unknown>)[]): string {
  const lines: string[] = [headerRow.map(csvEscape).join(",")];
  for (const row of rows) {
    const cells = Array.isArray(row) ? row : headerRow.map((h) => row[h]);
    lines.push(cells.map(csvEscape).join(","));
  }
  // BOM so Excel detects UTF-8.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Client-side helper: trigger a browser download of a Blob. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Client-side helper: trigger a download of CSV text. */
export function downloadCsv(filename: string, csv: string): void {
  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

/**
 * Fetch an export endpoint and download the response as `filename`. Throws on a
 * non-OK response (surfacing the server's `error` message when present) so
 * callers keep their own try/catch + toast + busy-state handling.
 */
export async function downloadFromFetch(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Export failed (${res.status})`);
  }
  downloadBlob(filename, await res.blob());
}
