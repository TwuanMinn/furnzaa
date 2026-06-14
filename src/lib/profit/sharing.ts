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
  partners: z.array(partnerSchema).min(2).max(6),
  currency: z.enum(SHARING_CURRENCIES),
  total: z.number().min(0).max(1e15),
});

export type ProfitSharingConfig = z.infer<typeof profitSharingConfigSchema>;
