import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import type { ConversationRow } from "../groups/route";

export interface MessageSearchHit {
  id: string;
  group_id: string;
  body: string;
  created_at: string;
  sender: { full_name: string } | null;
  message_groups: { name: string | null; type: string } | null;
}

export interface MessagingSearchResults {
  /** Conversations whose group name or direct-participant name matches. */
  conversations: ConversationRow[];
  /** Messages whose BODY matches (tsvector full-text, websearch syntax). */
  messages: MessageSearchHit[];
}

/**
 * GET /api/messages/search?q= — global keyword search across messaging:
 * group names + direct-conversation participants (from the caller's
 * conversation list) AND message bodies via the GIN-indexed tsvector.
 * RLS scopes message hits to groups the caller can see.
 */
export const GET = withPermission("messages.view", async (req) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) {
    return jsonOk({ conversations: [], messages: [] } satisfies MessagingSearchResults);
  }

  const supabase = await createClient();
  const [convRes, msgRes] = await Promise.all([
    supabase.rpc("my_conversations"),
    supabase
      .from("messages")
      .select(
        `id, group_id, body, created_at,
         sender:users!messages_sender_id_fkey(full_name),
         message_groups(name, type)`,
      )
      .eq("deleted", false)
      .textSearch("body_tsv", q, { type: "websearch" })
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (msgRes.error) return jsonError(msgRes.error.message, 500);

  const needle = q.toLowerCase();
  const conversations = asRows<ConversationRow>(convRes.data).filter((c) =>
    (c.name ?? c.other_name ?? "").toLowerCase().includes(needle),
  );

  return jsonOk({
    conversations: conversations.slice(0, 10),
    messages: asRows<MessageSearchHit>(msgRes.data),
  } satisfies MessagingSearchResults);
});
