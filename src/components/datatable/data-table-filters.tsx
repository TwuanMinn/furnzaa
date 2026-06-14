"use client";

import { type ReactNode } from "react";
import { FilterX, ListFilter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { FilterDef } from "@/lib/datatable/types";

interface DataTableFiltersProps {
  defs: FilterDef[];
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
  onClear: () => void;
  hasSearch: boolean;
  viewToggle?: ReactNode;
}

const ALL = "__all__";

function isActive(def: FilterDef, values: Record<string, string>): boolean {
  if (def.type === "daterange") {
    return Boolean(values[`${def.id}_from`] || values[`${def.id}_to`]);
  }
  return Boolean(values[def.id]);
}

function activeLabel(def: FilterDef, values: Record<string, string>): string {
  if (def.type === "daterange") {
    return `${values[`${def.id}_from`] || "…"} → ${values[`${def.id}_to`] || "…"}`;
  }
  if (def.type === "select") {
    const v = values[def.id] ?? "";
    return def.options.find((o) => o.value === v)?.label ?? v;
  }
  return values[def.id] ?? "";
}

/**
 * Compact filter UI: one "Filters" button (count badge) opening a popover with
 * every control, plus removable chips for the filters that are actually set —
 * inactive filters take no toolbar space. Values feed the server query —
 * filtering always happens in the database, never client-side.
 */
export function DataTableFilters({ defs, values, onChange, onClear, hasSearch, viewToggle }: DataTableFiltersProps) {
  const activeDefs = defs.filter((def) => isActive(def, values));
  const activeCount = activeDefs.length + (hasSearch ? 1 : 0);

  function clearDef(def: FilterDef) {
    if (def.type === "daterange") {
      onChange(`${def.id}_from`, "");
      onChange(`${def.id}_to`, "");
    } else {
      onChange(def.id, "");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 font-normal">
            <ListFilter className="text-muted-foreground" />
            Filters
            {activeDefs.length > 0 ? (
              <span className="flex size-4.5 items-center justify-center rounded-full bg-primary text-[10px] font-medium tabular-nums text-primary-foreground">
                {activeDefs.length}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-[70vh] w-72 overflow-y-auto p-4">
          <div className="grid gap-3">
            {defs.map((def) => {
              switch (def.type) {
                case "select":
                  return (
                    <div key={def.id} className="grid gap-1.5">
                      <Label htmlFor={`flt-${def.id}`} className="text-xs text-muted-foreground">
                        {def.label}
                      </Label>
                      <Select
                        value={values[def.id] ?? ALL}
                        onValueChange={(v) => onChange(def.id, v === ALL ? "" : v)}
                      >
                        <SelectTrigger id={`flt-${def.id}`} size="sm" className="w-full" aria-label={def.label}>
                          <SelectValue placeholder={def.placeholder ?? "All"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL}>All</SelectItem>
                          {def.options.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                case "text":
                  return (
                    <div key={def.id} className="grid gap-1.5">
                      <Label htmlFor={`flt-${def.id}`} className="text-xs text-muted-foreground">
                        {def.label}
                      </Label>
                      <Input
                        id={`flt-${def.id}`}
                        value={values[def.id] ?? ""}
                        onChange={(e) => onChange(def.id, e.target.value)}
                        placeholder={def.placeholder ?? def.label}
                        className="h-8 text-sm"
                      />
                    </div>
                  );
                case "daterange": {
                  const from = values[`${def.id}_from`] ?? "";
                  const to = values[`${def.id}_to`] ?? "";
                  return (
                    <div key={def.id} className="grid gap-1.5">
                      <Label className="text-xs text-muted-foreground">{def.label}</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="date"
                          value={from}
                          max={to || undefined}
                          aria-label={`${def.label} from`}
                          onChange={(e) => onChange(`${def.id}_from`, e.target.value)}
                          className="h-8"
                        />
                        <Input
                          type="date"
                          value={to}
                          min={from || undefined}
                          aria-label={`${def.label} to`}
                          onChange={(e) => onChange(`${def.id}_to`, e.target.value)}
                          className="h-8"
                        />
                      </div>
                    </div>
                  );
                }
              }
            })}
            {viewToggle && (
              <div className="grid gap-1.5 border-t border-border pt-3 mt-1">
                <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  View Mode
                </Label>
                <div className="flex justify-start">
                  {viewToggle}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Only the filters that are set occupy toolbar space. */}
      {activeDefs.map((def) => (
        <span
          key={def.id}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-muted/40 pl-2.5 pr-1 text-sm"
        >
          <span className="text-muted-foreground">{def.label}:</span>
          <span className="max-w-40 truncate">{activeLabel(def, values)}</span>
          <button
            type="button"
            aria-label={`Clear ${def.label} filter`}
            onClick={() => clearDef(def)}
            className="ml-0.5 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}

      {activeCount > 0 ? (
        <Button variant="ghost" size="sm" onClick={onClear} className="gap-1.5 text-muted-foreground">
          <FilterX /> Clear ({activeCount})
        </Button>
      ) : null}
    </div>
  );
}
