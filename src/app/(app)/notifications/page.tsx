import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import { PageHeader } from "@/components/states";
import { NotificationsCenter } from "./notifications-center";
import { ComposeNotificationButton } from "./compose-dialog";

export const metadata = { title: "Notifications" };

/** Notification center (Module 3): read/unread state, mark-read, compose (Admin). */
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("notifications.view")) redirect("/dashboard");

  // Recipient options for Admin "specific users" sends.
  let users: { id: string; full_name: string }[] = [];
  if (user.permissions.has("notifications.create")) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("users")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name", { ascending: true })
      .limit(100);
    users = asRows<{ id: string; full_name: string }>(data);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader
        title="Notifications"
        description="Announcements and system alerts — order assignments, deliveries and new messages."
        actions={
          user.permissions.has("notifications.create") ? (
            <ComposeNotificationButton users={users} />
          ) : undefined
        }
      />
      <div className="mt-6">
        <NotificationsCenter />
      </div>
    </div>
  );
}
