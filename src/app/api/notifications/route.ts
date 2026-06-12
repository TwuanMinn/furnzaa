import { withPermission } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import { buildPage, decodeCursor, keysetOrExpression } from "@/lib/datatable/server";

export type NotificationListRow = {
  id: string; // notification_reads id
  read_at: string | null;
  created_at: string;
  notifications: {
    id: string;
    type: string;
    category: string | null;
    title: string;
    body: string;
    link_url: string | null;
    created_at: string;
    sender: { full_name: string } | null;
  } | null;
};

/**
 * GET /api/notifications — the CURRENT user's notifications, newest first,
 * cursor-paginated, with their read state and the live unread count.
 * Params: cursor, limit, unread=true. Rides idx_notif_reads_user_unread.
 */
export const GET = withPermission("notifications.view", async (req, { user }) => {
  const url = new URL(req.url);
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20) || 20, 1), 50);
  const unreadOnly = url.searchParams.get("unread") === "true";

  const supabase = await createClient();
  let query = supabase
    .from("notification_reads")
    .select(
      `id, read_at, created_at,
       notifications(id, type, category, title, body, link_url, created_at,
         sender:users!notifications_sender_id_fkey(full_name))`,
    )
    .eq("user_id", user.id);
  if (unreadOnly) query = query.is("read_at", null);
  if (cursor) query = query.or(keysetOrExpression(cursor, "created_at", false));

  const [{ data, error }, { data: unread }] = await Promise.all([
    query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1),
    supabase.rpc("unread_notification_count"),
  ]);

  if (error) return jsonError(error.message, 500);
  const page = buildPage(asRows<NotificationListRow>(data), limit, "created_at", null);
  return jsonOk({ ...page, unread: Number(unread ?? 0) });
});
