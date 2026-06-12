import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows, dbUpdate, rpcParams } from "@/lib/supabase/types";
import { getOrgSettings } from "@/lib/settings/config";
import { logActivity } from "@/lib/activity/log";
import { notifyCampaignCompleted, sendNotification } from "@/lib/notifications/service";
import {
  channelAddress,
  renderTemplate,
  resolveProvider,
  type CampaignChannel,
} from "./providers";

/**
 * Campaign sending pipeline (Module 6). Runs from the shared cron tick:
 *
 *   scheduled ──(schedule_at reached)──▶ running ──(audience drained)──▶ completed
 *
 * Audience materialization uses enqueue_campaign_recipients() — keyset batches
 * of 1,000 over indexed customer columns, resumable via enqueue_cursor, with
 * unique (campaign_id, customer_id) absorbing overlaps. Dispatch claims rows
 * by flipping status pending→sent conditionally, so a recipient can never be
 * sent twice even with overlapping ticks. Everything is bounded per tick.
 */

const ENQUEUE_BATCH = 1_000;
const ENQUEUE_BATCHES_PER_TICK = 5;
const DISPATCH_BATCH = 200;
const RUNNING_CAMPAIGNS_PER_TICK = 5;

interface CampaignRow {
  id: string;
  name: string;
  channel: CampaignChannel;
  subject: string | null;
  template: string;
  status: string;
  voucher_id: string | null;
  created_by: string | null;
  sent_count: number;
  failed_count: number;
  total_recipients: number;
}

interface ClaimedRecipient {
  id: string;
  customer_id: string;
  merge_data: Record<string, unknown> | null;
}

