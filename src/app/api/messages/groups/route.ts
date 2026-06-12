import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";

export interface ConversationRow {
  group_id: string;
  name: string | null;
  type: "group" | "direct";
  created_at: string;
  last_read_at: string | null;
  other_user_id: string | null;
  other_name: string | null;
  other_avatar_url: string | null;
  member_count: number;
  last_body: string | null;
  last_at: string | null;
  last_sender_name: string | null;
  last_deleted: boolean | null;
  unread_count: number;
}

/**
 * GET /api/messages/groups — the caller's conversations (groups + directs)
 * with last-message preview and unread counts, via ONE RPC (no N+1).
 */
export const GET = withPermission("messages.view", async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_conversations");
  if (error) return jsonError(error.message, 500);
  return jsonOk({ conversations: asRows<ConversationRow>(data) });
});
