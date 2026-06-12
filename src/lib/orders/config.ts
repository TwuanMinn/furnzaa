import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRow, asRows } from "@/lib/supabase/types";

/**
 * Order configuration: editable status list, priority labels/colors, currency
 * and default tax rate from Settings (single tiny row), PLUS the printer
 * catalog (printers table — Admin-managed brand + model rows, so new printers
 * need zero code changes). Cached per-worker for 60s; falls back to built-ins.
 */

export interface OrderStatusDef {
  key: string;
  label: string;
  color: string;
  isFinal: boolean;
}

export interface OrderPriorityDef {
  key: string;
  label: string;
  color: string;
}

/** A row of the Admin-managed printer catalog (brand + model). */
export interface PrinterDef {
  id: string;
  brand: string;
  model: string;
  color: string;
}

/** Admin-configurable filament/material with per-gram cost (cents). */
export interface MaterialTypeDef {
  key: string;
  label: string;
  color: string;
  cost_per_gram_cents: number;
  is_active: boolean;
}

export interface OrderConfig {
  statuses: OrderStatusDef[];
  priorities: OrderPriorityDef[];
  printers: PrinterDef[];
  materials: MaterialTypeDef[];
  currency: string;
  /** Percent, e.g. 8.5 */
  defaultTaxRate: number;
  codePrefix: string;
}

export const DEFAULT_ORDER_STATUSES: OrderStatusDef[] = [
  { key: "pending", label: "Pending", color: "slate", isFinal: false },
  { key: "processing", label: "Processing", color: "blue", isFinal: false },
  { key: "shipped", label: "Shipped", color: "indigo", isFinal: false },
  { key: "delivered", label: "Delivered", color: "green", isFinal: true },
  { key: "returned", label: "Returned", color: "amber", isFinal: true },
  { key: "cancelled", label: "Cancelled", color: "red", isFinal: true },
];

export const DEFAULT_ORDER_PRIORITIES: OrderPriorityDef[] = [
  { key: "low", label: "Low", color: "slate" },
  { key: "medium", label: "Medium", color: "blue" },
  { key: "high", label: "High", color: "amber" },
  { key: "extreme", label: "Extreme", color: "red" },
];

let cache: { at: number; value: OrderConfig } | null = null;

export async function getOrderConfig(): Promise<OrderConfig> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;

  const supabase = await createClient();
  const [{ data }, { data: printerData }] = await Promise.all([
    supabase
      .from("organization_settings")
      .select(
        "order_statuses, order_priorities, material_types, currency, default_tax_rate, order_code_prefix",
      )
      .eq("id", "org")
      .maybeSingle(),
    supabase
      .from("printers")
      .select("id, brand, model, badge_color")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("brand")
      .order("model"),
  ]);

  const row = asRow<{
    order_statuses: unknown;
    order_priorities: unknown;
    material_types: unknown;
    currency: string;
    default_tax_rate: number | string;
    order_code_prefix: string;
  }>(data);

  const statuses =
    Array.isArray(row?.order_statuses) && row.order_statuses.length > 0
      ? (row.order_statuses as OrderStatusDef[])
      : DEFAULT_ORDER_STATUSES;
  const priorities =
    Array.isArray(row?.order_priorities) && row.order_priorities.length > 0
      ? (row.order_priorities as OrderPriorityDef[])
      : DEFAULT_ORDER_PRIORITIES;
  const printers = asRows<{ id: string; brand: string; model: string; badge_color: string }>(
    printerData,
  ).map((p) => ({ id: p.id, brand: p.brand, model: p.model, color: p.badge_color }));
  const materials = (
    Array.isArray(row?.material_types) ? (row.material_types as MaterialTypeDef[]) : []
  ).filter((m) => m.is_active !== false);

  const value: OrderConfig = {
    statuses,
    priorities,
    printers,
    materials,
    currency: row?.currency ?? "USD",
    defaultTaxRate: Number(row?.default_tax_rate ?? 0),
    codePrefix: row?.order_code_prefix ?? "FZ",
  };
  cache = { at: Date.now(), value };
  return value;
}

/** Invalidate after Settings updates (or printer-catalog edits). */
export function invalidateOrderConfigCache(): void {
  cache = null;
}
