import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRows } from "@/lib/supabase/types";
import { buildPage, decodeCursor, keysetOrExpression } from "@/lib/datatable/server";

export interface MessageAttachmentView {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  kind: "image" | "file";
  /** Short-lived signed URL (private bucket). */
  url: string | null;
}

export interface MessageReactionView {
  emoji: string;
  user_id: string;
  user_name: string;
}

export interface MessagePollView {
  id: string;
  question: string;
  poll_type: "single" | "multiple";
  visibility: "public" | "anonymous";
  status: "draft" | "open" | "closed";
  closes_at: string | null;
  options: { id: string; label: string }[];
  my_option_ids: string[];
}

export interface MessageRowView {
  id: string;
  group_id: string;
  sender_id: string | null;
  body: string;
  edited: boolean;
  deleted: boolean;
  forwarded: boolean;
  reply_to_message_id: string | null;
  /** Quoted preview of the replied-to message ("message deleted" fallback). */
  reply_preview: { sender_name: string; body: string } | null;
  created_at: string;
  sender: { full_name: string; avatar_url: string | null } | null;
  message_attachments: MessageAttachmentView[];
  reactions: MessageReactionView[];
  poll: MessagePollView | null;
  pinned: boolean;
  starred: boolean;
}

/**
 * GET /api/messages/groups/[id]/messages — one conversation's messages,
 * newest-first keyset pages (the client renders them bottom-up). RLS hides
 * groups the caller doesn't belong to. Optional f_date_from/_to filters.
 * Attachment URLs are signed server-side (10 min) after the RLS check.
 */
export const GET = withPermission("messages.view", async (req, ctx) => {
  const params = await ctx.params;
  const groupId = params?.id;
  if (!groupId) return jsonError("Missing group id", 400);
  const viewer = ctx.user;

  const url = new URL(req.url);
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 30) || 30, 1), 50);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const supabase = await createClient();
  let query = supabase
    .from("messages")
    .select(
      `id, group_id, sender_id, body, edited, deleted, forwarded, reply_to_message_id, created_at,
       sender:users!messages_sender_id_fkey(full_name, avatar_url),
       reply:reply_to_message_id(body, deleted, sender:users!messages_sender_id_fkey(full_name)),
       message_attachments(id, file_name, storage_path, mime_type, size_bytes, kind),
       message_reactions(emoji, user_id, users(full_name))`,
    )
    .eq("group_id", groupId);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);
  if (cursor) query = query.or(keysetOrExpression(cursor, "created_at", false));

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (error) return jsonError(error.message, 500);

  type RawRow = {
    id: string;
    group_id: string;
    sender_id: string | null;
    body: string;
    edited: boolean;
    deleted: boolean;
    forwarded: boolean;
    reply_to_message_id: string | null;
    created_at: string;
    sender: { full_name: string; avatar_url: string | null } | null;
    reply: { body: string; deleted: boolean; sender: { full_name: string } | null } | null;
    message_attachments: {
      id: string;
      file_name: string;
      storage_path: string;
      mime_type: string;
      size_bytes: number;
      kind: "image" | "file";
    }[];
    message_reactions: { emoji: string; user_id: string; users: { full_name: string } | null }[];
  };
  const page = buildPage(asRows<RawRow>(data), limit, "created_at", null);
  const messageIds = page.rows.map((m) => m.id);

  // Per-page decorations, all bounded by the page size (≤50 messages):
  // signed attachment URLs, this page's polls + my votes, pins, my stars.
  const paths = page.rows.flatMap((m) => m.message_attachments.map((a) => a.storage_path)).filter(Boolean);
  const urlByPath = new Map<string, string>();
  type PollRaw = {
    id: string;
    message_id: string | null;
    question: string;
    poll_type: "single" | "multiple";
    visibility: "public" | "anonymous";
    status: "draft" | "open" | "closed";
    closes_at: string | null;
    poll_options: { id: string; label: string; sort_order: number }[];
  };
  const pollByMessage = new Map<string, PollRaw>();
  const myVotesByPoll = new Map<string, string[]>();
  const pinnedIds = new Set<string>();
  const starredIds = new Set<string>();

  if (messageIds.length > 0) {
    const admin = createAdminClient();
    const [signedRes, pollsRes, pinsRes, starsRes] = await Promise.all([
      paths.length > 0
        ? admin.storage.from("attachments").createSignedUrls(paths, 600)
        : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
      supabase
        .from("polls")
        .select("id, message_id, question, poll_type, visibility, status, closes_at, poll_options(id, label, sort_order)")
        .in("message_id", messageIds),
      supabase.from("message_pins").select("message_id").eq("group_id", groupId).limit(100),
      supabase
        .from("message_stars")
        .select("message_id")
        .eq("user_id", viewer.id)
        .in("message_id", messageIds),
    ]);

    for (const s of signedRes.data ?? []) {
      if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
    }
    const polls = asRows<PollRaw>(pollsRes.data);
    for (const poll of polls) {
      if (poll.message_id) pollByMessage.set(poll.message_id, poll);
    }
    if (polls.length > 0) {
      const { data: votes } = await supabase
        .from("poll_votes")
        .select("poll_id, option_id")
        .eq("user_id", viewer.id)
        .in("poll_id", polls.map((p) => p.id));
      for (const v of asRows<{ poll_id: string; option_id: string }>(votes)) {
        const list = myVotesByPoll.get(v.poll_id) ?? [];
        list.push(v.option_id);
        myVotesByPoll.set(v.poll_id, list);
      }
    }
    for (const p of asRows<{ message_id: string }>(pinsRes.data)) pinnedIds.add(p.message_id);
    for (const s of asRows<{ message_id: string }>(starsRes.data)) starredIds.add(s.message_id);
  }

  const rows: MessageRowView[] = page.rows.map((m) => {
    const poll = pollByMessage.get(m.id);
    return {
      id: m.id,
      group_id: m.group_id,
      sender_id: m.sender_id,
      body: m.deleted ? "" : m.body,
      edited: m.edited,
      deleted: m.deleted,
      forwarded: m.forwarded,
      reply_to_message_id: m.reply_to_message_id,
      reply_preview: m.reply_to_message_id
        ? {
            sender_name: m.reply?.sender?.full_name ?? "Unknown",
            body: !m.reply || m.reply.deleted ? "message deleted" : m.reply.body.slice(0, 140),
          }
        : null,
      created_at: m.created_at,
      sender: m.sender,
      message_attachments: m.deleted
        ? []
        : m.message_attachments.map((a) => ({
            id: a.id,
            file_name: a.file_name,
            mime_type: a.mime_type,
            size_bytes: a.size_bytes,
            kind: a.kind,
            url: urlByPath.get(a.storage_path) ?? null,
          })),
      reactions: m.deleted
        ? []
        : m.message_reactions.map((r) => ({
            emoji: r.emoji,
            user_id: r.user_id,
            user_name: r.users?.full_name ?? "Unknown",
          })),
      poll: poll
        ? {
            id: poll.id,
            question: poll.question,
            poll_type: poll.poll_type,
            visibility: poll.visibility,
            status: poll.status,
            closes_at: poll.closes_at,
            options: [...poll.poll_options]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((o) => ({ id: o.id, label: o.label })),
            my_option_ids: myVotesByPoll.get(poll.id) ?? [],
          }
        : null,
      pinned: pinnedIds.has(m.id),
      starred: starredIds.has(m.id),
    };
  });

  return jsonOk({ rows, nextCursor: page.nextCursor, estimatedTotal: null });
});
