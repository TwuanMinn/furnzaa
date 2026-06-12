"use server";

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows, dbInsert, dbUpdate, rpcParams } from "@/lib/supabase/types";
import { requirePermission, ForbiddenError, UnauthorizedError } from "@/lib/rbac/guards";
import { logActivity } from "@/lib/activity/log";
import { sendNotification } from "@/lib/notifications/service";
import { getOrgSettings } from "@/lib/settings/config";

/**
 * Messages v4 server actions (Module 8 advanced): reactions, pins (group +
 * personal), stars, forwarding, group lifecycle (edit/leave/delete), internal
 * invite links (hashed tokens), the unified scheduler, and polls. RLS from
 * 0016 is the second enforcement layer behind every guard here.
 */

export type MsgResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof UnauthorizedError) return { ok: false, error: "You are not signed in." };
  if (e instanceof ForbiddenError) return { ok: false, error: "You don't have permission to do that." };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

// ── Reactions ────────────────────────────────────────────────────────────────

export async function toggleReactionAction(messageId: string, emoji: string): Promise<MsgResult> {
  try {
    const actor = await requirePermission("messages.send");
    if (!emoji || emoji.length > 16) return { ok: false, error: "Invalid emoji" };

    const supabase = await createClient(); // RLS: member-only, own rows
    const { data: existing } = await supabase
      .from("message_reactions")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", actor.id)
      .eq("emoji", emoji)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("message_reactions")
        .delete()
        .eq("id", (existing as { id: string }).id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("message_reactions")
        .insert(dbInsert("message_reactions", { message_id: messageId, user_id: actor.id, emoji }));
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Pins (group-wide, logged) + personal conversation pins + stars ───────────

export async function togglePinMessageAction(messageId: string): Promise<MsgResult> {
  try {
    const actor = await requirePermission("messages.send");
    const supabase = await createClient();

    const { data: msgRaw } = await supabase
      .from("messages")
      .select("id, group_id, body")
      .eq("id", messageId)
      .maybeSingle();
    const message = asRow<{ id: string; group_id: string; body: string }>(msgRaw);
    if (!message) return { ok: false, error: "Message not found" };

    const { data: existing } = await supabase
      .from("message_pins")
      .select("id")
      .eq("message_id", messageId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("message_pins")
        .delete()
        .eq("id", (existing as { id: string }).id);
      if (error) return { ok: false, error: error.message };
      void logActivity({
        actor,
        action: "message.unpin",
        module: "messages",
        targetType: "message",
        targetId: messageId,
        summary: `Unpinned a message: “${message.body.slice(0, 60)}”`,
      });
    } else {
      const { error } = await supabase.from("message_pins").insert(
        dbInsert("message_pins", {
          group_id: message.group_id,
          message_id: messageId,
          pinned_by: actor.id,
        }),
      );
      if (error) return { ok: false, error: error.message };
      void logActivity({
        actor,
        action: "message.pin",
        module: "messages",
        targetType: "message",
        targetId: messageId,
        summary: `Pinned a message: “${message.body.slice(0, 60)}”`,
      });
    }
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Personal: pin/unpin a conversation to the top of MY list (not logged — preference). */
export async function togglePinnedConversationAction(groupId: string): Promise<MsgResult> {
  try {
    const actor = await requirePermission("messages.view");
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("pinned_conversations")
      .select("id")
      .eq("user_id", actor.id)
      .eq("group_id", groupId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("pinned_conversations")
        .delete()
        .eq("id", (existing as { id: string }).id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("pinned_conversations")
        .insert(dbInsert("pinned_conversations", { user_id: actor.id, group_id: groupId }));
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Personal star (private favorite — never visible to others). */
export async function toggleStarAction(messageId: string): Promise<MsgResult> {
  try {
    const actor = await requirePermission("messages.view");
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("message_stars")
      .select("id")
      .eq("user_id", actor.id)
      .eq("message_id", messageId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("message_stars")
        .delete()
        .eq("id", (existing as { id: string }).id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("message_stars")
        .insert(dbInsert("message_stars", { user_id: actor.id, message_id: messageId }));
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Forwarding ───────────────────────────────────────────────────────────────

export async function forwardMessageAction(
  messageId: string,
  targetGroupId: string,
): Promise<MsgResult<{ newMessageId: string }>> {
  try {
    const actor = await requirePermission("messages.send");
    const supabase = await createClient();

    // RLS-scoped read: the actor must be able to SEE the source message.
    const { data: srcRaw } = await supabase
      .from("messages")
      .select("id, body, deleted, message_attachments(file_name, file_url, storage_path, mime_type, size_bytes, kind)")
      .eq("id", messageId)
      .maybeSingle();
    const src = asRow<{
      id: string;
      body: string;
      deleted: boolean;
      message_attachments: {
        file_name: string;
        file_url: string;
        storage_path: string;
        mime_type: string;
        size_bytes: number;
        kind: string;
      }[];
    }>(srcRaw);
    if (!src || src.deleted) return { ok: false, error: "Message not found" };

    // RLS on messages_insert enforces target membership.
    const { data: created, error } = await supabase
      .from("messages")
      .insert(
        dbInsert("messages", {
          group_id: targetGroupId,
          sender_id: actor.id,
          body: src.body,
          forwarded: true,
          forwarded_from_message_id: src.id,
        }),
      )
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, error: error?.message ?? "You can only forward into groups you belong to." };
    }
    const newMessageId = (created as { id: string }).id;

    // Attachments forward BY REFERENCE — same storage object, no re-upload.
    if (src.message_attachments.length > 0) {
      const { error: attachError } = await supabase.from("message_attachments").insert(
        dbInsert(
          "message_attachments",
          src.message_attachments.map((a) => ({
            message_id: newMessageId,
            file_name: a.file_name,
            file_url: a.file_url,
            storage_path: a.storage_path,
            mime_type: a.mime_type,
            size_bytes: a.size_bytes,
            kind: a.kind,
          })),
        ),
      );
      if (attachError) return { ok: false, error: attachError.message };
    }

    void logActivity({
      actor,
      action: "message.forward",
      module: "messages",
      targetType: "message",
      targetId: newMessageId,
      summary: `Forwarded a message (“${src.body.slice(0, 50)}”)`,
      after: { from_message: src.id, to_group: targetGroupId },
    });
    return { ok: true, data: { newMessageId } };
  } catch (e) {
    return fail(e);
  }
}

// ── Mentions (called by the composer alongside sendMessageAction) ────────────

export async function notifyMentionsAction(
  groupId: string,
  messageId: string,
  mentionedUserIds: string[],
  mentionAll: boolean,
  preview: string,
): Promise<MsgResult> {
  try {
    const actor = await requirePermission("messages.send");
    const admin = createAdminClient();

    const [{ data: groupRaw }, { data: membersRaw }] = await Promise.all([
      admin.from("message_groups").select("name, type, created_by").eq("id", groupId).maybeSingle(),
      admin.from("group_members").select("user_id").eq("group_id", groupId),
    ]);
    const group = asRow<{ name: string | null; type: string; created_by: string | null }>(groupRaw);
    const memberIds = new Set(asRows<{ user_id: string }>(membersRaw).map((m) => m.user_id));
    if (!group || !memberIds.has(actor.id)) return { ok: false, error: "Not a group member" };

    let targets: string[];
    if (mentionAll) {
      // @all policy (Settings): "members" lets any group member @all;
      // "creator_admin" limits it to the group creator and Admins.
      const { messaging } = await getOrgSettings();
      if (
        messaging.all_mention_policy === "creator_admin" &&
        group.created_by !== actor.id &&
        actor.roleKey !== "admin"
      ) {
        return { ok: false, error: "@all is limited to the group creator and Admins." };
      }
      targets = [...memberIds].filter((id) => id !== actor.id);
    } else {
      targets = [...new Set(mentionedUserIds)].filter((id) => memberIds.has(id) && id !== actor.id);
    }
    if (targets.length === 0) return { ok: true };

    await sendNotification({
      type: "system",
      category: "mention",
      title: `${actor.fullName} mentioned you${group.name ? ` in ${group.name}` : ""}`,
      body: preview.slice(0, 140),
      audience: { type: "users", userIds: targets },
      senderId: actor.id,
      linkUrl: `/messages?group=${groupId}`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Group lifecycle ──────────────────────────────────────────────────────────

export async function updateGroupInfoAction(
  groupId: string,
  name: string,
  description: string,
): Promise<MsgResult> {
  try {
    const actor = await requirePermission("messages.manage_group");
    const trimmed = name.trim();
    if (trimmed.length < 2) return { ok: false, error: "Give the group a name" };

    const supabase = await createClient(); // RLS: admin-only group updates
    const { error } = await supabase
      .from("message_groups")
      .update(dbUpdate("message_groups", { name: trimmed, description: description.trim() || null }))
      .eq("id", groupId);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "message_group.update",
      module: "messages",
      targetType: "message_group",
      targetId: groupId,
      summary: `Updated group info (“${trimmed}”)`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Soft-delete a group — creator/Admin only (RLS + guard), logged. */
export async function deleteGroupAction(groupId: string): Promise<MsgResult> {
  try {
    const actor = await requirePermission("messages.view");
    const admin = createAdminClient();
    const { data: groupRaw } = await admin
      .from("message_groups")
      .select("name, type, created_by")
      .eq("id", groupId)
      .maybeSingle();
    const group = asRow<{ name: string | null; type: string; created_by: string | null }>(groupRaw);
    if (!group) return { ok: false, error: "Group not found" };
    if (group.created_by !== actor.id && actor.roleKey !== "admin") {
      return { ok: false, error: "Only the group creator or an Admin can delete a group." };
    }

    const { error } = await admin
      .from("message_groups")
      .update(
        dbUpdate("message_groups", { is_active: false, deleted_at: new Date().toISOString() }),
      )
      .eq("id", groupId);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "message_group.delete",
      module: "messages",
      targetType: "message_group",
      targetId: groupId,
      summary: `Deleted group “${group.name ?? "Direct conversation"}” (soft)`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Leave a group. `silent` skips the in-chat system message ONLY — the
 * membership change and the activity-log entry always happen (silence never
 * applies to the audit trail).
 */
export async function leaveGroupAction(groupId: string, silent: boolean): Promise<MsgResult> {
  try {
    const actor = await requirePermission("messages.view");
    const admin = createAdminClient();

    const { data: groupRaw } = await admin
      .from("message_groups")
      .select("name, type")
      .eq("id", groupId)
      .maybeSingle();
    const group = asRow<{ name: string | null; type: string }>(groupRaw);
    if (!group) return { ok: false, error: "Group not found" };
    if (group.type === "direct") return { ok: false, error: "Direct conversations can't be left." };

    const { error, count } = await admin
      .from("group_members")
      .delete({ count: "exact" })
      .eq("group_id", groupId)
      .eq("user_id", actor.id);
    if (error) return { ok: false, error: error.message };
    if ((count ?? 0) === 0) return { ok: false, error: "You're not a member of this group." };

    if (!silent) {
      await admin.from("messages").insert(
        dbInsert("messages", {
          group_id: groupId,
          sender_id: null, // system message
          body: `${actor.fullName} left the group`,
        }),
      );
    }

    void logActivity({
      actor,
      action: "message_group.leave",
      module: "messages",
      targetType: "message_group",
      targetId: groupId,
      summary: `Left group “${group.name}”${silent ? " (silently)" : ""}`,
      after: { silent },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Internal invite links (hashed tokens, revocable, atomic one-time) ────────

const inviteSchema = z.object({
  groupId: z.string().uuid(),
  linkType: z.enum(["one_time", "expiring", "permanent", "password"]),
  expiryHours: z.coerce.number().int().min(1).max(24 * 365).optional(),
  maxUses: z.coerce.number().int().min(1).max(10_000).optional(),
  password: z.string().min(4).max(100).optional(),
});

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 32);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

export async function createInviteLinkAction(
  input: z.infer<typeof inviteSchema>,
): Promise<MsgResult<{ url: string; linkId: string }>> {
  try {
    const actor = await requirePermission("messages.view");
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;
    if (v.linkType === "password" && !v.password) {
      return { ok: false, error: "Set a password for a password-protected link." };
    }

    const admin = createAdminClient();
    const { data: groupRaw } = await admin
      .from("message_groups")
      .select("name, created_by")
      .eq("id", v.groupId)
      .maybeSingle();
    const group = asRow<{ name: string | null; created_by: string | null }>(groupRaw);
    if (!group) return { ok: false, error: "Group not found" };
    if (group.created_by !== actor.id && actor.roleKey !== "admin") {
      return { ok: false, error: "Only the group creator or an Admin can create invite links." };
    }

    // Defaults for expiry/uses come from org Settings (messaging section).
    const { messaging } = await getOrgSettings();

    // Raw token lives ONLY in the returned URL — the DB stores its sha-256.
    const token = randomBytes(24).toString("base64url");
    const { data, error } = await admin
      .from("group_invite_links")
      .insert(
        dbInsert("group_invite_links", {
          group_id: v.groupId,
          created_by: actor.id,
          link_type: v.linkType,
          token_hash: hashToken(token),
          password_hash: v.linkType === "password" && v.password ? hashPassword(v.password) : null,
          expires_at:
            v.linkType === "expiring"
              ? new Date(
                  Date.now() +
                    (v.expiryHours ?? messaging.invite_link_defaults.expiry_hours) * 3600_000,
                ).toISOString()
              : null,
          max_uses:
            v.linkType === "one_time" ? 1 : (v.maxUses ?? messaging.invite_link_defaults.max_uses),
        }),
      )
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Failed to create link" };
    const linkId = (data as { id: string }).id;

    void logActivity({
      actor,
      action: "message_group.invite_link_create",
      module: "messages",
      targetType: "message_group",
      targetId: v.groupId,
      summary: `Created a ${v.linkType.replace("_", "-")} invite link for “${group.name}”`,
      after: { link_type: v.linkType, link_id: linkId },
    });

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return { ok: true, data: { url: `${base}/messages/join/${token}`, linkId } };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeInviteLinkAction(linkId: string): Promise<MsgResult> {
  try {
    const actor = await requirePermission("messages.view");
    const supabase = await createClient(); // RLS: creator/admin only
    const { data, error } = await supabase
      .from("group_invite_links")
      .update(dbUpdate("group_invite_links", { revoked_at: new Date().toISOString() }))
      .eq("id", linkId)
      .is("revoked_at", null)
      .select("group_id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Link not found or already revoked" };

    void logActivity({
      actor,
      action: "message_group.invite_link_revoke",
      module: "messages",
      targetType: "message_group",
      targetId: (data as { group_id: string }).group_id,
      summary: "Revoked a group invite link",
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Join via an invite URL. INTERNAL ONLY: the caller is already an
 * authenticated, active user (requirePermission), and the claim RPC re-checks
 * activity + consumes one-time links atomically. Every join is logged and
 * posts a system message.
 */
export async function joinViaInviteAction(
  token: string,
  password?: string,
): Promise<MsgResult<{ groupId: string; groupName: string }>> {
  try {
    const actor = await requirePermission("messages.view");
    if (!token || token.length > 200) return { ok: false, error: "Invalid invite link" };

    const admin = createAdminClient();
    const { data: linkRaw } = await admin
      .from("group_invite_links")
      .select("id, link_type, password_hash, group_id")
      .eq("token_hash", hashToken(token))
      .maybeSingle();
    const link = asRow<{
      id: string;
      link_type: string;
      password_hash: string | null;
      group_id: string;
    }>(linkRaw);
    if (!link) return { ok: false, error: "This invite link is not valid." };

    if (link.link_type === "password") {
      if (!password) return { ok: false, error: "password_required" };
      if (!link.password_hash || !verifyPassword(password, link.password_hash)) {
        return { ok: false, error: "Wrong password for this invite link." };
      }
    }

    const { data: claimRaw, error } = await admin.rpc(
      "claim_invite_link",
      rpcParams("claim_invite_link", { p_link_id: link.id, p_user_id: actor.id }),
    );
    if (error) return { ok: false, error: error.message };
    const claim = (Array.isArray(claimRaw) ? claimRaw[0] : claimRaw) as
      | { joined: boolean; group_id: string | null; reason: string | null }
      | undefined;
    if (!claim?.joined) return { ok: false, error: claim?.reason ?? "Could not join the group." };

    const { data: groupRaw } = await admin
      .from("message_groups")
      .select("name")
      .eq("id", link.group_id)
      .maybeSingle();
    const groupName = asRow<{ name: string | null }>(groupRaw)?.name ?? "the group";

    await admin.from("messages").insert(
      dbInsert("messages", {
        group_id: link.group_id,
        sender_id: null,
        body: `${actor.fullName} joined via invite link`,
      }),
    );
    void logActivity({
      actor,
      action: "message_group.join_via_link",
      module: "messages",
      targetType: "message_group",
      targetId: link.group_id,
      summary: `Joined “${groupName}” via a ${link.link_type.replace("_", "-")} invite link`,
    });

    return { ok: true, data: { groupId: link.group_id, groupName } };
  } catch (e) {
    return fail(e);
  }
}

// ── Unified scheduler ────────────────────────────────────────────────────────

const scheduleSchema = z.object({
  groupId: z.string().uuid(),
  kind: z.enum(["message", "reminder"]),
  body: z.string().trim().min(1, "Write the message/reminder").max(4000),
  runAt: z.string().min(10), // datetime-local
  audience: z.enum(["group", "only_me"]).default("group"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  repeatRule: z
    .enum(["none", "daily", "weekly", "monthly", "quarterly", "yearly", "custom"])
    .default("none"),
  repeatIntervalMinutes: z.coerce.number().int().min(5).max(60 * 24 * 365).optional(),
});

export async function createScheduledItemAction(
  input: z.infer<typeof scheduleSchema>,
): Promise<MsgResult<{ id: string }>> {
  try {
    const actor = await requirePermission("messages.send");
    const parsed = scheduleSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;

    const runAt = new Date(v.runAt);
    if (Number.isNaN(runAt.getTime()) || runAt.getTime() < Date.now() - 60_000) {
      return { ok: false, error: "Pick a time in the future." };
    }

    const supabase = await createClient(); // RLS: member + own rows
    const { data, error } = await supabase
      .from("scheduled_items")
      .insert(
        dbInsert("scheduled_items", {
          group_id: v.groupId,
          created_by: actor.id,
          kind: v.kind,
          body: v.body,
          audience: v.kind === "message" ? "group" : v.audience,
          priority: v.priority,
          next_run_at: runAt.toISOString(),
          repeat_rule: v.repeatRule,
          repeat_interval_minutes: v.repeatRule === "custom" ? (v.repeatIntervalMinutes ?? 60) : null,
        }),
      )
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Failed to schedule" };
    const id = (data as { id: string }).id;

    void logActivity({
      actor,
      action: "scheduler.create",
      module: "messages",
      targetType: "scheduled_item",
      targetId: id,
      summary: `Scheduled a ${v.kind} for ${runAt.toLocaleString()}${v.repeatRule !== "none" ? ` (repeats ${v.repeatRule})` : ""}`,
      after: { kind: v.kind, run_at: runAt.toISOString(), repeat: v.repeatRule },
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelScheduledItemAction(itemId: string): Promise<MsgResult> {
  try {
    const actor = await requirePermission("messages.view");
    const supabase = await createClient(); // RLS: creator/admin
    const { data, error } = await supabase
      .from("scheduled_items")
      .update(
        dbUpdate("scheduled_items", { is_active: false, cancelled_at: new Date().toISOString() }),
      )
      .eq("id", itemId)
      .eq("is_active", true)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Item not found or already finished" };

    void logActivity({
      actor,
      action: "scheduler.cancel",
      module: "messages",
      targetType: "scheduled_item",
      targetId: itemId,
      summary: "Cancelled a scheduled item",
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Polls ────────────────────────────────────────────────────────────────────

const pollSchema = z.object({
  groupId: z.string().uuid(),
  question: z.string().trim().min(3, "Ask a question").max(500),
  options: z.array(z.string().trim().min(1).max(200)).min(2, "Add at least two options").max(12),
  pollType: z.enum(["single", "multiple"]).default("single"),
  visibility: z.enum(["public", "anonymous"]).default("public"),
  closesAt: z.string().optional().or(z.literal("")),
});

export async function createPollAction(
  input: z.infer<typeof pollSchema>,
): Promise<MsgResult<{ pollId: string }>> {
  try {
    const actor = await requirePermission("messages.send");
    const parsed = pollSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;

    const supabase = await createClient(); // RLS: member-only
    const { data: pollRaw, error } = await supabase
      .from("polls")
      .insert(
        dbInsert("polls", {
          group_id: v.groupId,
          created_by: actor.id,
          question: v.question,
          poll_type: v.pollType,
          visibility: v.visibility,
          status: "open",
          closes_at: v.closesAt ? new Date(v.closesAt).toISOString() : null,
        }),
      )
      .select("id")
      .single();
    if (error || !pollRaw) return { ok: false, error: error?.message ?? "Failed to create poll" };
    const pollId = (pollRaw as { id: string }).id;

    const { error: optError } = await supabase.from("poll_options").insert(
      dbInsert(
        "poll_options",
        v.options.map((label, i) => ({ poll_id: pollId, label, sort_order: i })),
      ),
    );
    if (optError) return { ok: false, error: optError.message };

    // Anchor message in the chat (renders as a live PollCard).
    const { data: msgRaw } = await supabase
      .from("messages")
      .insert(
        dbInsert("messages", { group_id: v.groupId, sender_id: actor.id, body: `📊 ${v.question}` }),
      )
      .select("id")
      .single();
    if (msgRaw) {
      await supabase
        .from("polls")
        .update(dbUpdate("polls", { message_id: (msgRaw as { id: string }).id }))
        .eq("id", pollId);
    }

    void logActivity({
      actor,
      action: "poll.create",
      module: "messages",
      targetType: "poll",
      targetId: pollId,
      summary: `Created a ${v.visibility} ${v.pollType}-choice poll: “${v.question.slice(0, 80)}”`,
    });
    return { ok: true, data: { pollId } };
  } catch (e) {
    return fail(e);
  }
}

export async function votePollAction(pollId: string, optionIds: string[]): Promise<MsgResult> {
  try {
    await requirePermission("messages.send");
    const supabase = await createClient(); // cast_poll_vote reads auth.uid()
    const { error } = await supabase.rpc(
      "cast_poll_vote",
      rpcParams("cast_poll_vote", { p_poll_id: pollId, p_option_ids: optionIds }),
    );
    if (error) return { ok: false, error: error.message.replace(/^.*?:\s*/, "") };
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function closePollAction(pollId: string): Promise<MsgResult> {
  try {
    const actor = await requirePermission("messages.send");
    const supabase = await createClient(); // RLS: creator/admin update
    const { data, error } = await supabase
      .from("polls")
      .update(dbUpdate("polls", { status: "closed", closed_at: new Date().toISOString() }))
      .eq("id", pollId)
      .eq("status", "open")
      .select("question")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Poll not found or already closed" };

    void logActivity({
      actor,
      action: "poll.close",
      module: "messages",
      targetType: "poll",
      targetId: pollId,
      summary: `Closed poll “${(data as { question: string }).question.slice(0, 80)}”`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
