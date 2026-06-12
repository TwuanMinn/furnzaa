import { withAuth } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";

export interface HeatmapDay {
  day: string;
  logins: number;
  actions: number;
}

/**
 * GET /api/users/[id]/heatmap — 12 months of the per-user-per-day rollup
 * (user_activity_daily, maintained incrementally by trigger — NEVER a live
 * activity_logs scan). Access: Admin sees anyone; Staff only themselves —
 * enforced here AND by the table's RLS policy underneath.
 */
export const GET = withAuth(async (_req, ctx) => {
  const params = await ctx.params;
  const id = params?.id;
  if (!id) return jsonError("Missing user id", 400);

  const { user } = ctx;
  if (id !== user.id && !user.permissions.has("users.view")) {
    return jsonError("You can only view your own activity heatmap", 403, "forbidden");
  }

  const since = new Date();
  since.setDate(since.getDate() - 365);
  const sinceIso = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_activity_daily")
    .select("day, logins, actions")
    .eq("user_id", id)
    .gte("day", sinceIso)
    .order("day", { ascending: true })
    .limit(400);
  if (error) return jsonError(error.message, 500);

  return jsonOk({ days: asRows<HeatmapDay>(data) });
});
