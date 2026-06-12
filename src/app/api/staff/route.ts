import { withPermission } from "@/lib/api/with-permission";
import { jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import { ilikePattern } from "@/lib/datatable/server";

export interface StaffOption {
  id: string;
  full_name: string;
}

/**
 * GET /api/staff?q= — active staff options for assignment selects/filters.
 * Capped at 100; q narrows by name (trigram).
 */
export const GET = withPermission("orders.view", async (req) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  const supabase = await createClient();

  let query = supabase
    .from("users")
    .select("id, full_name")
    .eq("is_active", true)
    .order("full_name", { ascending: true })
    .limit(100);
  if (q) query = query.ilike("full_name", ilikePattern(q));

  const { data } = await query;
  return jsonOk({ staff: asRows<StaffOption>(data) });
});
