import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import { getOrgSettings } from "@/lib/settings/config";
import { PageHeader } from "@/components/states";
import { ActivityTable } from "./activity-table";
import { PurgeLogsButton } from "./purge-logs-button";

export const metadata = { title: "Activity Log" };

/**
 * Activity Log (Module 5): append-only audit trail. Staff see their own
 * entries; Admins see everything (RLS-enforced on top of the permission
 * gate). Only Admins may purge old entries — and the purge is itself logged.
 */
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("logs.view")) redirect("/dashboard");

  const canViewAll = user.permissions.has("logs.view_all");
  const canPurge = user.permissions.has("logs.purge");
  // Purge dialog defaults to the configured retention window (Settings → Data).
  const retentionDays = canPurge ? (await getOrgSettings()).logRetentionDays : 365;

  // Actor filter options (admins only — staff only ever see themselves).
  let actors: { id: string; full_name: string }[] = [];
  if (canViewAll) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("users")
      .select("id, full_name")
      .order("full_name", { ascending: true })
      .limit(100);
    actors = asRows<{ id: string; full_name: string }>(data);
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        title="Activity Log"
        description={
          canViewAll
            ? "Append-only audit trail of every change across the company."
            : "Your activity history. Entries can’t be edited or removed."
        }
        actions={canPurge ? <PurgeLogsButton defaultDays={retentionDays} /> : undefined}
      />
      <div className="mt-6">
        <ActivityTable actors={actors} canViewAll={canViewAll} />
      </div>
    </div>
  );
}
