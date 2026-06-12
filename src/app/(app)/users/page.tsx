import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import { PageHeader } from "@/components/states";
import { UsersTable } from "./users-table";

export const metadata = { title: "User Management" };

export interface RoleOption {
  id: string;
  key: string;
  name: string;
}

/** User Management (Module 1). Admin-only via the users.view permission. */
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("users.view")) redirect("/dashboard");

  const supabase = await createClient();
  const [rolesRes, pinsRes] = await Promise.all([
    supabase.from("roles").select("id, key, name").order("rank", { ascending: false }),
    // The viewer's personal pins (RLS limits to own rows) with the pinned
    // users' list-row columns — rendered as a strip above the table.
    supabase
      .from("user_pins")
      .select(
        `pinned:users!user_pins_pinned_user_id_fkey(
           id, full_name, email, phone, department, avatar_url, is_active, status,
           ban_reason, banned_at, birthday, gender, last_login_at, created_at,
           roles(key, name), banned_by_user:users!banned_by(full_name))`,
      )
      .eq("pinned_by", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const roles = asRows<RoleOption>(rolesRes.data);
  const pinnedUsers = asRows<{ pinned: unknown }>(pinsRes.data)
    .map((r) => r.pinned)
    .filter(Boolean) as never[];

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        title="User Management"
        description="Invite, edit, deactivate or ban accounts. Deactivated and banned users can’t sign in but stay in history."
      />
      <div className="mt-6">
        <UsersTable roles={roles} pinnedUsers={pinnedUsers} />
      </div>
    </div>
  );
}
