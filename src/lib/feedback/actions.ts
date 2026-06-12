"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows, dbInsert, dbUpdate } from "@/lib/supabase/types";
import {
  ForbiddenError,
  UnauthorizedError,
  requirePermission,
  requireUser,
  type SessionUser,
} from "@/lib/rbac/guards";
import { logActivity } from "@/lib/activity/log";
import { sendNotification } from "@/lib/notifications/service";
import { getOrgSettings } from "@/lib/settings/config";
import {
  assignFeedbackSchema,
  createFeedbackSchema,
  feedbackCommentSchema,
  feedbackIdSchema,
  reopenFeedbackSchema,
  resolveFeedbackSchema,
  updateFeedbackSchema,
  type CreateFeedbackInput,
  type UpdateFeedbackInput,
} from "./schemas";

/**
 * Customer Feedback actions (spec v6, Module 8). customer_feedback has NO
 * write grants for authenticated — every mutation flows through here so the
 * workflow rules hold (required resolution note, the state machine, history
 * rows, notifications). Reads in the UI stay on the session client where RLS
 * scopes staff to records they submitted or are assigned.
 */

export type FeedbackResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof UnauthorizedError) return { ok: false, error: "You are not signed in." };
  if (e instanceof ForbiddenError)
    return { ok: false, error: "You don't have permission to do that." };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Invalid input";
}

type FeedbackCore = {
  id: string;
  code: string;
  rating: number;
  status: string;
  customer_id: string | null;
  assigned_to: string | null;
  submitted_by: string | null;
};

async function loadCore(id: string): Promise<FeedbackCore | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("customer_feedback")
    .select("id, code, rating, status, customer_id, assigned_to, submitted_by")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return asRow<FeedbackCore>(data);
}

/** Mirror of the RLS read scope: submitter, assignee, or feedback.view_all. */
function canTouch(actor: SessionUser, rec: FeedbackCore): boolean {
  return (
    actor.permissions.has("feedback.view_all") ||
    rec.submitted_by === actor.id ||
    rec.assigned_to === actor.id
  );
}

async function addHistory(
  feedbackId: string,
  fromStatus: string | null,
  toStatus: string,
  changedBy: string,
  comment?: string | null,
) {
  const admin = createAdminClient();
  await admin.from("feedback_status_history").insert(
    dbInsert("feedback_status_history", {
      feedback_id: feedbackId,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by: changedBy,
      comment: comment ?? null,
    }),
  );
}

// ── Create / edit ─────────────────────────────────────────────────────────────

