import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import { getOrderConfig } from "@/lib/orders/config";
import { PageHeader } from "@/components/states";
import { OrderForm } from "../order-form";
import type { StaffOption } from "@/app/api/staff/route";

export const metadata = { title: "New order" };

export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("orders.create")) redirect("/orders");

  const [config, staff] = await Promise.all([getOrderConfig(), loadStaffOptions()]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <PageHeader
        title="New order"
        description="Record a purchased order. Leave the code blank to auto-generate one."
      />
      <OrderForm
        mode="create"
        statuses={config.statuses}
        priorities={config.priorities}
        printers={config.printers}
        materials={config.materials}
        staff={staff}
        currency={config.currency}
        taxRatePercent={config.defaultTaxRate}
      />
    </div>
  );
}

async function loadStaffOptions(): Promise<StaffOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("id, full_name")
    .eq("is_active", true)
    .order("full_name", { ascending: true })
    .limit(100);
  return asRows<StaffOption>(data);
}
