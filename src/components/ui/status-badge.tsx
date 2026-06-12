import {
  badgeClass,
  DEFAULT_STATUS_COLORS,
  DEFAULT_PRIORITY_COLORS,
  DEFAULT_PAYMENT_COLORS,
} from "@/lib/badges";
import { cn } from "@/lib/utils";

const PILL_CLASS =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

/** Sentence-case a raw status/priority value for display. */
function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface StatusBadgeProps {
  status: string;
  color?: string;
  label?: string;
}

export function StatusBadge({ status, color, label }: StatusBadgeProps) {
  const resolvedColor = color ?? DEFAULT_STATUS_COLORS[status] ?? "slate";
  const resolvedLabel = label ?? capitalize(status);
  return <span className={cn(PILL_CLASS, badgeClass(resolvedColor))}>{resolvedLabel}</span>;
}

export interface PriorityBadgeProps {
  priority: string;
  color?: string;
  label?: string;
}

export function PriorityBadge({ priority, color, label }: PriorityBadgeProps) {
  const resolvedColor = color ?? DEFAULT_PRIORITY_COLORS[priority] ?? "slate";
  const resolvedLabel = label ?? capitalize(priority);
  return <span className={cn(PILL_CLASS, badgeClass(resolvedColor))}>{resolvedLabel}</span>;
}

export interface PaymentBadgeProps {
  status: string;
  color?: string;
  label?: string;
}

export function PaymentBadge({ status, color, label }: PaymentBadgeProps) {
  const resolvedColor = color ?? DEFAULT_PAYMENT_COLORS[status] ?? "slate";
  const resolvedLabel = label ?? capitalize(status);
  return <span className={cn(PILL_CLASS, badgeClass(resolvedColor))}>{resolvedLabel}</span>;
}
