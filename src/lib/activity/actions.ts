"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission, ForbiddenError, UnauthorizedError } from "@/lib/rbac/guards";
import { logActivity } from "./log";

export type PurgeResult = { ok: true; deleted: number } | { ok: false; error: string };

/**
 * Purge activity logs older than `days` (Admin, logs.purge). The log is
 * otherwise append-only — there is no edit path anywhere. The purge itself
 * is logged with the cutoff and row count.
 */
export async function purgeActivityLogsAction(days: number): Promise<PurgeResult> {
  try {
    const actor = await requirePermission("logs.purge");
    const clamped = Math.max(7, Math.min(3650, Math.floor(days)));
    const cutoff = new Date(Date.now() - clamped * 24 * 60 * 60 * 1000).toISOString();

    const admin = createAdminClient();
    const { error, count } = await admin
      .from("activity_logs")
      .delete({ count: "exact" })
      .lt("created_at", cutoff);
    if (error) return { ok: false, error: error.message };

    const deleted = count ?? 0;
    await logActivity({
      actor,
      action: "logs.purge",
      module: "logs",
      summary: `Purged ${deleted.toLocaleString()} activity log entr${deleted === 1 ? "y" : "ies"} older than ${clamped} days`,
      after: { cutoff, days: clamped, deleted },
    });
    return { ok: true, deleted };
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: "You are not signed in." };
    if (e instanceof ForbiddenError) return { ok: false, error: "You don't have permission to purge logs." };
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
