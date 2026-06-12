import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { asRow } from "@/lib/supabase/types";
import { SessionProvider, type SessionUserLite } from "@/lib/rbac/context";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { AppTopbar } from "@/components/shell/app-topbar";

/**
 * Protected app shell. Loads the session (redirecting deactivated/anonymous
 * users to /login), hydrates the client SessionProvider with the user's
 * permissions, and renders the collapsible sidebar + top bar around each page.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const [{ data: prefRaw }, { data: unread }] = await Promise.all([
    supabase.from("user_preferences").select("sidebar_collapsed").eq("user_id", user.id).maybeSingle(),
    supabase.rpc("unread_notification_count"),
  ]);
  const pref = asRow<{ sidebar_collapsed: boolean }>(prefRaw);
  const collapsed = pref?.sidebar_collapsed ?? false;

  const sessionLite: SessionUserLite = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roleKey: user.roleKey,
    roleName: user.roleName,
    avatarUrl: user.avatarUrl,
    permissions: [...user.permissions],
  };

  return (
    <SessionProvider user={sessionLite}>
      <div className="flex min-h-dvh bg-background">
        <AppSidebar initialCollapsed={collapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar unreadCount={Number(unread ?? 0)} />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}
