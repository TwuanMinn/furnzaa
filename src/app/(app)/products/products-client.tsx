"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/lib/rbac/context";
import type { CategoryOption, WarehouseOption } from "./page";
import { ProductsTab } from "./products-tab";
import { MovementsTab } from "./movements-tab";
import { SuppliersTab } from "./suppliers-tab";
import { PurchaseOrdersTab } from "./purchase-orders-tab";
import { ProductionTab } from "./production-tab";

/** Five permission-gated tabs; each list rides the shared DataTable. */
export function ProductsClient({
  categories,
  warehouses,
}: {
  categories: CategoryOption[];
  warehouses: WarehouseOption[];
}) {
  const { has } = usePermissions();

  return (
    <Tabs defaultValue="products">
      <TabsList className="flex-wrap">
        <TabsTrigger value="products">Products</TabsTrigger>
        {has("inventory.view") ? <TabsTrigger value="movements">Stock ledger</TabsTrigger> : null}
        {has("suppliers.view") ? <TabsTrigger value="suppliers">Suppliers</TabsTrigger> : null}
        {has("purchase_orders.view") ? (
          <TabsTrigger value="purchase-orders">Purchase orders</TabsTrigger>
        ) : null}
        {has("production.view") ? <TabsTrigger value="production">Production</TabsTrigger> : null}
      </TabsList>

      <TabsContent value="products" className="mt-4">
        <ProductsTab categories={categories} warehouses={warehouses} />
      </TabsContent>
      <TabsContent value="movements" className="mt-4">
        <MovementsTab warehouses={warehouses} />
      </TabsContent>
      <TabsContent value="suppliers" className="mt-4">
        <SuppliersTab />
      </TabsContent>
      <TabsContent value="purchase-orders" className="mt-4">
        <PurchaseOrdersTab />
      </TabsContent>
      <TabsContent value="production" className="mt-4">
        <ProductionTab />
      </TabsContent>
    </Tabs>
  );
}
