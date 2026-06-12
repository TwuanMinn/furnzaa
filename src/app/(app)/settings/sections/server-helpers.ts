import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRow } from "@/lib/supabase/types";

/**
 * Raw order-config jsonb for the Settings editors. Unlike getOrderConfig()
 * this is uncached, includes INACTIVE materials and custom_order_fields, and
 * maps to the camelCase editor contract.
 */
export async function getOrderConfigRaw(): Promise<{
  statuses: { key: string; label: string; color: string; isFinal: boolean }[];
  priorities: { key: string; label: string; color: string }[];
  customFields: { key: string; label: string; type: "text" | "number" | "date" }[];
  materials: {
    key: string;
    label: string;
    color: string;
    costPerGramCents: number;
    isActive: boolean;
  }[];
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_settings")
    .select("order_statuses, order_priorities, custom_order_fields, material_types")
    .eq("id", "org")
    .maybeSingle();
  const row = asRow<{
    order_statuses: unknown;
    order_priorities: unknown;
    custom_order_fields: unknown;
    material_types: unknown;
  }>(data);

  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

  return {
    statuses: arr(row?.order_statuses).map((s) => ({
      key: String(s.key ?? ""),
      label: String(s.label ?? ""),
      color: String(s.color ?? "slate"),
      isFinal: s.isFinal === true,
    })),
    priorities: arr(row?.order_priorities).map((p) => ({
      key: String(p.key ?? ""),
      label: String(p.label ?? ""),
      color: String(p.color ?? "slate"),
    })),
    customFields: arr(row?.custom_order_fields).map((f) => ({
      key: String(f.key ?? ""),
      label: String(f.label ?? ""),
      type: f.type === "number" || f.type === "date" ? f.type : "text",
    })),
    materials: arr(row?.material_types).map((m) => ({
      key: String(m.key ?? ""),
      label: String(m.label ?? ""),
      color: String(m.color ?? "slate"),
      costPerGramCents: typeof m.cost_per_gram_cents === "number" ? m.cost_per_gram_cents : 0,
      isActive: m.is_active !== false,
    })),
  };
}
