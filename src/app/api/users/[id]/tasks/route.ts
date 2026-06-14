import { withAuth } from "@/lib/api/with-permission";
import { jsonError, jsonOk } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import { rowToStaffTask, type StaffTask } from "@/lib/users/tasks";

/**
 * GET /api/users/[id]/tasks — the user-detail Tasks tab.
 * Access mirrors the rest of the sheet: you can always see your own tasks;
 * seeing someone else's needs tasks.view_all. The RLS-scoped client is the
 * second layer (its SELECT policy enforces the same own-or-view_all rule).
 */

export interface UserTasksResponse {
  tasks: StaffTask[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withAuth(async (_req, ctx) => {
  const params = await ctx.params;
  const id = params?.id;
  if (!id || !UUID_RE.test(id)) return jsonError("Invalid user id", 400);

  const { user } = ctx;
  if (id !== user.id && !user.permissions.has("tasks.view_all")) {
    return jsonError("You can only view your own tasks", 403, "forbidden");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_tasks")
    .select("id, title, done, priority, category, due_date, created_at")
    .eq("assigned_to", id)
    .eq("is_active", true)
    .order("done", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return jsonError(error.message, 500);

  const tasks = asRows<{
    id: string;
    title: string;
    done: boolean;
    priority: string;
    category: string;
    due_date: string | null;
  }>(data).map(rowToStaffTask);

  return jsonOk({ tasks } satisfies UserTasksResponse);
});
