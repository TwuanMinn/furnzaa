import { z } from "zod";

/**
 * Shared (non-"use server") schemas + types for the ROI & Investment Recovery
 * Tracker (Module 15). Kept out of the actions file so client components and
 * datasets can import the types/zod without pulling a server module.
 *
 * Money crosses the wire as PLAIN display units (đồng), like the calculator
 * inputs; the server converts to ×100 cents before the RPC.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const investmentSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  categoryId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(4000).optional().default(""),
  notes: z.string().trim().max(4000).optional().default(""),
  startDate: z.string().regex(DATE_RE, "Start date must be YYYY-MM-DD"),
  expectedPaybackMonths: z.coerce.number().int().min(0).max(600).nullable().optional(),
  status: z.string().trim().min(1).max(40).default("active"),
  assignedTo: z.string().uuid().nullable().optional(),
  /** Products whose delivered+paid order revenue auto-attributes to this investment. */
  attributionProductIds: z.array(z.string().uuid()).max(500).optional(),
});
export type InvestmentInput = z.infer<typeof investmentSchema>;

export const FLOW_TYPES = ["capital", "revenue", "cost"] as const;
export type FlowType = (typeof FLOW_TYPES)[number];

export const cashFlowSchema = z.object({
  investmentId: z.string().uuid(),
  flowType: z.enum(FLOW_TYPES),
  amount: z.coerce.number().positive("Amount must be greater than 0").max(1e13),
  entryDate: z.string().regex(DATE_RE, "Entry date must be YYYY-MM-DD"),
  notes: z.string().trim().max(1000).optional().default(""),
});
export type CashFlowInput = z.infer<typeof cashFlowSchema>;

// ── Dashboard shapes (returned by /api/roi) ──────────────────────────────────

export interface RoiKpis {
  investmentCount: number;
  totalCapitalCents: number;
  totalRevenueCents: number;
  totalCostCents: number;
  recoveredCents: number;
  remainingCents: number;
  roiPct: number;
  recoveryPct: number;
  recoveredCount: number;
  inProgressCount: number;
  underperformingCount: number;
}

export interface RoiSeriesPoint {
  month: string; // YYYY-MM-DD (first of month)
  investedCents: number;
  profitCents: number;
  cumulativeInvestedCents: number;
  cumulativeRecoveredCents: number;
  roiPct: number; // cumulative ROI% to date
}

export interface RoiBreakdown {
  id: string | null;
  name: string;
  color: string;
  investmentCount: number;
  totalCapitalCents: number;
  recoveredCents: number;
  remainingCents: number;
  roiPct: number;
  recoveryPct: number;
}

export interface RoiData {
  scope: "portfolio" | "investment";
  investmentName?: string;
  expectedPaybackMonths?: number | null;
  startDate?: string | null;
  breakEvenStatus?: string;
  kpis: RoiKpis;
  series: RoiSeriesPoint[];
  categories: RoiBreakdown[];
  projects: RoiBreakdown[];
}

// ── DataTable row shapes ─────────────────────────────────────────────────────

export type InvestmentListRow = {
  id: string;
  name: string;
  category_id: string | null;
  project_id: string | null;
  category_name: string | null;
  category_color: string | null;
  project_name: string | null;
  project_color: string | null;
  total_capital_cents: number;
  recovered_cents: number;
  remaining_cents: number;
  roi_pct: number;
  recovery_pct: number;
  break_even_status: string;
  status: string;
  start_date: string;
  created_at: string;
}

export type InvestmentMonthlyRow = {
  id: string;
  investment_id: string;
  period_month: string;
  capital_cents: number;
  revenue_cents: number;
  cost_cents: number;
  profit_cents: number;
  cumulative_invested_cents: number;
  cumulative_profit_cents: number;
  remaining_recovery_cents: number;
  roi_to_date_pct: number;
  recovery_to_date_pct: number;
}
