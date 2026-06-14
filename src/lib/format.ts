import { format, parseISO } from "date-fns";

/**
 * Money convention: every *_cents column stores display-value × 100 regardless
 * of currency; rendering divides by 100 and shows the currency's decimal count.
 * VND (the seeded company currency) has no minor unit → 0 decimals with dot
 * thousands separators, e.g. 300.000₫.
 */
const ZERO_DECIMAL_CURRENCIES = new Set(["VND", "JPY", "KRW"]);

export function currencyDecimals(currency: string | null | undefined): number {
  return ZERO_DECIMAL_CURRENCIES.has((currency ?? "").toUpperCase()) ? 0 : 2;
}

/** Format stored hundredths as a currency string (VND → "300.000₫"). */
export function formatMoney(cents: number | null | undefined, currency = "USD", locale?: string) {
  const value = (cents ?? 0) / 100;
  const code = (currency || "USD").toUpperCase();
  if (code === "VND") {
    // Spec format: thousands-dotted đồng with a trailing ₫ and no space.
    return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Math.round(value))}₫`;
  }
  try {
    return new Intl.NumberFormat(locale ?? "en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: currencyDecimals(code),
      maximumFractionDigits: currencyDecimals(code),
    }).format(value);
  } catch {
    return `${code} ${value.toFixed(currencyDecimals(code))}`;
  }
}

/** Format a plain amount (already in display units, e.g. calculator đồng). */
export function formatAmount(value: number | null | undefined, currency = "USD") {
  return formatMoney(Math.round((value ?? 0) * 100), currency);
}

/** Parse a user-entered amount ("19.99", "1,299") into stored hundredths. */
export function toCents(input: string | number | null | undefined): number {
  if (input == null || input === "") return 0;
  const n = typeof input === "number" ? input : Number(String(input).replace(/[^0-9.\-]/g, ""));
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

/** Stored hundredths → plain decimal string for inputs/CSV ("1299.00"; VND "1299"). */
export function centsToDecimalString(
  cents: number | null | undefined,
  currency = "USD",
): string {
  return ((cents ?? 0) / 100).toFixed(currencyDecimals(currency));
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  try {
    return parseISO(value);
  } catch {
    return null;
  }
}

export function formatDate(value: string | Date | null | undefined, fmt = "MMM d, yyyy") {
  const d = toDate(value);
  return d ? format(d, fmt) : "—";
}

export function formatDateTime(value: string | Date | null | undefined, fmt = "MMM d, yyyy · h:mm a") {
  const d = toDate(value);
  return d ? format(d, fmt) : "—";
}

/**
 * Local-calendar date key (YYYY-MM-DD), optionally `daysAgo` days back. Built
 * from LOCAL date parts — never `toISOString().slice(0,10)`, which is UTC and
 * shifts the day backward in positive-UTC zones (the recurring Furnza bug).
 */
export function toDateKey(daysAgo = 0): string {
  const d = new Date();
  if (daysAgo) d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Two-letter initials from a full name, for avatar fallbacks. */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Truncate long strings for table cells / previews. */
export function truncate(value: string | null | undefined, max = 60): string {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Format total minutes as "3h 25m" (printing time). 0/null → "—". */
export function formatMinutes(totalMinutes: number | null | undefined): string {
  const minutes = totalMinutes ?? 0;
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
