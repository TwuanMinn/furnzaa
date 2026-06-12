"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/lib/rbac/context";
import type { SegmentRow, TierRow } from "@/lib/datasets/crm";
import { CustomersTab } from "./customers-tab";
import { TiersTab } from "./tiers-tab";
import { VouchersTab } from "./vouchers-tab";
import { SegmentsTab } from "./segments-tab";

export function CrmClient({
  tiers,
  segments,
  currency,
  focusCustomerId,
}: {
  tiers: TierRow[];
  segments: SegmentRow[];
  currency: string;
  focusCustomerId: string | null;
}) {
  const { has } = usePermissions();

  return (
    <Tabs defaultValue="customers">
      <TabsList className="flex-wrap">
        <TabsTrigger value="customers">Customers</TabsTrigger>
        <TabsTrigger value="tiers">Tiers & benefits</TabsTrigger>
        {has("vouchers.view") ? <TabsTrigger value="vouchers">Vouchers</TabsTrigger> : null}
        <TabsTrigger value="segments">Segments</TabsTrigger>
      </TabsList>

      <TabsContent value="customers" className="mt-4">
        <CustomersTab
          tiers={tiers}
          segments={segments}
          currency={currency}
          focusCustomerId={focusCustomerId}
        />
      </TabsContent>
      <TabsContent value="tiers" className="mt-4">
        <TiersTab tiers={tiers} currency={currency} />
      </TabsContent>
      <TabsContent value="vouchers" className="mt-4">
        <VouchersTab currency={currency} />
      </TabsContent>
      <TabsContent value="segments" className="mt-4">
        <SegmentsTab segments={segments} tiers={tiers} />
      </TabsContent>
    </Tabs>
  );
}
