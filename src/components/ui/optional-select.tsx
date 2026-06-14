"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Sentinel — Radix Select forbids an empty-string item value. */
const NONE = "__none__";

export interface OptionalSelectOption {
  value: string;
  label: string;
}

/**
 * A Radix Select with a built-in "none" choice. Radix can't use "" as an item
 * value, so this maps `""` ⇄ a private sentinel internally: callers work purely
 * in terms of the empty string (nothing selected) and real values.
 */
export function OptionalSelect({
  value,
  onChange,
  options,
  emptyLabel,
  placeholder,
  id,
  className = "w-full",
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: OptionalSelectOption[];
  /** Label for the built-in "none" item (e.g. "Unassigned", "Not set"). */
  emptyLabel: string;
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value || NONE}
      onValueChange={(v) => onChange(v === NONE ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{emptyLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
