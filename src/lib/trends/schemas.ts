import { z } from "zod";

/** Shared validation for trend entries — client form + server action.
 * Lives outside actions.ts because "use server" modules may only export
 * async functions. */
export const trendSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(200),
  sourcePlatform: z.string().trim().min(1).max(60),
  sourceUrl: z.string().trim().url("Enter a valid link").max(1000).optional().or(z.literal("")),
  categoryId: z.string().uuid().nullable(),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  /** Up to 5 public storage URLs; the first is the cover. */
  images: z.array(z.string().url().max(1000)).max(5, "Up to 5 reference images"),
  estPrintMinutes: z.number().int().min(0).max(100_000).nullable(),
  suggestedMaterial: z.string().trim().max(60).optional().or(z.literal("")),
  estFilamentGrams: z.number().int().min(0).max(1_000_000).nullable(),
  /** Minor units (display × 100), like every other money column. */
  estSellingCents: z.number().int().min(0).max(1_000_000_000_000).nullable(),
  estCostCents: z.number().int().min(0).max(1_000_000_000_000).nullable(),
  popularityScore: z.number().int().min(1).max(100),
  tags: z.array(z.string().trim().min(1).max(40)).max(15),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
});
export type TrendInput = z.infer<typeof trendSchema>;
