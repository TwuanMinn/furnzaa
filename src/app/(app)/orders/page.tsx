import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { getOrderConfig } from "@/lib/orders/config";
import { PageHeader } from "@/components/states";
import { OrderLookup } from "./order-lookup";
import { OrdersTable } from "./orders-table";

export const metadata = { title: "Customer Orders Hub" };

/**
 * Customer Orders Hub (Module 2): look up a customer and ALL their past
 * orders by order code / name / phone / email, plus the filterable,
 * exportable orders list. Staff see their own/assigned orders (RLS-scoped).
 */
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("orders.view")) redirect("/dashboard");

  const config = await getOrderConfig();

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <PageHeader
        title="Customer Orders Hub"
        description="Find a customer by order code, name, phone or email — or browse, filter and export all orders."
      />
      <OrderLookup />
      <OrdersTable
        statuses={config.statuses}
        priorities={config.priorities}
        printers={config.printers}
        materials={config.materials}
      />
    </div>
  );
}
