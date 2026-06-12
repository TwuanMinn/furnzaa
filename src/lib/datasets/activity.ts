import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import type { SessionUser } from "@/lib/rbac/guards";
import type { ListQuery } from "@/lib/datatable/types";
import {
  buildPage,
  decodeCursor,
  ilikeAnyExpression,
  keysetOrExpression,
  type ParsedListQuery,
} from "@/lib/datatable/server";
import type { ExportDataset } from "@/lib/export/types";
import { formatDateTime } from "@/lib/format";

export type ActivityListRow = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  module: string;
  target_type: string | null;
  target_id: string | null;
  summary: string;
  before_data: unknown;
  after_data: unknown;
  ip_address: string | null;
  created_at: string;
  actor: { full_name: string; avatar_url: string | null } | null;
};

const LIST_COLUMNS =
  "id, actor_id, actor_email, action, module, target_type, target_id, summary, before_data, after_data, ip_address, created_at, actor:users!activity_logs_actor_id_fkey(full_name, avatar_url)";

/** Append-only feed — only chronological sorting makes sense here. */
export const ACTIVITY_SORTABLE: Record<string, string> = {
  created_at: "created_at",
};

export const ACTIVITY_MODULES = [
  "auth",
  "users",
  "customers",
  "orders",
  "notifications",
  "messages",
  "logs",
  "analytics",
  "settings",
] as const;

/**
 * One keyset page of activity logs. RLS scopes staff to their own entries
 * (logs.view); admins see everything (logs.view_all). Search hits the
 * summary trigram index + actor email.
 */
export async function fetchActivityPage(parsed: ParsedListQuery) {
  const supabase = await createClient();

  let query = supabase
    .from("activity_logs")
    .select(LIST_COLUMNS, parsed.cursor ? {} : { count: "estimated" });

  if (parsed.q) {
    query = query.or(ilikeAnyExpression(["summary", "actor_email", "action"], parsed.q));
  }
  const moduleFilter = parsed.filters["module"];
  if (moduleFilter) query = query.eq("module", moduleFilter);
  const actionFilter = parsed.filters["action"];
  if (actionFilter) query = query.eq("action", actionFilter);
  const actorFilter = parsed.filters["actor"];
  if (actorFilter) query = query.eq("actor_id", actorFilter);
  const from = parsed.filters["created_at_from"];
  const to = parsed.filters["created_at_to"];
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  if (parsed.cursor) {
    query = query.or(keysetOrExpression(parsed.cursor, parsed.sort, parsed.ascending));
  }

  const { data, error, count } = await query
    .order(parsed.sort, { ascending: parsed.ascending })
    .order("id", { ascending: parsed.ascending })
    .limit(parsed.limit + 1);

  if (error) throw new Error(error.message);
  return buildPage(asRows<ActivityListRow>(data), parsed.limit, parsed.sort, count ?? null);
}

async function fetchActivityForExport(
  query: ListQuery,
  _user: SessionUser,
  limit: number,
): Promise<ActivityListRow[]> {
  const all: ActivityListRow[] = [];
  let cursor: string | null = null;
  while (all.length < limit) {
    const page = await fetchActivityPage({
      q: (query.q ?? "").trim().slice(0, 200),
      sort: "created_at",
      ascending: query.dir === "asc",
      cursor: decodeCursor(cursor),
      limit: Math.min(1_000, limit - all.length),
      filters: query.filters ?? {},
    });
    all.push(...page.rows);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return all;
}

export const activityExportDataset: ExportDataset<ActivityListRow> = {
  title: "Activity Log",
  slug: "activity",
  module: "logs",
  permission: "logs.export",
  columns: [
    { header: "Timestamp", value: (r) => formatDateTime(r.created_at), width: 1.5 },
    { header: "Actor", value: (r) => r.actor?.full_name ?? r.actor_email ?? "System", width: 1.4 },
    { header: "Action", value: (r) => r.action, width: 1.2 },
    { header: "Module", value: (r) => r.module, width: 0.9 },
    { header: "Summary", value: (r) => r.summary, width: 3 },
    { header: "Target", value: (r) => (r.target_type ? `${r.target_type}:${r.target_id ?? ""}` : ""), width: 1.4 },
    { header: "IP", value: (r) => r.ip_address, width: 1 },
  ],
  fetchRows: fetchActivityForExport,
};
