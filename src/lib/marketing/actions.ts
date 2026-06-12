"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, dbInsert, dbUpdate } from "@/lib/supabase/types";
import { requirePermission, ForbiddenError, UnauthorizedError } from "@/lib/rbac/guards";
import { logActivity } from "@/lib/activity/log";
import { processCampaignBatch } from "./pipeline";

/** Marketing server actions: campaign lifecycle + automation rule management. */

export type MarketingResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof UnauthorizedError) return { ok: false, error: "You are not signed in." };
  if (e instanceof ForbiddenError) return { ok: false, error: "You don't have permission to do that." };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

const campaignSchema = z
  .object({
    name: z.string().trim().min(2, "Name the campaign").max(200),
    channel: z.enum(["email", "sms", "whatsapp", "in_app"]),
    subject: z.string().trim().max(300).optional().or(z.literal("")),
    template: z.string().trim().min(5, "Write the message template").max(20_000),
    audienceType: z.enum(["all", "tier", "segment"]),
    tierKeys: z.array(z.string()).max(20).default([]),
    segmentId: z.string().uuid().optional().or(z.literal("")),
    voucherId: z.string().uuid().optional().or(z.literal("")),
    /** Empty = send on next cron tick; ISO datetime = scheduled. */
    scheduleAt: z.string().optional().or(z.literal("")),
  })
  .refine((v) => v.audienceType !== "tier" || v.tierKeys.length > 0, {
    message: "Pick at least one tier",
    path: ["tierKeys"],
  })
  .refine((v) => v.audienceType !== "segment" || !!v.segmentId, {
    message: "Pick a segment",
    path: ["segmentId"],
  });
export type CampaignInput = z.infer<typeof campaignSchema>;

