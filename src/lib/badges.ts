/**
 * Maps the semantic color names stored in Settings (order_statuses /
 * order_priorities use "slate" | "blue" | "indigo" | "green" | "amber" | "red")
 * to Tailwind badge classes. Kept in one place so status/priority pills look
 * identical everywhere. Colors meet AA contrast in light and dark.
 */
export type BadgeColor = "slate" | "blue" | "indigo" | "green" | "amber" | "red" | "violet";

export const BADGE_CLASSES: Record<BadgeColor, string> = {
  slate:
    "bg-slate-100 text-slate-700 ring-slate-600/20 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-400/30",
  blue: "bg-blue-100 text-blue-700 ring-blue-600/20 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/30",
  indigo:
    "bg-indigo-100 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-400/10 dark:text-indigo-300 dark:ring-indigo-400/30",
  green:
    "bg-emerald-100 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30",
  amber:
    "bg-amber-100 text-amber-800 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30",
  red: "bg-red-100 text-red-700 ring-red-600/20 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/30",
  violet:
    "bg-violet-100 text-violet-700 ring-violet-600/20 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/30",
};

export function badgeClass(color: string | null | undefined): string {
  return BADGE_CLASSES[(color as BadgeColor) ?? "slate"] ?? BADGE_CLASSES.slate;
}

/** Fallback color maps when Settings hasn't customized a status/priority. */
export const DEFAULT_STATUS_COLORS: Record<string, BadgeColor> = {
  pending: "slate",
  processing: "blue",
  shipped: "indigo",
  delivered: "green",
  returned: "amber",
  cancelled: "red",
};

export const DEFAULT_PRIORITY_COLORS: Record<string, BadgeColor> = {
  low: "slate",
  medium: "blue",
  high: "amber",
  extreme: "red",
};

export const DEFAULT_PAYMENT_COLORS: Record<string, BadgeColor> = {
  paid: "green",
  unpaid: "amber",
  refunded: "violet",
};
