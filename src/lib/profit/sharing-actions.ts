"use server";

import { createClient } from "@/lib/supabase/server";
import { dbInsert } from "@/lib/supabase/types";
import { requirePermission } from "@/lib/rbac/guards";
import { fail, type ActionResult } from "@/lib/actions/result";
import { profitSharingConfigSchema, type ProfitSharingConfig } from "./sharing";

/**
 * Persist the caller's Profit Sharing configuration to their user_preferences
 * row (RLS-scoped to the owner) so it survives a browser clear. Called debounced
 * from the client whenever the split changes.
 *
 * NOTE: a "use server" module may export ONLY async functions — the constant,
 * schema and types live in ./sharing.ts.
 */
export async function saveProfitSharingAction(config: ProfitSharingConfig): Promise<ActionResult> {
  try {
    const actor = await requirePermission("profit.view");
    const parsed = profitSharingConfigSchema.safeParse(config);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid configuration" };
    }
    const supabase = await createClient(); // RLS: own user_preferences row
    const { error } = await supabase
      .from("user_preferences")
      .upsert(
        dbInsert("user_preferences", {
          user_id: actor.id,
          profit_sharing_config: parsed.data,
        }),
        { onConflict: "user_id" },
      );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
