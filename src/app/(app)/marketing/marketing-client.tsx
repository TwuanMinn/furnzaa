"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SegmentRow, TierRow } from "@/lib/datasets/crm";
import type { AutomationRuleRow } from "@/lib/datasets/marketing";
import type { VoucherOption } from "./page";
import { CampaignsTab } from "./campaigns-tab";
import { RulesTab } from "./rules-tab";

export function MarketingClient({
  segments,
  tiers,
  rules,
  vouchers,
  focusCampaignId,
}: {
  segments: SegmentRow[];
  tiers: TierRow[];
  rules: AutomationRuleRow[];
  vouchers: VoucherOption[];
  focusCampaignId: string | null;
}) {
  return (
    <Tabs defaultValue="campaigns">
      <TabsList>
        <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
        <TabsTrigger value="rules">Automation rules</TabsTrigger>
      </TabsList>

      <TabsContent value="campaigns" className="mt-4">
        <CampaignsTab
          segments={segments}
          tiers={tiers}
          vouchers={vouchers}
          focusCampaignId={focusCampaignId}
        />
      </TabsContent>
      <TabsContent value="rules" className="mt-4">
        <RulesTab rules={rules} />
      </TabsContent>
    </Tabs>
  );
}
