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

/** Client-side helper: trigger a download of CSV text. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
