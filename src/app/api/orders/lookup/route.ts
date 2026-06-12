import { withPermission } from "@/lib/api/with-permission";
import { jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import { ilikeAnyExpression, ilikePattern } from "@/lib/datatable/server";

export interface LookupOrderHit {
  id: string;
  order_code: string;
  status: string;
  buying_date: string;
  total_cents: number;
  currency: string;
  customers: { id: string; name: string } | null;
}

export interface LookupCustomerHit {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

/**
 * GET /api/orders/lookup?q= — the Hub's customer/order finder. Matches order
 * CODES (trigram) and customers by name/phone/email (trigram), each capped at
 * a handful of rows so the dropdown stays instant even at millions of rows.
 */
export const GET = withPermission("customers.view", async (req) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return jsonOk({ orders: [], customers: [] });

  const supabase = await createClient();
  const pattern = ilikePattern(q);

  const [ordersRes, customersRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_code, status, buying_date, total_cents, currency, customers(id, name)")
      .eq("is_active", true)
      .ilike("order_code", pattern)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("customers")
      .select("id, name, email, phone")
      .eq("is_active", true)
      .or(ilikeAnyExpression(["name", "email", "phone"], q))
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  return jsonOk({
    orders: asRows<LookupOrderHit>(ordersRes.data),
    customers: asRows<LookupCustomerHit>(customersRes.data),
  });
});
