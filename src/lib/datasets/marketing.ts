import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRow, asRows } from "@/lib/supabase/types";
import {
  buildPage,
  ilikePattern,
  keysetOrExpression,
  type ParsedListQuery,
} from "@/lib/datatable/server";

/** Marketing datasets (Module 6): campaigns list + per-campaign stats. */

export type CampaignListRow = {
  id: string;
  name: string;
  audience_type: "all" | "tier" | "segment" | "custom";
  audience_value: Record<string, unknown>;
  channel: "email" | "sms" | "whatsapp" | "in_app";
  subject: string | null;
  template: string;
  status: "draft" | "scheduled" | "running" | "completed" | "cancelled";
  schedule_at: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  voucher: { code: string } | null;
  created_by_user: { full_name: string } | null;
};

const LIST_COLUMNS =
  "id, name, audience_type, audience_value, channel, subject, template, status, schedule_at, " +
  "total_recipients, sent_count, failed_count, started_at, completed_at, created_at, " +
  "voucher:vouchers(code), created_by_user:users!marketing_campaigns_created_by_fkey(full_name)";

export const CAMPAIGN_SORTABLE: Record<string, string> = {
  created_at: "created_at",
  name: "name",
};

export async function fetchCampaignsPage(parsed: ParsedListQuery) {
  const supabase = await createClient();

  let query = supabase
    .from("marketing_campaigns")
    .select(LIST_COLUMNS, parsed.cursor ? {} : { count: "estimated" })
    .is("deleted_at", null);

  if (parsed.q) query = query.ilike("name", ilikePattern(parsed.q));
  const status = parsed.filters["status"];
  if (status) query = query.eq("status", status);
  const channel = parsed.filters["channel"];
  if (channel) query = query.eq("channel", channel);

  if (parsed.cursor) {
    query = query.or(keysetOrExpression(parsed.cursor, parsed.sort, parsed.ascending));
  }

  const { data, error, count } = await query
    .order(parsed.sort, { ascending: parsed.ascending })
    .order("id", { ascending: parsed.ascending })
    .limit(parsed.limit + 1);

  if (error) throw new Error(error.message);
  return buildPage(asRows<CampaignListRow>(data), parsed.limit, parsed.sort, count ?? null);
}

export type CampaignStatsRow = {
  campaign_id: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  converted: number;
  bounced: number;
  unsubscribed: number;
  revenue_cents: number;
  redemptions: number;
  refreshed_at: string;
};

/** Pre-aggregated stats (campaign_stats) — never the raw event stream. */
export async function fetchCampaignStats(campaignId: string): Promise<CampaignStatsRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaign_stats")
    .select("*")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  return asRow<CampaignStatsRow>(data);
}

export type AutomationRuleRow = {
  id: string;
  name: string;
  event_type: "tier_reached" | "inactivity" | "birthday" | "spend_threshold";
  condition: Record<string, unknown>;
  action_type: "issue_voucher" | "send_notification" | "upgrade_tier" | "send_campaign";
  action_config: Record<string, unknown>;
  is_enabled: boolean;
  last_run_at: string | null;
  created_at: string;
};

export async function fetchAutomationRules(): Promise<AutomationRuleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automation_rules")
    .select("id, name, event_type, condition, action_type, action_config, is_enabled, last_run_at, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return asRows<AutomationRuleRow>(data);
}
