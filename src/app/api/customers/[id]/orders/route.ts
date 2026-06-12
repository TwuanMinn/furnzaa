import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import { buildPage, decodeCursor, keysetOrExpression } from "@/lib/datatable/server";

export type CustomerOrderRow = {
  id: string;
  order_code: string;
  buying_date: string;
  status: string;
  priority: string;
  payment_status: string;
  total_cents: number;
  currency: string;
  delivery_date: string | null;
  created_at: string;
};

/**
 * GET /api/customers/[id]/orders — ALL of one customer's orders,
 * chronological (newest first), cursor-paginated. Rides the
 * idx_orders_customer index; RLS scopes what staff can see.
 */
export const GET = withPermission("customers.view", async (req, ctx) => {
  const params = await ctx.params;
  const customerId = params?.id;
  if (!customerId) return jsonError("Missing customer id", 400);

  const url = new URL(req.url);
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 25) || 25, 1), 50);

  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select(
      "id, order_code, buying_date, status, priority, payment_status, total_cents, currency, delivery_date, created_at",
    )
    .eq("customer_id", customerId)
    .eq("is_active", true);

  if (cursor) query = query.or(keysetOrExpression(cursor, "buying_date", false));

  const { data, error } = await query
    .order("buying_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (error) return jsonError(error.message, 500);
  return jsonOk(buildPage(asRows<CustomerOrderRow>(data), limit, "buying_date", null));
});