export async function createFeedbackAction(
  input: CreateFeedbackInput,
): Promise<FeedbackResult<{ id: string; code: string }>> {
  try {
    const actor = await requirePermission("feedback.create");
    const parsed = createFeedbackSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    // Attachment paths were uploaded client-side into the PRIVATE bucket under
    // the uploader's folder — re-check the prefix so nobody can claim a path
    // they don't own.
    for (const a of v.attachments) {
      if (!a.path.startsWith(`${actor.id}/`))
        return { ok: false, error: "Attachment path does not belong to you" };
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("customer_feedback")
      .insert(
        dbInsert("customer_feedback", {
          customer_id: v.customerId ?? null,
          fallback_name: v.customerId ? null : v.fallbackName?.trim() || null,
          fallback_phone: v.customerId ? null : v.fallbackPhone?.trim() || null,
          order_id: v.orderId ?? null,
          rating: v.rating,
          comments: v.comments,
          category: v.category,
          source_channel: v.sourceChannel,
          severity: v.severity,
          status: "new",
          submitted_by: actor.id,
          updated_by: actor.id,
        }),
      )
      .select("id, code")
      .single();
    if (error) return { ok: false, error: error.message };
    const rec = data as { id: string; code: string };

    if (v.attachments.length > 0) {
      const { error: attachError } = await admin.from("feedback_attachments").insert(
        dbInsert(
          "feedback_attachments",
          v.attachments.map((a) => ({
            feedback_id: rec.id,
            storage_path: a.path,
            file_name: a.name,
            mime_type: a.mime,
            size_bytes: a.size,
            created_by: actor.id,
          })),
        ),
      );
      if (attachError) console.error("[feedback] attachment rows failed:", attachError.message);
    }

    await addHistory(rec.id, null, "new", actor.id);

    void logActivity({
      actor,
      action: "feedback.create",
      module: "feedback",
      targetType: "customer_feedback",
      targetId: rec.id,
      summary: `Logged feedback ${rec.code} (${v.rating}★, ${v.category})`,
      after: { rating: v.rating, category: v.category, severity: v.severity },
    });

    // New 1–2★ feedback alerts Admins (configurable in Settings).
    if (v.rating <= 2) {
      try {
        const settings = await getOrgSettings();
        if (settings.feedback.negative_alert_enabled) {
          await sendNotification({
            type: "system",
            category: "feedback_negative",
            title: `Negative feedback — ${rec.code} (${v.rating}★)`,
            body: v.comments.slice(0, 200),
            audience: { type: "role", role: "admin" },
            linkUrl: `/feedback?open=${rec.id}`,
          });
        }
      } catch (e) {
        console.error("[feedback] negative alert failed:", e);
      }
    }

    return { ok: true, data: rec };
  } catch (e) {
    return fail(e);
  }
}

export async function updateFeedbackAction(input: UpdateFeedbackInput): Promise<FeedbackResult> {
  try {
    const actor = await requirePermission("feedback.create");
    const parsed = updateFeedbackSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const rec = await loadCore(v.id);
    if (!rec) return { ok: false, error: "Feedback not found" };
    if (!canTouch(actor, rec)) return { ok: false, error: "You can't edit this record" };

    const admin = createAdminClient();
    const { error } = await admin
      .from("customer_feedback")
      .update(
        dbUpdate("customer_feedback", {
          rating: v.rating,
          comments: v.comments,
          category: v.category,
          severity: v.severity,
          source_channel: v.sourceChannel,
          updated_by: actor.id,
        }),
      )
      .eq("id", v.id);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "feedback.update",
      module: "feedback",
      targetType: "customer_feedback",
      targetId: v.id,
      summary: `Edited feedback ${rec.code}`,
      before: { rating: rec.rating },
      after: { rating: v.rating, category: v.category, severity: v.severity },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Workflow: assign → resolve → reopen ──────────────────────────────────────

export async function assignFeedbackAction(
  feedbackId: string,
  assigneeId: string,
): Promise<FeedbackResult> {
  try {
    const actor = await requirePermission("feedback.assign");
    const parsed = assignFeedbackSchema.safeParse({ feedbackId, assigneeId });
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const rec = await loadCore(feedbackId);
    if (!rec) return { ok: false, error: "Feedback not found" };
    if (rec.status === "resolved")
      return { ok: false, error: "Reopen the feedback before reassigning it" };
    if (rec.assigned_to === assigneeId) return { ok: false, error: "Already assigned to them" };

    const admin = createAdminClient();
    const { data: userRaw } = await admin
      .from("users")
      .select("id, full_name")
      .eq("id", assigneeId)
      .eq("is_active", true)
      .maybeSingle();
    const assignee = asRow<{ id: string; full_name: string }>(userRaw);
    if (!assignee) return { ok: false, error: "That user is not active" };

    // Assigning moves New/Reopened → In Progress (the spec's review flow).
    const nextStatus = rec.status === "in_progress" ? "in_progress" : "in_progress";
    const { error } = await admin
      .from("customer_feedback")
      .update(
        dbUpdate("customer_feedback", {
          assigned_to: assigneeId,
          status: nextStatus,
          // Re-arm the aging alert for the new owner.
          aging_notified_at: null,
          updated_by: actor.id,
        }),
      )
      .eq("id", feedbackId);
    if (error) return { ok: false, error: error.message };

    if (rec.status !== nextStatus) {
      await addHistory(feedbackId, rec.status, nextStatus, actor.id, `Assigned to ${assignee.full_name}`);
    }

    void sendNotification({
      type: "system",
      category: "feedback_assigned",
      title: `Feedback ${rec.code} assigned to you`,
      body: "Review the customer's feedback and resolve it with a note.",
      audience: { type: "users", userIds: [assigneeId] },
      linkUrl: `/feedback?open=${feedbackId}`,
    }).catch((e) => console.error("[feedback] assign notification failed:", e));

    void logActivity({
      actor,
      action: "feedback.assign",
      module: "feedback",
      targetType: "customer_feedback",
      targetId: feedbackId,
      summary: `Assigned feedback ${rec.code} to ${assignee.full_name}`,
      before: { assigned_to: rec.assigned_to, status: rec.status },
      after: { assigned_to: assigneeId, status: nextStatus },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resolveFeedbackAction(
  feedbackId: string,
  resolutionNote: string,
): Promise<FeedbackResult> {
  try {
    const actor = await requirePermission("feedback.resolve");
    const parsed = resolveFeedbackSchema.safeParse({ feedbackId, resolutionNote });
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const note = parsed.data.resolutionNote;

    const rec = await loadCore(feedbackId);
    if (!rec) return { ok: false, error: "Feedback not found" };
    if (rec.status === "resolved") return { ok: false, error: "Already resolved" };
    if (rec.assigned_to !== actor.id && !actor.permissions.has("feedback.view_all"))
      return { ok: false, error: "Only the assignee (or an admin) can resolve this" };

    // Conditional update = race guard: two simultaneous resolves can't both win.
    const admin = createAdminClient();
    const { data: updated, error } = await admin
      .from("customer_feedback")
      .update(
        dbUpdate("customer_feedback", {
          status: "resolved",
          resolved_by: actor.id,
          resolved_at: new Date().toISOString(),
          resolution_note: note,
          updated_by: actor.id,
        }),
      )
      .eq("id", feedbackId)
      .neq("status", "resolved")
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (asRows<{ id: string }>(updated).length === 0)
      return { ok: false, error: "Already resolved" };

    await addHistory(feedbackId, rec.status, "resolved", actor.id, note);

    if (rec.submitted_by && rec.submitted_by !== actor.id) {
      void sendNotification({
        type: "system",
        category: "feedback_resolved",
        title: `Feedback ${rec.code} resolved`,
        body: note.slice(0, 200),
        audience: { type: "users", userIds: [rec.submitted_by] },
        linkUrl: `/feedback?open=${feedbackId}`,
      }).catch((e) => console.error("[feedback] resolve notification failed:", e));
    }

    void logActivity({
      actor,
      action: "feedback.resolve",
      module: "feedback",
      targetType: "customer_feedback",
      targetId: feedbackId,
      summary: `Resolved feedback ${rec.code}`,
      before: { status: rec.status },
      after: { status: "resolved", resolution_note: note },
    });

    // Spec automation: resolved negative (1–2★) feedback → apology voucher.
    if (rec.rating <= 2 && rec.customer_id) {
      void fireApologyVoucher(rec, actor).catch((e) =>
        console.error("[feedback] apology automation failed:", e),
      );
    }
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function reopenFeedbackAction(
  feedbackId: string,
  reason: string,
): Promise<FeedbackResult> {
  try {
    const actor = await requirePermission("feedback.resolve");
    const parsed = reopenFeedbackSchema.safeParse({ feedbackId, reason });
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const rec = await loadCore(feedbackId);
    if (!rec) return { ok: false, error: "Feedback not found" };
    if (rec.status !== "resolved") return { ok: false, error: "Only resolved feedback can be reopened" };

    // Clear the resolution stamps so resolution-time analytics stay honest;
    // the note lives on in the status history.
    const admin = createAdminClient();
    const { error } = await admin
      .from("customer_feedback")
      .update(
        dbUpdate("customer_feedback", {
          status: "reopened",
          resolved_by: null,
          resolved_at: null,
          resolution_note: null,
          aging_notified_at: null,
          updated_by: actor.id,
        }),
      )
      .eq("id", feedbackId)
      .eq("status", "resolved");
    if (error) return { ok: false, error: error.message };

    await addHistory(feedbackId, "resolved", "reopened", actor.id, parsed.data.reason);

    if (rec.assigned_to && rec.assigned_to !== actor.id) {
      void sendNotification({
        type: "system",
        category: "feedback_assigned",
        title: `Feedback ${rec.code} reopened`,
        body: parsed.data.reason.slice(0, 200),
        audience: { type: "users", userIds: [rec.assigned_to] },
        linkUrl: `/feedback?open=${feedbackId}`,
      }).catch((e) => console.error("[feedback] reopen notification failed:", e));
    }

    void logActivity({
      actor,
      action: "feedback.reopen",
      module: "feedback",
      targetType: "customer_feedback",
      targetId: feedbackId,
      summary: `Reopened feedback ${rec.code}`,
      before: { status: "resolved" },
      after: { status: "reopened", reason: parsed.data.reason },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Internal discussion ───────────────────────────────────────────────────────

export async function addFeedbackCommentAction(
  feedbackId: string,
  body: string,
  mentionedUserIds: string[],
): Promise<FeedbackResult> {
  try {
    const actor = await requireUser();
    const parsed = feedbackCommentSchema.safeParse({ feedbackId, body, mentionedUserIds });
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const rec = await loadCore(feedbackId);
    if (!rec) return { ok: false, error: "Feedback not found" };
    if (!canTouch(actor, rec) && !actor.permissions.has("feedback.assign"))
      return { ok: false, error: "You can't comment on this record" };

    const admin = createAdminClient();
    const { error } = await admin.from("feedback_comments").insert(
      dbInsert("feedback_comments", {
        feedback_id: feedbackId,
        author_id: actor.id,
        body: parsed.data.body,
      }),
    );
    if (error) return { ok: false, error: error.message };

    // Mentions: only real, active users, never the author themself.
    const mentionIds = [...new Set(parsed.data.mentionedUserIds)].filter((id) => id !== actor.id);
    if (mentionIds.length > 0) {
      const { data: usersRaw } = await admin
        .from("users")
        .select("id")
        .in("id", mentionIds)
        .eq("is_active", true);
      const valid = asRows<{ id: string }>(usersRaw).map((u) => u.id);
      if (valid.length > 0) {
        void sendNotification({
          type: "system",
          category: "mention",
          title: `You were mentioned on feedback ${rec.code}`,
          body: parsed.data.body.slice(0, 200),
          audience: { type: "users", userIds: valid },
          senderId: actor.id,
          linkUrl: `/feedback?open=${feedbackId}`,
        }).catch((e) => console.error("[feedback] mention notification failed:", e));
      }
    }

    void logActivity({
      actor,
      action: "feedback.comment",
      module: "feedback",
      targetType: "customer_feedback",
      targetId: feedbackId,
      summary: `Commented on feedback ${rec.code}`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Photos (private bucket → short-lived signed URLs) ─────────────────────────

export async function getFeedbackPhotoUrlsAction(
  feedbackId: string,
): Promise<FeedbackResult<{ photos: { id: string; url: string; fileName: string }[] }>> {
  try {
    const actor = await requireUser();
    if (!feedbackIdSchema.safeParse(feedbackId).success)
      return { ok: false, error: "Invalid feedback record" };

    const rec = await loadCore(feedbackId);
    if (!rec) return { ok: false, error: "Feedback not found" };
    if (!canTouch(actor, rec) && !actor.permissions.has("feedback.assign"))
      return { ok: false, error: "You can't view this record" };

    const admin = createAdminClient();
    const { data: rowsRaw, error } = await admin
      .from("feedback_attachments")
      .select("id, storage_path, file_name")
      .eq("feedback_id", feedbackId)
      .order("created_at", { ascending: true })
      .limit(20);
    if (error) return { ok: false, error: error.message };
    const rows = asRows<{ id: string; storage_path: string; file_name: string }>(rowsRaw);
    if (rows.length === 0) return { ok: true, data: { photos: [] } };

    const { data: signed, error: signError } = await admin.storage
      .from("feedback")
      .createSignedUrls(rows.map((r) => r.storage_path), 600);
    if (signError) return { ok: false, error: signError.message };

    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl] as const));
    const photos = rows
      .map((r) => ({ id: r.id, url: byPath.get(r.storage_path) ?? "", fileName: r.file_name }))
      .filter((p) => p.url !== "");
    return { ok: true, data: { photos } };
  } catch (e) {
    return fail(e);
  }
}

// ── Apology-voucher automation (push-fired on resolve) ────────────────────────

/**
 * The cron rules engine matches per-batch dedupe keys, which can't express
 * "once per feedback record" — so this event fires push-style from
 * resolveFeedbackAction, idempotent at BOTH layers the engine uses:
 * automation_executions (rule_id, customer_id, dedupe_key) and
 * vouchers.dedupe_key. Re-resolving after a reopen never double-issues.
 */
async function fireApologyVoucher(rec: FeedbackCore, actor: SessionUser) {
  const admin = createAdminClient();
  const { data: rulesRaw } = await admin
    .from("automation_rules")
    .select("id, name, condition, action_type, action_config")
    .eq("event_type", "negative_feedback_resolved")
    .eq("is_enabled", true)
    .limit(10);
  const rules = asRows<{
    id: string;
    name: string;
    condition: Record<string, unknown>;
    action_type: string;
    action_config: Record<string, unknown>;
  }>(rulesRaw);

  for (const rule of rules) {
    const maxRating = Number(rule.condition?.max_rating ?? 2);
    if (rec.rating > maxRating || !rec.customer_id) continue;
    if (rule.action_type !== "issue_voucher") continue;

    const dedupeKey = `feedback:${rec.id}`;
    const { data: exec } = await admin
      .from("automation_executions")
      .insert(
        dbInsert("automation_executions", {
          rule_id: rule.id,
          customer_id: rec.customer_id,
          dedupe_key: dedupeKey,
        }),
        { count: "exact" },
      )
      .select("rule_id");
    if (asRows<{ rule_id: string }>(exec).length === 0) continue; // already fired

    const cfg = rule.action_config;
    const type = (cfg.type as string) ?? "fixed";
    const validDays = Number(cfg.valid_days ?? 30);
    const prefix = String(cfg.prefix ?? "SORRY").replace(/[^A-Z0-9]/gi, "").toUpperCase() || "SORRY";
    const code = `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

    const { data: voucherRaw, error: voucherError } = await admin
      .from("vouchers")
      .insert(
        dbInsert("vouchers", {
          code,
          type: type as never,
          value_percent: type === "percentage" ? Number(cfg.value_percent ?? 10) : null,
          value_cents: type === "fixed" ? Number(cfg.value_cents ?? 1000) : null,
          end_date: new Date(Date.now() + validDays * 86_400_000).toISOString().slice(0, 10),
          usage_limit: 1,
          assigned_customer_id: rec.customer_id,
          source: "automatic",
          dedupe_key: `rule:${rule.id}:${dedupeKey}`,
        }),
      )
      .select("code")
      .maybeSingle();
    if (voucherError) {
      if (voucherError.code !== "23505")
        console.error("[feedback] apology voucher failed:", voucherError.message);
      continue;
    }
    const issued = asRow<{ code: string }>(voucherRaw)?.code ?? code;

    void sendNotification({
      type: "system",
      category: "voucher_issued",
      title: `Apology voucher ${issued} issued`,
      body: `${rule.name} fired for resolved feedback ${rec.code}.`,
      audience: { type: "role", role: "admin" },
      linkUrl: `/crm?tab=vouchers`,
    }).catch(() => undefined);

    void logActivity({
      actor,
      action: "automation.run",
      module: "marketing",
      targetType: "automation_rule",
      targetId: rule.id,
      summary: `${rule.name}: issued ${issued} for feedback ${rec.code}`,
      after: { voucher_code: issued, feedback_id: rec.id },
    });
  }
}
