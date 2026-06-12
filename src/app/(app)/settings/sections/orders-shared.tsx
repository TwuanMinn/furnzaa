"use client";

import { badgeClass, type BadgeColor } from "@/lib/badges";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Shared bits for the Orders settings cards: the badge palette select, the
 * label → machine-key slug used for NEW rows, and stable render ids so list
 * rows never key off the array index.
 */

export const BADGE_COLOR_OPTIONS = [
  "slate",
  "blue",
  "indigo",
  "green",
  "amber",
  "red",
  "violet",
] as const satisfies readonly BadgeColor[];

export function toBadgeColor(color: string): BadgeColor {
  return (BADGE_COLOR_OPTIONS as readonly string[]).includes(color)
    ? (color as BadgeColor)
    : "slate";
}

/**
 * Derive a stable machine key from a label (new rows only — existing rows keep
 * their key forever). Lowercase, non-alphanumerics → "_", must start with a
 * letter (prefixed "s_" when it doesn't).
 */
export function slugifyKey(label: string): string {
  let key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!/^[a-z]/.test(key)) key = `s_${key}`;
  if (key.length < 2) key += "_";
  return key.slice(0, 40);
}

let ridSeq = 0;
/** Render-only id for rows that don't have a machine key yet. */
export function newRid(): string {
  ridSeq += 1;
  return `new_${ridSeq}`;
}

/** Badge-color picker: each option shows a small dot tinted via badgeClass. */
export function ColorSelect({
  value,
  onChange,
  disabled,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (color: BadgeColor) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={(v: string) => onChange(toBadgeColor(v))} disabled={disabled}>
      <SelectTrigger className={className ?? "h-8 w-32"} aria-label={ariaLabel ?? "Badge color"}>
        <SelectValue placeholder="Color" />
      </SelectTrigger>
      <SelectContent>
        {BADGE_COLOR_OPTIONS.map((c) => (
          <SelectItem key={c} value={c}>
            <span className="flex items-center gap-2">
              <span
                className={`inline-block size-2.5 shrink-0 rounded-full ring-1 ring-inset ${badgeClass(c)}`}
                aria-hidden="true"
              />
              <span className="capitalize">{c}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
