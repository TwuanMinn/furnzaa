import { z } from "zod";

/**
 * Shared (non-server-action) types + schema for the Profit Sharing calculator.
 * Kept OUT of sharing-actions.ts because a "use server" module may only export
 * async functions — exporting consts/schemas/zod from there breaks them on the
 * client (they get stripped/rewired). Import values from here, the action from
 * sharing-actions.ts.
 */

/** Currencies the Profit Sharing calculator supports (with locale formatting). */
export const SHARING_CURRENCIES = ["VND", "USD", "EUR", "GBP", "JPY"] as const;
export type SharingCurrency = (typeof SHARING_CURRENCIES)[number];

const partnerSchema = z.object({
  name: z.string().trim().max(60),
  percent: z.number().min(0).max(100),
});

export const profitSharingConfigSchema = z.object({
  partners: z.array(partnerSchema).min(2).max(10),
  currency: z.enum(SHARING_CURRENCIES),
  total: z.number().min(0).max(1e15),
});

export type ProfitSharingConfig = z.infer<typeof profitSharingConfigSchema>;

/** Minor-unit count per currency (VND / JPY have none). */
export const CURRENCY_FRACTION: Record<SharingCurrency, number> = {
  VND: 0,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
};

/** Intl locale per currency, for `Intl.NumberFormat` money formatting. */
export const CURRENCY_LOCALE: Record<SharingCurrency, string> = {
  VND: "vi-VN",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  JPY: "ja-JP",
};

/** Partner colors (10, one per partner) — shared by the editor and records. */
export const SHARING_PALETTE = [
  "#3b82f6", // blue
  "#22c55e", // green
  "#f97316", // orange
  "#ec4899", // pink
  "#a855f7", // purple
  "#eab308", // amber
  "#14b8a6", // teal
  "#f43f5e", // rose
  "#6366f1", // indigo
  "#84cc16", // lime
];

/** Format a plain (display-unit) amount in the given sharing currency. */
export function formatSharingMoney(amount: number, currency: SharingCurrency): string {
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency], {
    style: "currency",
    currency,
    maximumFractionDigits: CURRENCY_FRACTION[currency],
  }).format(Number.isFinite(amount) ? amount : 0);
}

/**
 * Split `total` across `weights` so the amounts sum EXACTLY to the allocated
 * pot (largest-remainder in minor units — no rounding drift). Pass the
 * unallocated remainder as a trailing weight to reconcile to the total. Shared
 * by the calculator UI (live amounts) and the record-save action (the server
 * recomputes amounts so it never trusts client math).
 */
export function allocateAmounts(total: number, weights: number[], fraction: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sumW = weights.reduce((a, b) => a + b, 0);
  const scale = 10 ** fraction;
  const potMinor = Math.round(Math.max(0, total) * scale);
  if (sumW <= 0 || potMinor <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w / sumW) * potMinor);
  const units = exact.map(Math.floor);
  let rem = potMinor - units.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; rem > 0 && k < order.length; k++, rem--) {
    const idx = order[k]!.i;
    units[idx] = (units[idx] ?? 0) + 1;
  }
  return units.map((u) => u / scale);
}

// ── Saved records (the Profit Sharing "collection") ──────────────────────────

const recordPartnerSchema = z.object({
  name: z.string().trim().max(60),
  percent: z.coerce.number().int().min(0).max(100),
});

/** Client → save-action payload. Amounts are recomputed server-side. */
export const profitSharingRecordInputSchema = z.object({
  label: z.string().trim().max(120).default(""),
  note: z.string().trim().max(2000).default(""),
  currency: z.enum(SHARING_CURRENCIES),
  total: z.coerce.number().min(0).max(1e15),
  partners: z.array(recordPartnerSchema).min(2).max(10),
});
export type ProfitSharingRecordInput = z.infer<typeof profitSharingRecordInputSchema>;

/** One partner inside a stored record. */
export interface SharingRecordPartner {
  name: string;
  percent: number;
  amount: number;
}

/** Row shape of `profit_sharing_records` the collection UI consumes. */
export interface SavedSharingRecord {
  id: string;
  created_by: string;
  created_by_name: string;
  label: string;
  note: string;
  currency: SharingCurrency;
  total: number;
  partners: SharingRecordPartner[];
  partner_count: number;
  created_at: string;
}
