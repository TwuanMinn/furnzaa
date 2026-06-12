import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
import type { ImportDataset } from "@/lib/import/server";
import type { ImportCommitResult, RowError, ValidatedRow } from "@/lib/import/types";
import { formatDateTime } from "@/lib/format";

export type UserListRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  department: string | null;
  avatar_url: string | null;
  is_active: boolean;
  status: "active" | "deactivated" | "banned";
  ban_reason: string | null;
  banned_at: string | null;
  birthday: string | null;
  gender: string | null;
  last_login_at: string | null;
  created_at: string;
  roles: { key: string; name: string } | null;
  banned_by_user: { full_name: string } | null;
};

const LIST_COLUMNS =
  "id, full_name, email, phone, department, avatar_url, is_active, status, ban_reason, banned_at, " +
  "birthday, gender, last_login_at, created_at, roles(key, name), " +
  "banned_by_user:users!banned_by(full_name)";

/** Allow-listed sortable columns (NOT NULL — keyset-safe). */
export const USER_SORTABLE: Record<string, string> = {
  created_at: "created_at",
  full_name: "full_name",
  email: "email",
};

/** One keyset page of users. Search hits the name/email trigram indexes. */
export async function fetchUsersPage(parsed: ParsedListQuery) {
  const supabase = await createClient();

  let query = supabase
    .from("users")
    .select(LIST_COLUMNS, parsed.cursor ? {} : { count: "estimated" });

  if (parsed.q) {
    query = query.or(ilikeAnyExpression(["full_name", "email"], parsed.q));
  }
  const role = parsed.filters["role"];
  if (role) query = query.eq("role_id", role); // value is a role id (from the filter options)
  const status = parsed.filters["status"];
  if (status) query = query.eq("status", status); // active | deactivated | banned (idx_users_status)
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
  return buildPage(asRows<UserListRow>(data), parsed.limit, parsed.sort, count ?? null);
}

async function fetchUsersForExport(
  query: ListQuery,
  _user: SessionUser,
  limit: number,
): Promise<UserListRow[]> {
  const all: UserListRow[] = [];
  let cursor: string | null = null;
  while (all.length < limit) {
    const page = await fetchUsersPage({
      q: (query.q ?? "").trim().slice(0, 200),
      sort: USER_SORTABLE[query.sort ?? ""] ? (query.sort as string) : "created_at",
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

export const usersExportDataset: ExportDataset<UserListRow> = {
  title: "Users",
  slug: "users",
  module: "users",
  permission: "users.export",
  columns: [
    { header: "Name", value: (r) => r.full_name, width: 1.8 },
    { header: "Email", value: (r) => r.email, width: 2 },
    { header: "Role", value: (r) => r.roles?.name ?? "" },
    { header: "Department", value: (r) => r.department, width: 1.2 },
    {
      header: "Status",
      value: (r) =>
        r.status === "banned" ? `Banned (${r.ban_reason ?? ""})` : r.status === "active" ? "Active" : "Deactivated",
      width: 1.2,
    },
    { header: "Last login", value: (r) => (r.last_login_at ? formatDateTime(r.last_login_at) : "Never"), width: 1.5 },
    { header: "Created", value: (r) => formatDateTime(r.created_at), width: 1.5 },
  ],
  fetchRows: fetchUsersForExport,
};

const IMPORT_FIELDS = [
  { key: "full_name", label: "Full name", type: "text", required: true, maxLength: 200, example: "Sara Lee" },
  { key: "email", label: "Email", type: "email", required: true, maxLength: 320, example: "sara@company.com" },
  { key: "role", label: "Role", type: "select", required: true, options: ["admin", "staff"], example: "staff" },
  { key: "phone", label: "Phone", type: "phone", maxLength: 25 },
  { key: "department", label: "Department", type: "text", maxLength: 120 },
] satisfies ImportDataset["fields"];

/**
 * Bulk user import. Each row needs a Supabase Auth account, so rows go through
 * the Auth admin API (modest concurrency) rather than table inserts. Imported
 * accounts are email-confirmed but have NO password — users set one via
 * "Forgot password". Duplicate emails are reported per row.
 */
async function insertUserRows(rows: ValidatedRow[], _user: SessionUser): Promise<ImportCommitResult> {
  const admin = createAdminClient();
  let inserted = 0;
  const errors: RowError[] = [];
  const CONCURRENCY = 8;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const slice = rows.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(async (row) => {
        const email = String(row.values["email"] ?? "");
        const { error } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            full_name: row.values["full_name"],
            role: row.values["role"],
            phone: row.values["phone"] ?? null,
            department: row.values["department"] ?? null,
          },
        });
        if (error) {
          const message =
            error.code === "email_exists" || /already/i.test(error.message)
              ? `A user with email ${email} already exists`
              : error.message;
          errors.push({ row: row.row, field: "email", message });
        } else {
          inserted += 1;
        }
      }),
    );
  }

  return { inserted, skipped: errors.length, errors };
}

export const usersImportDataset: ImportDataset = {
  title: "Users",
  slug: "users",
  module: "users",
  permission: "users.import",
  fields: IMPORT_FIELDS,
  insertRows: insertUserRows,
};
