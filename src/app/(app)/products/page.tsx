import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import { PageHeader } from "@/components/states";
import { ProductsClient } from "./products-client";

export const metadata = { title: "Products & Inventory" };

export interface CategoryOption {
  id: string;
  name: string;
}

export interface WarehouseOption {
  id: string;
  name: string;
  is_default: boolean;
}

/**
 * Products & Inventory (Module 3): catalog, atomic stock ledger, suppliers,
 * purchase orders and production — one hub, five tabs, all on the shared
 * DataTable with live stock via Supabase Realtime.
 */
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("products.view")) redirect("/dashboard");

  const supabase = await createClient();
  const [categoriesRes, warehousesRes] = await Promise.all([
    supabase
      .from("product_categories")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .limit(200),
    supabase
      .from("warehouses")
      .select("id, name, is_default")
      .is("deleted_at", null)
      .order("is_default", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <PageHeader
        title="Products & Inventory"
        description="Catalog, stock ledger, suppliers, purchase orders and production. Every stock change is an atomic, attributed movement."
      />
      <ProductsClient
        categories={asRows<CategoryOption>(categoriesRes.data)}
        warehouses={asRows<WarehouseOption>(warehousesRes.data)}
      />
    </div>
  );
}