/** True when `now` (server local time) falls inside the quiet-hours window. Handles windows that cross midnight (e.g. 21:00→08:00). */
function inQuietHours(quiet: { start: string; end: string } | null, now: Date): boolean {
  if (!quiet) return false;
  const toMinutes = (hhmm: string): number | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h > 23 || min > 59 ? null : h * 60 + min;
  };
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  if (start == null || end == null || start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

/** Promote due scheduled campaigns and process running ones. Returns counts. */
export async function tickCampaigns(): Promise<{ promoted: number; processed: number; sent: number }> {
  const admin = createAdminClient();

  // 1) scheduled → running (due). Conditional update = idempotent promotion.
  const { data: promotedRaw } = await admin
    .from("marketing_campaigns")
    .update(dbUpdate("marketing_campaigns", { status: "running", started_at: new Date().toISOString() }))
    .eq("status", "scheduled")
    .lte("schedule_at", new Date().toISOString())
    .select("id, name, created_by");
  const promoted = asRows<{ id: string; name: string; created_by: string | null }>(promotedRaw);
  for (const c of promoted) {
    void logActivity({
      actor: null,
      action: "campaign.start",
      module: "marketing",
      targetType: "campaign",
      targetId: c.id,
      summary: `Campaign “${c.name}” started (schedule reached)`,
    });
  }

  // 2) Process running campaigns (bounded per tick) — unless the current
  // server time falls inside the configured quiet-hours window (Settings →
  // Marketing). Skipping is safe: pending recipients stay queued and the next
  // tick outside the window resumes exactly where this one left off.
  const { marketing } = await getOrgSettings();
  const quietWindow = marketing.quiet_hours;
  const insideQuietHours = inQuietHours(quietWindow, new Date());

  const { data: runningRaw } = await admin
    .from("marketing_campaigns")
    .select("id")
    .eq("status", "running")
    .order("started_at", { ascending: true })
    .limit(RUNNING_CAMPAIGNS_PER_TICK);
  const running = asRows<{ id: string }>(runningRaw);

  let sentTotal = 0;
  let processed = 0;
  if (insideQuietHours && quietWindow) {
    if (running.length > 0) {
      console.info(
        `[marketing] inside quiet hours (${quietWindow.start}–${quietWindow.end}) — skipping ${running.length} running campaign(s) this tick`,
      );
    }
  } else {
    for (const c of running) {
      sentTotal += await processCampaignBatch(c.id);
    }
    processed = running.length;
  }

  // 3) Keep engagement stats fresh: opens/clicks/conversions arrive AFTER a
  // campaign completes, so sweep recent non-draft campaigns each tick
  // (bounded; per-campaign rollup, never a raw-stream scan at read time).
  const { data: recentRaw } = await admin
    .from("marketing_campaigns")
    .select("id")
    .in("status", ["running", "completed"])
    .order("created_at", { ascending: false })
    .limit(10);
  for (const c of asRows<{ id: string }>(recentRaw)) {
    const { error } = await admin.rpc(
      "refresh_campaign_stats",
      rpcParams("refresh_campaign_stats", { p_campaign_id: c.id }),
    );
    if (error) console.error("[marketing] stats sweep failed:", error.message);
  }

  return { promoted: promoted.length, processed, sent: sentTotal };
}

/**
 * One bounded slice of work for one campaign: top up the recipient queue,
 * dispatch a batch, update counters, complete when drained.
 * Returns how many messages were sent in this slice.
 */
export async function processCampaignBatch(campaignId: string): Promise<number> {
  const admin = createAdminClient();

  const { data: campaignRaw } = await admin
    .from("marketing_campaigns")
    .select("id, name, channel, subject, template, status, voucher_id, created_by, sent_count, failed_count, total_recipients")
    .eq("id", campaignId)
    .maybeSingle();
  const campaign = asRow<CampaignRow>(campaignRaw);
  if (!campaign || campaign.status !== "running") return 0;

  // ── Top up the queue (resumable; ≤5k per tick) ─────────────────────────────
  let enqueueDone = false;
  for (let i = 0; i < ENQUEUE_BATCHES_PER_TICK; i++) {
    const { data: inserted, error } = await admin.rpc(
      "enqueue_campaign_recipients",
      rpcParams("enqueue_campaign_recipients", { p_campaign_id: campaignId, p_batch: ENQUEUE_BATCH }),
    );
    if (error) {
      console.error("[marketing] enqueue failed:", error.message);
      break;
    }
    if (Number(inserted ?? 0) < ENQUEUE_BATCH) {
      enqueueDone = true;
      break;
    }
  }

  // ── Claim a dispatch batch (conditional flip = exactly-once) ───────────────
  const { data: pendingRaw } = await admin
    .from("campaign_recipients")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .limit(DISPATCH_BATCH);
  const pendingIds = asRows<{ id: string }>(pendingRaw).map((r) => r.id);

  let sent = 0;
  let skipped = 0;

  if (pendingIds.length > 0) {
    const { data: claimedRaw } = await admin
      .from("campaign_recipients")
      .update(dbUpdate("campaign_recipients", { status: "sent", sent_at: new Date().toISOString() }))
      .in("id", pendingIds)
      .eq("status", "pending") // the gate: only rows still pending flip
      .select("id, customer_id, merge_data");
    const claimed = asRows<ClaimedRecipient>(claimedRaw);

    // Voucher merge tag: one shared code per campaign (assigned codes are
    // issued by automation rules; campaign vouchers are generic).
    let voucherCode = "";
    if (campaign.voucher_id) {
      const { data: voucher } = await admin
        .from("vouchers")
        .select("code")
        .eq("id", campaign.voucher_id)
        .maybeSingle();
      voucherCode = asRow<{ code: string }>(voucher)?.code ?? "";
    }

    const provider = resolveProvider(campaign.channel);
    const events: { campaign_id: string; recipient_id: string; customer_id: string; event_type: string }[] = [];

    for (const recipient of claimed) {
      const mergeData = { ...(recipient.merge_data ?? {}), voucher_code: voucherCode };
      const address = channelAddress(campaign.channel, mergeData);
      if (!address) {
        await admin
          .from("campaign_recipients")
          .update(dbUpdate("campaign_recipients", { status: "skipped", error: "No contact address for channel" }))
          .eq("id", recipient.id);
        skipped += 1;
        continue;
      }

      const body = renderTemplate(campaign.template, mergeData);
      const subject = campaign.subject ? renderTemplate(campaign.subject, mergeData) : undefined;
      const outcome = await provider.send({
        to: address,
        subject,
        body,
        campaignId: campaign.id,
        recipientId: recipient.id,
      });

      if (outcome.ok) {
        sent += 1;
        events.push({
          campaign_id: campaign.id,
          recipient_id: recipient.id,
          customer_id: recipient.customer_id,
          event_type: "sent",
        });
        if (campaign.channel === "in_app") {
          // In-app delivery is synchronous — record it immediately.
          events.push({
            campaign_id: campaign.id,
            recipient_id: recipient.id,
            customer_id: recipient.customer_id,
            event_type: "delivered",
          });
        }
      } else {
        await admin
          .from("campaign_recipients")
          .update(dbUpdate("campaign_recipients", { status: "failed", error: outcome.error ?? "send failed" }))
          .eq("id", recipient.id);
      }
    }

    if (events.length > 0) {
      await admin.from("campaign_events").insert(events as never);
    }
  }

  // ── Counters (bounded indexed counts per campaign) ─────────────────────────
  const [{ count: sentCount }, { count: failedCount }, { count: pendingLeft }] = await Promise.all([
    admin
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "sent"),
    admin
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "failed"),
    admin
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "pending"),
  ]);

  const done = enqueueDone && (pendingLeft ?? 0) === 0;
  await admin
    .from("marketing_campaigns")
    .update(
      dbUpdate("marketing_campaigns", {
        sent_count: sentCount ?? 0,
        failed_count: failedCount ?? 0,
        ...(done
          ? { status: "completed" as const, completed_at: new Date().toISOString() }
          : {}),
      }),
    )
    .eq("id", campaignId)
    .eq("status", "running"); // never resurrect a cancelled campaign

  if (sent > 0 || done) {
    const { error } = await admin.rpc(
      "refresh_campaign_stats",
      rpcParams("refresh_campaign_stats", { p_campaign_id: campaignId }),
    );
    if (error) console.error("[marketing] stats refresh failed:", error.message);
  }

  if (done) {
    void notifyCampaignCompleted({
      campaignId: campaign.id,
      campaignName: campaign.name,
      creatorId: campaign.created_by,
      sent: sentCount ?? 0,
      failed: failedCount ?? 0,
    });
    void logActivity({
      actor: null,
      action: "campaign.complete",
      module: "marketing",
      targetType: "campaign",
      targetId: campaign.id,
      summary: `Campaign “${campaign.name}” completed — ${sentCount ?? 0} sent, ${failedCount ?? 0} failed${skipped ? `, ${skipped} skipped` : ""}`,
      after: { sent: sentCount ?? 0, failed: failedCount ?? 0 },
    });
    // In-app campaigns surface to staff via the bell as a completion signal;
    // customer-facing in-app inboxes are outside this internal tool.
    if (campaign.channel === "in_app" && campaign.created_by) {
      void sendNotification({
        type: "system",
        category: "campaign_completed",
        title: `In-app campaign “${campaign.name}” delivered`,
        body: `${sentCount ?? 0} recipient(s) recorded as delivered.`,
        audience: { type: "users", userIds: [campaign.created_by] },
        linkUrl: `/marketing?campaign=${campaign.id}`,
      }).catch(() => undefined);
    }
  }

  return sent;
}
