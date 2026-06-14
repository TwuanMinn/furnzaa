"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows, dbInsert, dbUpdate } from "@/lib/supabase/types";
import { requirePermission, type SessionUser } from "@/lib/rbac/guards";
import { logActivity } from "@/lib/activity/log";
import { notifyNewGroupMessage } from "@/lib/notifications/service";
import { fail, type ActionResult } from "@/lib/actions/result";

/**
 * Messages (Module 4) server actions. Sends/edits run through the USER-scoped
 * client so the messages RLS policies (member-only, sender-only) are the
 * enforcement; membership management uses the admin client behind explicit
 * permission guards (group_members has no authenticated INSERT policy by
 * design). Deletes and group changes are activity-logged per the spec.
 */

export type MsgResult<T = undefined> = ActionResult<T>;

async function isMember(groupId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

// ── Groups ───────────────────────────────────────────────────────────────────

const createGroupSchema = z.object({
  name: z.string().trim().min(2, "Group name is required").max(120),
  memberIds: z.array(z.string().uuid()).min(1, "Add at least one member"),
});

export async function createGroupAction(
  input: z.infer<typeof createGroupSchema>,
): Promise<MsgResult<{ groupId: string }>> {
  try {
    const actor = await requirePermission("messages.create_group");
    const parsed = createGroupSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const { name, memberIds } = parsed.data;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("message_groups")
      .insert(dbInsert("message_groups", { name, type: "group", created_by: actor.id }))
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Failed to create group" };
    const groupId = (data as { id: string }).id;

    const members = [...new Set([actor.id, ...memberIds])];
    const { error: membersError } = await admin.from("group_members").insert(
      dbInsert(
        "group_members",
        members.map((userId) => ({
          group_id: groupId,
          user_id: userId,
          role: userId === actor.id ? "owner" : "member",
        })),
      ),
    );
    if (membersError) return { ok: false, error: membersError.message };

    void logActivity({
      actor,
      action: "message_group.create",
      module: "messages",
      targetType: "message_group",
      targetId: groupId,
      summary: `Created message group “${name}” with ${members.length} member(s)`,
      after: { name, members: members.length },
    });
    return { ok: true, data: { groupId } };
  } catch (e) {
    return fail(e);
  }
}

/** Start (or reuse) a direct conversation with another user. */
export async function startDirectConversationAction(
  otherUserId: string,
): Promise<MsgResult<{ groupId: string }>> {
  try {
    const actor = await requirePermission("messages.send");
    if (!z.string().uuid().safeParse(otherUserId).success) {
      return { ok: false, error: "Invalid user" };
    }
    if (otherUserId === actor.id) return { ok: false, error: "Pick someone other than yourself." };

    const admin = createAdminClient();

    // Reuse an existing direct conversation between exactly these two.
    const { data: mine } = await admin
      .from("group_members")
      .select("group_id, message_groups!inner(type)")
      .eq("user_id", actor.id)
      .eq("message_groups.type", "direct");
    const myDirectIds = asRows<{ group_id: string }>(mine).map((r) => r.group_id);
    if (myDirectIds.length > 0) {
      const { data: shared } = await admin
        .from("group_members")
        .select("group_id")
        .eq("user_id", otherUserId)
        .in("group_id", myDirectIds)
        .limit(1);
      const existing = asRows<{ group_id: string }>(shared)[0];
      if (existing) return { ok: true, data: { groupId: existing.group_id } };
    }

    const { data, error } = await admin
      .from("message_groups")
      .insert(dbInsert("message_groups", { name: null, type: "direct", created_by: actor.id }))
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Failed to start conversation" };
    const groupId = (data as { id: string }).id;

    const { error: membersError } = await admin.from("group_members").insert(
      dbInsert("group_members", [
        { group_id: groupId, user_id: actor.id, role: "owner" },
        { group_id: groupId, user_id: otherUserId, role: "member" },
      ]),
    );
    if (membersError) return { ok: false, error: membersError.message };

    return { ok: true, data: { groupId } };
  } catch (e) {
    return fail(e);
  }
}

const updateMembersSchema = z.object({
  groupId: z.string().uuid(),
  addIds: z.array(z.string().uuid()).default([]),
  removeIds: z.array(z.string().uuid()).default([]),
});

export async function updateGroupMembersAction(
  input: z.infer<typeof updateMembersSchema>,
): Promise<MsgResult> {
  try {
    const actor = await requirePermission("messages.manage_group");
    const parsed = updateMembersSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const { groupId, addIds, removeIds } = parsed.data;

    const admin = createAdminClient();
    const { data: groupRaw } = await admin
      .from("message_groups")
      .select("id, name, type")
      .eq("id", groupId)
      .maybeSingle();
    const group = asRow<{ id: string; name: string | null; type: string }>(groupRaw);
    if (!group || group.type !== "group") return { ok: false, error: "Group not found." };

    if (addIds.length > 0) {
      const { error } = await admin.from("group_members").upsert(
        dbInsert(
          "group_members",
          addIds.map((userId) => ({ group_id: groupId, user_id: userId, role: "member" })),
        ),
        { onConflict: "group_id,user_id" },
      );
      if (error) return { ok: false, error: error.message };
    }
    if (removeIds.length > 0) {
      const { error } = await admin
        .from("group_members")
        .delete()
        .eq("group_id", groupId)
        .in("user_id", removeIds);
      if (error) return { ok: false, error: error.message };
    }

    void logActivity({
      actor,
      action: "message_group.members_change",
      module: "messages",
      targetType: "message_group",
      targetId: groupId,
      summary: `Updated members of “${group.name}” (+${addIds.length} / −${removeIds.length})`,
      after: { added: addIds.length, removed: removeIds.length },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Messages ─────────────────────────────────────────────────────────────────

const ATTACHMENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

const sendMessageSchema = z.object({
  groupId: z.string().uuid(),
  body: z.string().trim().max(8000),
  attachments: z
    .array(
      z.object({
        path: z.string().min(1).max(500),
        name: z.string().min(1).max(300),
        mimeType: z.string().max(150),
        sizeBytes: z.number().int().min(0),
      }),
    )
    .max(10)
    .default([]),
  /** Reply threading (v4): quoted message id, validated as same-group. */
  replyToMessageId: z.string().uuid().nullable().optional(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export async function sendMessageAction(
  input: SendMessageInput,
): Promise<MsgResult<{ messageId: string }>> {
  try {
    const actor = await requirePermission("messages.send");
    const parsed = sendMessageSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const { groupId, body, attachments } = parsed.data;

    if (!body && attachments.length === 0) {
      return { ok: false, error: "Write a message or attach a file." };
    }
    for (const a of attachments) {
      if (!ATTACHMENT_TYPES.has(a.mimeType)) {
        return { ok: false, error: `Attachment type ${a.mimeType} is not allowed` };
      }
      if (a.sizeBytes > ATTACHMENT_MAX_BYTES) {
        return { ok: false, error: "Attachments are limited to 25 MB" };
      }
    }

    // Reply targets must live in the SAME conversation (RLS scopes the read).
    let replyTo: string | null = null;
    if (parsed.data.replyToMessageId) {
      const supabaseCheck = await createClient();
      const { data: target } = await supabaseCheck
        .from("messages")
        .select("id, group_id")
        .eq("id", parsed.data.replyToMessageId)
        .maybeSingle();
      const targetRow = asRow<{ id: string; group_id: string }>(target);
      if (targetRow?.group_id === groupId) replyTo = targetRow.id;
    }

    // USER client: messages_insert RLS requires sender=me AND membership.
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("messages")
      .insert(
        dbInsert("messages", {
          group_id: groupId,
          sender_id: actor.id,
          body,
          reply_to_message_id: replyTo,
        }),
      )
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, error: error?.message ?? "You can only post in groups you belong to." };
    }
    const messageId = (data as { id: string }).id;

    if (attachments.length > 0) {
      const { error: attachError } = await supabase.from("message_attachments").insert(
        dbInsert(
          "message_attachments",
          attachments.map((a) => ({
            message_id: messageId,
            file_name: a.name,
            file_url: a.path,
            storage_path: a.path,
            mime_type: a.mimeType,
            size_bytes: a.sizeBytes,
            kind: a.mimeType.startsWith("image/") ? "image" : "file",
          })),
        ),
      );
      if (attachError) return { ok: false, error: attachError.message };
    }

    // Notify the other members (system notification; spec Module 3).
    void notifyGroupAsync(groupId, actor, body || `Sent ${attachments.length} attachment(s)`);

    return { ok: true, data: { messageId } };
  } catch (e) {
    return fail(e);
  }
}

async function notifyGroupAsync(groupId: string, actor: SessionUser, preview: string) {
  try {
    const admin = createAdminClient();
    const [{ data: groupRaw }, { data: membersRaw }] = await Promise.all([
      admin.from("message_groups").select("name, type").eq("id", groupId).maybeSingle(),
      admin.from("group_members").select("user_id").eq("group_id", groupId),
    ]);
    const group = asRow<{ name: string | null; type: string }>(groupRaw);
    const memberIds = asRows<{ user_id: string }>(membersRaw).map((m) => m.user_id);
    await notifyNewGroupMessage({
      groupId,
      groupName: group?.name ?? (group?.type === "direct" ? `a direct message from ${actor.fullName}` : "your group"),
      senderId: actor.id,
      senderName: actor.fullName,
      memberIds,
      preview,
    });
  } catch (e) {
    console.error("[messages] notify failed:", e);
  }
}

export async function editMessageAction(messageId: string, body: string): Promise<MsgResult> {
  try {
    await requirePermission("messages.send");
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: "Message can’t be empty." };
    if (trimmed.length > 8000) return { ok: false, error: "Message is too long." };

    // USER client: RLS only lets the sender (or admin) update.
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("messages")
      .update(dbUpdate("messages", { body: trimmed, edited: true, edited_at: new Date().toISOString() }))
      .eq("id", messageId)
      .eq("deleted", false)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (asRows(data).length === 0) return { ok: false, error: "You can only edit your own messages." };
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Soft-delete a message (own, or any with messages.delete_any). Logged. */
export async function deleteMessageAction(messageId: string): Promise<MsgResult> {
  try {
    const actor = await requirePermission("messages.send");

    const supabase = await createClient();
    const { data: msgRaw } = await supabase
      .from("messages")
      .select("id, sender_id, group_id, body")
      .eq("id", messageId)
      .maybeSingle();
    const message = asRow<{ id: string; sender_id: string | null; group_id: string; body: string }>(msgRaw);
    if (!message) return { ok: false, error: "Message not found." };
    if (message.sender_id !== actor.id && !actor.permissions.has("messages.delete_any")) {
      return { ok: false, error: "You can only delete your own messages." };
    }

    const { data, error } = await supabase
      .from("messages")
      .update(
        dbUpdate("messages", { deleted: true, deleted_at: new Date().toISOString(), body: "" }),
      )
      .eq("id", messageId)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (asRows(data).length === 0) return { ok: false, error: "Delete failed." };

    void logActivity({
      actor,
      action: "message.delete",
      module: "messages",
      targetType: "message",
      targetId: messageId,
      summary:
        message.sender_id === actor.id
          ? "Deleted their own message"
          : "Deleted another user's message (moderator)",
      before: { body: message.body.slice(0, 500), group_id: message.group_id },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Mark a conversation read (my membership row only — RLS-enforced). */
export async function markGroupReadAction(groupId: string): Promise<MsgResult> {
  try {
    const actor = await requirePermission("messages.view");
    const supabase = await createClient();
    const { error } = await supabase
      .from("group_members")
      .update(dbUpdate("group_members", { last_read_at: new Date().toISOString() }))
      .eq("group_id", groupId)
      .eq("user_id", actor.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Signed URL for an attachment — only for members of its group. */
export async function getAttachmentUrlAction(
  attachmentId: string,
): Promise<{ ok: true; url: string; name: string } | { ok: false; error: string }> {
  try {
    const actor = await requirePermission("messages.view");
    const admin = createAdminClient();
    const { data: attachRaw } = await admin
      .from("message_attachments")
      .select("storage_path, file_name, messages!inner(group_id)")
      .eq("id", attachmentId)
      .maybeSingle();
    const attach = asRow<{ storage_path: string; file_name: string; messages: { group_id: string } }>(attachRaw);
    if (!attach) return { ok: false, error: "Attachment not found." };

    const member = actor.roleKey === "admin" || (await isMember(attach.messages.group_id, actor.id));
    if (!member) return { ok: false, error: "You don't have access to this attachment." };

    const { data, error } = await admin.storage
      .from("attachments")
      .createSignedUrl(attach.storage_path, 600);
    if (error || !data) return { ok: false, error: error?.message ?? "Could not sign URL" };
    return { ok: true, url: data.signedUrl, name: attach.file_name };
  } catch (e) {
    return fail(e);
  }
}