export async function createCampaignAction(
  input: CampaignInput,
  launch: boolean,
): Promise<MarketingResult<{ id: string }>> {
  try {
    const actor = await requirePermission("campaigns.create");
    if (launch) await requirePermission("campaigns.send");
    const parsed = campaignSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;

    const audienceValue =
      v.audienceType === "tier"
        ? { tier_keys: v.tierKeys }
        : v.audienceType === "segment"
          ? { segment_id: v.segmentId }
          : {};

    const scheduled = launch && v.scheduleAt ? new Date(v.scheduleAt) : null;
    const status = !launch ? "draft" : scheduled && scheduled.getTime() > Date.now() ? "scheduled" : "running";

    const supabase = await createClient(); // RLS: admin-only insert
    const { data, error } = await supabase
      .from("marketing_campaigns")
      .insert(
        dbInsert("marketing_campaigns", {
          name: v.name,
          channel: v.channel,
          subject: v.subject || null,
          template: v.template,
          audience_type: v.audienceType,
          audience_value: audienceValue as never,
          voucher_id: v.voucherId || null,
          schedule_at: scheduled ? scheduled.toISOString() : null,
          status,
          started_at: status === "running" ? new Date().toISOString() : null,
          created_by: actor.id,
        }),
      )
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Failed to create campaign" };
    const id = (data as { id: string }).id;

    void logActivity({
      actor,
      action: launch ? "campaign.send" : "campaign.create",
      module: "marketing",
      targetType: "campaign",
      targetId: id,
      summary:
        status === "draft"
          ? `Created draft campaign “${v.name}” (${v.channel})`
          : status === "scheduled"
            ? `Scheduled campaign “${v.name}” for ${scheduled?.toLocaleString()}`
            : `Launched campaign “${v.name}” (${v.channel})`,
      after: { channel: v.channel, audience: v.audienceType, status },
    });

    // Kick the first slice immediately so small audiences finish without
    // waiting for the next cron tick (the tick remains the safety net).
    if (status === "running") {
      void processCampaignBatch(id).catch((e) => console.error("[marketing] first batch failed:", e));
    }

    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

/** Launch a draft now (or schedule it) — same guards as create+launch. */
export async function launchCampaignAction(
  campaignId: string,
  scheduleAt?: string,
): Promise<MarketingResult> {
  try {
    const actor = await requirePermission("campaigns.send");
    if (!z.string().uuid().safeParse(campaignId).success) return { ok: false, error: "Invalid campaign" };

    const admin = createAdminClient();
    const { data: campaignRaw } = await admin
      .from("marketing_campaigns")
      .select("name, status")
      .eq("id", campaignId)
      .maybeSingle();
    const campaign = asRow<{ name: string; status: string }>(campaignRaw);
    if (!campaign) return { ok: false, error: "Campaign not found" };
    if (campaign.status !== "draft" && campaign.status !== "scheduled") {
      return { ok: false, error: `Only draft/scheduled campaigns can launch (currently ${campaign.status}).` };
    }

    const scheduled = scheduleAt ? new Date(scheduleAt) : null;
    const status = scheduled && scheduled.getTime() > Date.now() ? "scheduled" : "running";

    const { error } = await admin
      .from("marketing_campaigns")
      .update(
        dbUpdate("marketing_campaigns", {
          status,
          schedule_at: scheduled ? scheduled.toISOString() : null,
          started_at: status === "running" ? new Date().toISOString() : null,
        }),
      )
      .eq("id", campaignId);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: status === "scheduled" ? "campaign.schedule" : "campaign.send",
      module: "marketing",
      targetType: "campaign",
      targetId: campaignId,
      summary:
        status === "scheduled"
          ? `Scheduled campaign “${campaign.name}” for ${scheduled?.toLocaleString()}`
          : `Launched campaign “${campaign.name}”`,
    });

    if (status === "running") {
      void processCampaignBatch(campaignId).catch((e) =>
        console.error("[marketing] first batch failed:", e),
      );
    }
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelCampaignAction(campaignId: string): Promise<MarketingResult> {
  try {
    const actor = await requirePermission("campaigns.send");
    if (!z.string().uuid().safeParse(campaignId).success) return { ok: false, error: "Invalid campaign" };

    const admin = createAdminClient();
    const { data: campaignRaw } = await admin
      .from("marketing_campaigns")
      .select("name, status")
      .eq("id", campaignId)
      .maybeSingle();
    const campaign = asRow<{ name: string; status: string }>(campaignRaw);
    if (!campaign) return { ok: false, error: "Campaign not found" };
    if (campaign.status === "completed" || campaign.status === "cancelled") {
      return { ok: false, error: `Campaign is already ${campaign.status}.` };
    }

    const { error } = await admin
      .from("marketing_campaigns")
      .update(dbUpdate("marketing_campaigns", { status: "cancelled", completed_at: new Date().toISOString() }))
      .eq("id", campaignId);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "campaign.cancel",
      module: "marketing",
      targetType: "campaign",
      targetId: campaignId,
      summary: `Cancelled campaign “${campaign.name}”`,
      before: { status: campaign.status },
      after: { status: "cancelled" },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Dev/admin convenience: process one slice immediately (cron stays the driver). */
export async function processCampaignNowAction(
  campaignId: string,
): Promise<MarketingResult<{ sent: number }>> {
  try {
    await requirePermission("campaigns.send");
    if (!z.string().uuid().safeParse(campaignId).success) return { ok: false, error: "Invalid campaign" };
    const sent = await processCampaignBatch(campaignId);
    return { ok: true, data: { sent } };
  } catch (e) {
    return fail(e);
  }
}

// ── Automation rules ─────────────────────────────────────────────────────────

export async function toggleAutomationRuleAction(ruleId: string, enabled: boolean): Promise<MarketingResult> {
  try {
    const actor = await requirePermission("automation.manage");
    if (!z.string().uuid().safeParse(ruleId).success) return { ok: false, error: "Invalid rule" };

    const supabase = await createClient(); // RLS: admin-only update
    const { data, error } = await supabase
      .from("automation_rules")
      .update(dbUpdate("automation_rules", { is_enabled: enabled }))
      .eq("id", ruleId)
      .select("name")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    const rule = asRow<{ name: string }>(data);
    if (!rule) return { ok: false, error: "Rule not found" };

    void logActivity({
      actor,
      action: enabled ? "automation.enable" : "automation.disable",
      module: "marketing",
      targetType: "automation_rule",
      targetId: ruleId,
      summary: `${enabled ? "Enabled" : "Disabled"} automation rule “${rule.name}”`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
