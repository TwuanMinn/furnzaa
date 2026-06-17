/**
 * Pure ROI helpers shared by the server (display) and client. All money in
 * ×100 cents; every ratio guards divide-by-zero (returns 0 when capital = 0),
 * matching the SQL in migration 0035.
 */

export type Tone = "ok" | "low" | "loss" | "muted";

/** Break-even badge mapping (mint = on-track/recovered, amber = at-risk, red = loss). */
export const BREAK_EVEN_META: Record<string, { label: string; tone: Tone }> = {
  recovered: { label: "Recovered", tone: "ok" },
  in_progress: { label: "In progress", tone: "muted" },
  underperforming: { label: "Underperforming", tone: "loss" },
  pending: { label: "Pending", tone: "muted" },
};

export function breakEvenMeta(status: string): { label: string; tone: Tone } {
  return BREAK_EVEN_META[status] ?? { label: status, tone: "muted" };
}

/** Tone for a signed value: positive = mint, zero = muted, negative = red. */
export function signTone(value: number): Tone {
  if (value > 0) return "ok";
  if (value < 0) return "loss";
  return "muted";
}

export interface PaybackPoint {
  profitCents: number;
  cumulativeRecoveredCents: number;
}

export interface PaybackEstimate {
  recovered: boolean;
  notRecoverable: boolean;
  monthsLeft: number | null;
  monthsToRecover: number | null;
  label: string;
}

/**
 * Payback period (spec): ACTUAL months to first cross capital when recovered,
 * else PROJECTED = remaining ÷ trailing-window avg monthly profit. Avg ≤ 0 →
 * "Not recoverable at current run rate".
 */
export function estimatePayback(
  totalCapitalCents: number,
  recoveredCents: number,
  series: PaybackPoint[],
  trailingWindow = 6,
): PaybackEstimate {
  if (totalCapitalCents <= 0) {
    return { recovered: false, notRecoverable: false, monthsLeft: null, monthsToRecover: null, label: "—" };
  }
  if (recoveredCents >= totalCapitalCents) {
    const idx = series.findIndex((p) => p.cumulativeRecoveredCents >= totalCapitalCents);
    const months = idx >= 0 ? idx + 1 : series.length;
    return {
      recovered: true,
      notRecoverable: false,
      monthsLeft: 0,
      monthsToRecover: months,
      label: `Recovered in ${months} month${months === 1 ? "" : "s"}`,
    };
  }
  const remaining = Math.max(0, totalCapitalCents - recoveredCents);
  const window = series.slice(-Math.max(1, trailingWindow));
  const avg = window.length ? window.reduce((s, p) => s + p.profitCents, 0) / window.length : 0;
  if (avg <= 0) {
    return {
      recovered: false,
      notRecoverable: true,
      monthsLeft: null,
      monthsToRecover: null,
      label: "Not recoverable at current run rate",
    };
  }
  const monthsLeft = Math.ceil(remaining / avg);
  return {
    recovered: false,
    notRecoverable: false,
    monthsLeft,
    monthsToRecover: null,
    label: `≈ ${monthsLeft} month${monthsLeft === 1 ? "" : "s"} left`,
  };
}

/** Add N whole months to a YYYY-MM-DD date string → YYYY-MM-DD (first of month). */
export function addMonths(isoDate: string, months: number): string {
  const [y, m] = isoDate.split("-").map(Number);
  const base = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1));
  base.setUTCMonth(base.getUTCMonth() + months);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
