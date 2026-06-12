import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Mail, Phone, UserRound } from "lucide-react";

import { getSessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { asRow } from "@/lib/supabase/types";
import { getOrderConfig } from "@/lib/orders/config";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { CustomerOrdersList } from "./customer-orders-list";

export const metadata = { title: "Customer orders" };

type CustomerProfile = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
};

/**
 * Customer profile header + ALL their orders, chronological. The lifetime
 * stats aggregate only THIS customer's rows (rides idx_orders_customer — a
 * few rows even at millions of total orders; visibility is RLS-scoped).
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("customers.view")) redirect("/dashboard");

  const supabase = await createClient();
  const [customerRes, statsRes, config] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, email, phone, notes, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("total_cents, currency, status")
      .eq("customer_id", id)
      .eq("is_active", true)
      .limit(10_000),
    getOrderConfig(),
  ]);

  const customer = asRow<CustomerProfile>(customerRes.data);
  if (!customer) notFound();

  const orders = (statsRes.data ?? []) as { total_cents: number; currency: string; status: string }[];
  const orderCount = orders.length;
  const lifetimeCents = orders.reduce((acc, o) => acc + o.total_cents, 0);
  const deliveredCount = orders.filter((o) => o.status === "delivered").length;
  const currency = orders[0]?.currency ?? config.currency;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div className="space-y-2">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> Customer Orders Hub
        </Link>
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <UserRound className="size-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
              {customer.email ? (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" aria-hidden /> {customer.email}
                </span>
              ) : null}
              {customer.phone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5" aria-hidden /> {customer.phone}
                </span>
              ) : null}
              <span>Customer since {formatDate(customer.created_at)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Orders</p>
            <p className="text-2xl font-semibold tabular-nums">{orderCount.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Delivered</p>
            <p className="text-2xl font-semibold tabular-nums">{deliveredCount.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Lifetime spend</p>
            <p className="text-2xl font-semibold tabular-nums">{formatMoney(lifetimeCents, currency)}</p>
          </CardContent>
        </Card>
      </div>

      <CustomerOrdersList
        customerId={customer.id}
        statuses={config.statuses}
        priorities={config.priorities}
      />
    </div>
  );
}
