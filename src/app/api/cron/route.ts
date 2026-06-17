import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows, dbInsert, dbUpdate, rpcParams } from "@/lib/supabase/types";
import { sendNotification } from "@/lib/notifications/service";
import { logActivity } from "@/lib/activity/log";
import { tickCampaigns } from "@/lib/marketing/pipeline";
import { runAutomationRules } from "@/lib/marketing/automation";
import { parseFeedbackConfig, parseRoiConfig, parseScheduleConfig } from "@/lib/settings/config";

/**
 * THE shared cron runner (spec v4). Invoke every minute via any scheduler
 * (pg_cron + pg_net, GitHub Actions, Vercel Cron, Task Scheduler):
 *
 *   curl -X POST $APP_URL/api/cron -H "Authorization: Bearer $CRON_SECRET"
 *
 * Every step is IDEMPOTENT — claims happen via SQL functions that stamp rows
 * under row locks (SKIP LOCKED), so overlapping ticks can never double-fire.
 *
 * Steps today:
 *   1. Print countdowns — claim_due_print_notifications() → notify assignee.
 *   2. Expired polls — auto-close where closes_at has passed.
 * The Messages scheduler (claim_due_scheduled_items) and Marketing automation
 * rules attach here as those modules land.
 */

type DuePrint = {
  order_id: string;
  order_code: string;
  assigned_staff_id: string | null;
  estimated_print_minutes: number;
};

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // dev convenience
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function runCron() {
  const admin = createAdminClient();
  const results: Record<string, number> = {};

  // ── 1) Print countdowns reaching zero ─────────────────────────────────────
  const { data: duePrints, error: printErr } = await admin.rpc(
    "claim_due_print_notifications",
    rpcParams("claim_due_print_notifications", { p_limit: 100 }),
  );
  if (printErr) {
    console.error("[cron] print notifications claim failed:", printErr.message);
  }
  const prints = asRows<DuePrint>(duePrints);
  for (const p of prints) {
    if (!p.assigned_staff_id) continue;
    try {
      await sendNotification({
        type: "system",
        category: "print_countdown",
        title: `Print countdown finished — ${p.order_code}`,
        body: `The estimated ${p.estimated_print_minutes} min print time for ${p.order_code} has elapsed. Check the printer and complete or fail the job.`,
        audience: { type: "users", userIds: [p.assigned_staff_id] },
        linkUrl: `/orders/${p.order_id}`,
      });
    } catch (e) {
      console.error("[cron] print notification failed:", e);
    }
  }
  results.printCountdowns = prints.length;

  // ── 1.6) Production Schedule maintenance (spec v6, Module 3) ──────────────
  // a) Overdue alerts: a running print past estimate × (1 + threshold%) pings
  //    its assignee ONCE — overdue_notified_at stamps it; restart re-arms it.
  // b) Auto-archive: completed/failed cards leave the board after the
  //    configured retention; the order's print history is untouched.
  try {
    const { data: cfgRaw } = await admin
      .from("organization_settings")
      .select("schedule_config")
      .eq("id", "org")
      .maybeSingle();
    const cfg = parseScheduleConfig(asRow<{ schedule_config: unknown }>(cfgRaw)?.schedule_config);

    const { data: runningRaw } = await admin
      .from("print_schedule")
      .select("order_id, assigned_to, print_started_at, estimated_minutes, orders(order_code)")
      .eq("state", "printing")
      .is("archived_at", null)
      .is("overdue_notified_at", null)
      .not("print_started_at", "is", null)
      .not("estimated_minutes", "is", null)
      .limit(200);
    type RunningRow = {
      order_id: string;
      assigned_to: string | null;
      print_started_at: string;
      estimated_minutes: number;
      orders: { order_code: string } | null;
    };
    let overdueCount = 0;
    for (const r of asRows<RunningRow>(runningRaw)) {
      const allowedMs = r.estimated_minutes * (1 + cfg.overdue_alert_pct / 100) * 60_000;
      if (Date.now() - new Date(r.print_started_at).getTime() <= allowedMs) continue;
      // Stamp FIRST with a guard so overlapping ticks can't double-notify.
      const { data: stamped } = await admin
        .from("print_schedule")
        .update(dbUpdate("print_schedule", { overdue_notified_at: new Date().toISOString() }))
        .eq("order_id", r.order_id)
        .is("overdue_notified_at", null)
        .select("order_id");
      if (asRows<{ order_id: string }>(stamped).length === 0) continue;
      overdueCount += 1;
      if (!r.assigned_to) continue;
      try {
        await sendNotification({
          type: "system",
          category: "print_overdue",
          title: `Print overdue — ${r.orders?.order_code ?? "job"}`,
          body: `The print is more than ${cfg.overdue_alert_pct}% past its ${r.estimated_minutes} min estimate. Check the printer.`,
          audience: { type: "users", userIds: [r.assigned_to] },
          linkUrl: `/orders/${r.order_id}`,
        });
      } catch (e) {
        console.error("[cron] overdue notification failed:", e);
      }
    }
    results.printsOverdue = overdueCount;

    const cutoff = new Date(Date.now() - cfg.completed_retention_hours * 3_600_000).toISOString();
    const [doneRes, failRes] = await Promise.all([
      admin
        .from("print_schedule")
        .update(dbUpdate("print_schedule", { archived_at: new Date().toISOString() }))
        .eq("state", "completed")
        .is("archived_at", null)
        .lt("completed_at", cutoff)
        .select("order_id"),
      admin
        .from("print_schedule")
        .update(dbUpdate("print_schedule", { archived_at: new Date().toISOString() }))
        .eq("state", "failed")
        .is("archived_at", null)
        .lt("updated_at", cutoff)
        .select("order_id"),
    ]);
    results.scheduleArchived =
      asRows<{ order_id: string }>(doneRes.data).length +
      asRows<{ order_id: string }>(failRes.data).length;
  } catch (e) {
    console.error("[cron] schedule maintenance failed:", e);
    results.printsOverdue = results.printsOverdue ?? 0;
    results.scheduleArchived = results.scheduleArchived ?? 0;
  }

  // ── 1.7) Feedback aging alerts (spec v6, Module 8) ────────────────────────
  // In-progress records older than the configurable SLA ping their assignee
  // once — aging_notified_at stamps it; reassignment/reopen re-arms it.
  try {
    const { data: fbCfgRaw } = await admin
      .from("organization_settings")
      .select("feedback_config")
      .eq("id", "org")
      .maybeSingle();
    const fbCfg = parseFeedbackConfig(
      asRow<{ feedback_config: unknown }>(fbCfgRaw)?.feedback_config,
    );
    const agingCutoff = new Date(
      Date.now() - fbCfg.aging_sla_days * 86_400_000,
    ).toISOString();

    const { data: agingRaw } = await admin
      .from("customer_feedback")
      .select("id, code, assigned_to, created_at")
      .in("status", ["in_progress", "reopened"])
      .is("aging_notified_at", null)
      .is("deleted_at", null)
      .lt("created_at", agingCutoff)
      .limit(100);
    let agingCount = 0;
    for (const f of asRows<{ id: string; code: string; assigned_to: string | null; created_at: string }>(
      agingRaw,
    )) {
      // Stamp FIRST with a guard so overlapping ticks can't double-notify.
      const { data: stamped } = await admin
        .from("customer_feedback")
        .update(dbUpdate("customer_feedback", { aging_notified_at: new Date().toISOString() }))
        .eq("id", f.id)
        .is("aging_notified_at", null)
        .select("id");
      if (asRows<{ id: string }>(stamped).length === 0) continue;
      agingCount += 1;
      const audience: Parameters<typeof sendNotification>[0]["audience"] = f.assigned_to
        ? { type: "users", userIds: [f.assigned_to] }
        : { type: "role", role: "admin" };
      try {
        await sendNotification({
          type: "system",
          category: "feedback_aging",
          title: `Feedback ${f.code} is aging`,
          body: `Still in progress after ${fbCfg.aging_sla_days} days — resolve it or hand it over.`,
          audience,
          linkUrl: `/feedback?open=${f.id}`,
        });
      } catch (e) {
        console.error("[cron] feedback aging notification failed:", e);
      }
    }
    results.feedbackAging = agingCount;
  } catch (e) {
    console.error("[cron] feedback aging failed:", e);
    results.feedbackAging = results.feedbackAging ?? 0;
  }

  // ── 1.8) ROI alerts (break-even / underperforming) + order auto-attribution ─
  // Stamp-first per state entry so overlapping ticks can't double-notify; the
  // re-arm clears the stamp when an investment leaves the alerted state.
  try {
    await admin
      .from("investments")
      .update(dbUpdate("investments", { break_even_notified_at: null }))
      .neq("break_even_status", "recovered")
      .not("break_even_notified_at", "is", null);
    await admin
      .from("investments")
      .update(dbUpdate("investments", { underperforming_notified_at: null }))
      .neq("break_even_status", "underperforming")
      .not("underperforming_notified_at", "is", null);

    type InvAlert = { id: string; name: string };
    const { data: recRaw } = await admin
      .from("investments")
      .select("id, name")
      .eq("break_even_status", "recovered")
      .is("break_even_notified_at", null)
      .is("deleted_at", null)
      .limit(100);
    let roiBreakEven = 0;
    for (const inv of asRows<InvAlert>(recRaw)) {
      const { data: stamped } = await admin
        .from("investments")
        .update(dbUpdate("investments", { break_even_notified_at: new Date().toISOString() }))
        .eq("id", inv.id)
        .is("break_even_notified_at", null)
        .select("id");
      if (asRows<{ id: string }>(stamped).length === 0) continue;
      roiBreakEven += 1;
      try {
        await sendNotification({
          type: "system",
          category: "roi_break_even",
          title: `Investment recovered — ${inv.name}`,
          body: `“${inv.name}” has fully recovered its invested capital. 🎉`,
          audience: { type: "role", role: "admin" },
          linkUrl: "/roi",
        });
      } catch (e) {
        console.error("[cron] roi break-even notification failed:", e);
      }
    }
    results.roiBreakEven = roiBreakEven;

    const { data: underRaw } = await admin
      .from("investments")
      .select("id, name")
      .eq("break_even_status", "underperforming")
      .is("underperforming_notified_at", null)
      .is("deleted_at", null)
      .limit(100);
    let roiUnder = 0;
    for (const inv of asRows<InvAlert>(underRaw)) {
      const { data: stamped } = await admin
        .from("investments")
        .update(dbUpdate("investments", { underperforming_notified_at: new Date().toISOString() }))
        .eq("id", inv.id)
        .is("underperforming_notified_at", null)
        .select("id");
      if (asRows<{ id: string }>(stamped).length === 0) continue;
      roiUnder += 1;
      try {
        await sendNotification({
          type: "system",
          category: "roi_underperforming",
          title: `Investment underperforming — ${inv.name}`,
          body: `“${inv.name}” is not recovering — operating profit is at or below zero. Review the run rate.`,
          audience: { type: "role", role: "admin" },
          linkUrl: "/roi",
        });
      } catch (e) {
        console.error("[cron] roi underperforming notification failed:", e);
      }
    }
    results.roiUnderperforming = roiUnder;

    // Order revenue auto-attribution — only when the org toggle is on.
    const { data: roiCfgRaw } = await admin
      .from("organization_settings")
      .select("roi_config")
      .eq("id", "org")
      .maybeSingle();
    const roiCfg = parseRoiConfig(asRow<{ roi_config: unknown }>(roiCfgRaw)?.roi_config);
    if (roiCfg.auto_attribution_enabled) {
      const { data: attr, error: attrErr } = await admin.rpc(
        "run_roi_auto_attribution",
        rpcParams("run_roi_auto_attribution", { p_limit: 500 }),
      );
      if (attrErr) throw new Error(attrErr.message);
      results.roiAttributed = Number(attr ?? 0);
    }
  } catch (e) {
    console.error("[cron] ROI alerts failed:", e);
  }

  // ── 2) Auto-close expired polls ────────────────────────────────────────────
  const { data: closed, error: pollErr } = await admin
    .from("polls")
    .update(dbUpdate("polls", { status: "closed", closed_at: new Date().toISOString() }))
    .eq("status", "open")
    .lt("closes_at", new Date().toISOString())
    .select("id");
  if (pollErr) {
    console.error("[cron] poll auto-close failed:", pollErr.message);
  }
  results.pollsClosed = asRows<{ id: string }>(closed).length;

  // ── 2.5) Unified chat scheduler (messages + reminders + scheduled polls) ──
  // claim_due_scheduled_items locks + advances rows in one statement (SKIP
  // LOCKED), so overlapping ticks can never fire an occurrence twice.
  type ScheduledItem = {
    id: string;
    group_id: string;
    created_by: string | null;
    kind: "message" | "reminder" | "poll";
    body: string;
    audience: "group" | "only_me";
    priority: "low" | "normal" | "high";
    poll_id: string | null;
  };
  let scheduledFired = 0;
  try {
    const { data: dueRaw, error: dueErr } = await admin.rpc(
      "claim_due_scheduled_items",
      rpcParams("claim_due_scheduled_items", { p_limit: 50 }),
    );
    if (dueErr) throw new Error(dueErr.message);

    for (const item of asRows<ScheduledItem>(dueRaw)) {
      try {
        if (item.kind === "message") {
          await admin.from("messages").insert(
            dbInsert("messages", {
              group_id: item.group_id,
              sender_id: item.created_by,
              body: item.body,
            }),
          );
        } else if (item.kind === "reminder") {
          let recipients: string[] = item.created_by ? [item.created_by] : [];
          if (item.audience === "group") {
            const { data: members } = await admin
              .from("group_members")
              .select("user_id")
              .eq("group_id", item.group_id);
            recipients = asRows<{ user_id: string }>(members).map((m) => m.user_id);
          }
          if (recipients.length > 0) {
            await sendNotification({
              type: "system",
              category: "reminder",
              title: `${item.priority === "high" ? "❗ " : ""}Reminder${item.priority === "high" ? " (high priority)" : ""}`,
              body: item.body.slice(0, 300),
              audience: { type: "users", userIds: recipients },
              senderId: item.created_by,
              linkUrl: `/messages?group=${item.group_id}`,
            });
          }
        } else if (item.kind === "poll" && item.poll_id) {
          // Publish a scheduled poll: open it and anchor it in the chat.
          const { data: pollRaw } = await admin
            .from("polls")
            .update(dbUpdate("polls", { status: "open" }))
            .eq("id", item.poll_id)
            .eq("status", "draft")
            .select("question, created_by")
            .maybeSingle();
          const poll = asRow<{ question: string; created_by: string | null }>(pollRaw);
          if (poll) {
            const { data: anchor } = await admin
              .from("messages")
              .insert(
                dbInsert("messages", {
                  group_id: item.group_id,
                  sender_id: poll.created_by,
                  body: `📊 ${poll.question}`,
                }),
              )
              .select("id")
              .single();
            if (anchor) {
              await admin
                .from("polls")
                .update(dbUpdate("polls", { message_id: (anchor as { id: string }).id }))
                .eq("id", item.poll_id);
            }
          }
        }
        scheduledFired += 1;
        void logActivity({
          actor: null,
          action: "scheduler.run",
          module: "messages",
          targetType: "scheduled_item",
          targetId: item.id,
          summary: `Scheduler fired a ${item.kind}${item.kind === "reminder" ? ` (${item.audience})` : ""}`,
          after: { kind: item.kind, priority: item.priority },
        });
      } catch (e) {
        console.error("[cron] scheduled item failed:", e);
      }
    }
  } catch (e) {
    console.error("[cron] scheduler claim failed:", e);
  }
  results.scheduledItemsFired = scheduledFired;

  // ── 3) Marketing: promote due campaigns + dispatch batches ────────────────
  try {
    const campaigns = await tickCampaigns();
    results.campaignsPromoted = campaigns.promoted;
    results.campaignsProcessed = campaigns.processed;
    results.campaignMessagesSent = campaigns.sent;
  } catch (e) {
    console.error("[cron] campaign tick failed:", e);
  }

  // ── 4) Marketing: automation rules (idempotent via execution dedupe) ──────
  try {
    const automation = await runAutomationRules();
    results.automationFired = Object.values(automation).reduce(
      (sum, n) => sum + Math.max(n, 0),
      0,
    );
  } catch (e) {
    console.error("[cron] automation tick failed:", e);
  }

  // ── 5) Activity log lifecycle (spec Module 9) ──────────────────────────────
  // 5a) Keep current+next month partitions present (cheap no-op when they exist).
  try {
    const [{ data: a }, { data: b }] = await Promise.all([
      admin.rpc(
        "ensure_activity_log_partitions",
        rpcParams("ensure_activity_log_partitions", { p_months_back: 0, p_months_ahead: 1 }),
      ),
      admin.rpc(
        "ensure_campaign_event_partitions",
        rpcParams("ensure_campaign_event_partitions", { p_months_back: 0, p_months_ahead: 1 }),
      ),
    ]);
    results.partitionsCreated = Number(a ?? 0) + Number(b ?? 0);
  } catch (e) {
    console.error("[cron] partition maintenance failed:", e);
  }

  // 5b) Hash-chain integrity check — any mismatch alerts every Admin.
  try {
    const { data: integrityRaw } = await admin.rpc(
      "verify_activity_log_chain",
      rpcParams("verify_activity_log_chain", { p_limit: 5000 }),
    );
    const integrity = asRows<{ checked: number; mismatches: number; first_bad_seq: number | null }>(
      integrityRaw,
    )[0];
    results.integrityMismatches = integrity?.mismatches ?? 0;
    if (integrity && integrity.mismatches > 0) {
      const { notifySecurityAlert } = await import("@/lib/notifications/service");
      await notifySecurityAlert({
        title: "Activity-log integrity mismatch",
        body: `${integrity.mismatches} of the last ${integrity.checked} audit entries failed hash verification (first bad seq ${integrity.first_bad_seq}). The log may have been tampered with.`,
      });
    }
  } catch (e) {
    console.error("[cron] integrity check failed:", e);
  }

  // 5c) Scheduled auto-purge honoring Settings retention — at most one shot per
  // day (guard: skip unless there's something old enough). Optionally archives
  // the doomed rows to CSV in the private archives bucket first.
  try {
    const { getOrgSettings } = await import("@/lib/settings/config");
    const settings = await getOrgSettings();
    const cutoffDate = new Date(Date.now() - settings.logRetentionDays * 24 * 3600_000)
      .toISOString()
      .slice(0, 10);

    const { data: dryRaw } = await admin.rpc(
      "purge_activity_logs",
      rpcParams("purge_activity_logs", { p_before: cutoffDate, p_dry_run: true }),
    );
    const doomed = Number(dryRaw ?? 0);
    if (doomed > 0) {
      if (settings.logPurgeArchive) {
        const { data: rowsRaw } = await admin
          .from("activity_logs")
          .select("created_at, actor_email, action, module, severity, summary, target_type, target_id, ip_address")
          .lt("created_at", cutoffDate)
          .order("created_at", { ascending: true })
          .limit(50_000);
        const rows = asRows<Record<string, string | null>>(rowsRaw);
        const { buildCsv } = await import("@/lib/export/csv");
        const headers = ["created_at", "actor_email", "action", "module", "severity", "summary", "target_type", "target_id", "ip_address"];
        const csv = buildCsv(headers, rows.map((r) => headers.map((h) => r[h] ?? "")));
        await admin.storage
          .from("archives")
          .upload(`activity-logs/purged-before-${cutoffDate}-${Date.now()}.csv`, new Blob([csv], { type: "text/csv" }));
      }
      const { data: purgedRaw } = await admin.rpc(
        "purge_activity_logs",
        rpcParams("purge_activity_logs", { p_before: cutoffDate, p_dry_run: false }),
      );
      results.logsPurged = Number(purgedRaw ?? 0);
    } else {
      results.logsPurged = 0;
    }
  } catch (e) {
    console.error("[cron] auto-purge failed:", e);
  }

  return results;
}

// Never cache — this is auth-gated and mutates state on every invocation.
export const dynamic = "force-dynamic";
// The runner does many sequential steps; give it headroom past the 10s default
// (60s is the Hobby ceiling; Pro allows more). Tune up if the org grows large.
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const results = await runCron();
  return NextResponse.json({ ok: true, data: results });
}

// GET supported for schedulers that can't POST (incl. Vercel Cron, which sends
// GET with `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set).
export const GET = POST;
