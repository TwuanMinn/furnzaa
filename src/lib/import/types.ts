/**
 * CSV-import contracts shared by the client wizard (mapping, validation,
 * preview) and the server commit endpoint (which re-validates everything —
 * client checks are a convenience, never the enforcement).
 */

export type ImportFieldType = "text" | "email" | "phone" | "number" | "date" | "select";

export interface ImportField {
  /** Target field key, e.g. "full_name". */
  key: string;
  label: string;
  type: ImportFieldType;
  required?: boolean;
  /** For type "select": allowed values (case-insensitive on input). */
  options?: string[];
  maxLength?: number;
  /** Example shown in the mapping UI. */
  example?: string;
}

export interface RowError {
  /** 1-based data row number (excluding the header). */
  row: number;
  field: string;
  message: string;
}

export interface ImportCommitResult {
  inserted: number;
  skipped: number;
  errors: RowError[];
}

/** Rows are sent to the server in chunks of this size and inserted in batches. */
export const IMPORT_BATCH_SIZE = 1_000;
export const IMPORT_MAX_ROWS = 50_000;
export const IMPORT_MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s\-().]{5,24}$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Normalize one raw CSV cell for a field; returns an error message or the value. */
export function validateCell(
  field: ImportField,
  raw: string | null | undefined,
): { ok: true; value: string | number | null } | { ok: false; message: string } {
  const trimmed = (raw ?? "").trim();

  if (trimmed === "") {
    if (field.required) return { ok: false, message: `${field.label} is required` };
    return { ok: true, value: null };
  }
  if (field.maxLength && trimmed.length > field.maxLength) {
    return { ok: false, message: `${field.label} exceeds ${field.maxLength} characters` };
  }

  switch (field.type) {
    case "email":
      if (!EMAIL_RE.test(trimmed)) return { ok: false, message: `Invalid email "${trimmed}"` };
      return { ok: true, value: trimmed.toLowerCase() };
    case "phone":
      if (!PHONE_RE.test(trimmed)) return { ok: false, message: `Invalid phone "${trimmed}"` };
      return { ok: true, value: trimmed };
    case "number": {
      const n = Number(trimmed.replace(/[, ]/g, ""));
      if (!Number.isFinite(n)) return { ok: false, message: `"${trimmed}" is not a number` };
      return { ok: true, value: n };
    }
    case "date": {
      // Accept ISO (2026-01-31) or common US/EU forms parseable by Date.
      if (DATE_ONLY_RE.test(trimmed)) return { ok: true, value: trimmed };
      const d = new Date(trimmed);
      if (Number.isNaN(d.getTime())) return { ok: false, message: `"${trimmed}" is not a date` };
      return { ok: true, value: d.toISOString().slice(0, 10) };
    }
    case "select": {
      const match = field.options?.find((o) => o.toLowerCase() === trimmed.toLowerCase());
      if (!match) {
        return {
          ok: false,
          message: `"${trimmed}" must be one of: ${(field.options ?? []).join(", ")}`,
        };
      }
      return { ok: true, value: match };
    }
    default:
      return { ok: true, value: trimmed };
  }
}

export interface ValidatedRow {
  /** 1-based data row number for error reporting. */
  row: number;
  values: Record<string, string | number | null>;
}

/**
 * Validate mapped rows. Returns the valid rows (normalized values keyed by
 * field key) and all per-row errors. Used identically client- and server-side.
 */
export function validateRows(
  fields: ImportField[],
  rows: Record<string, string | null | undefined>[],
  startRow = 1,
): { valid: ValidatedRow[]; errors: RowError[] } {
  const valid: ValidatedRow[] = [];
  const errors: RowError[] = [];

  rows.forEach((raw, i) => {
    const rowNumber = startRow + i;
    const values: Record<string, string | number | null> = {};
    let rowOk = true;
    for (const field of fields) {
      const result = validateCell(field, raw[field.key]);
      if (result.ok) {
        values[field.key] = result.value;
      } else {
        rowOk = false;
        errors.push({ row: rowNumber, field: field.key, message: result.message });
      }
    }
    if (rowOk) valid.push({ row: rowNumber, values });
  });

  return { valid, errors };
}

/** Auto-match CSV headers to target fields by normalized name. */
export function autoMapColumns(csvHeaders: string[], fields: ImportField[]): Record<string, string> {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const mapping: Record<string, string> = {};
  for (const field of fields) {
    const fieldNorm = normalize(field.key);
    const labelNorm = normalize(field.label);
    const match = csvHeaders.find((h) => {
      const n = normalize(h);
      return n === fieldNorm || n === labelNorm;
    });
    if (match) mapping[field.key] = match;
  }
  return mapping;
}
