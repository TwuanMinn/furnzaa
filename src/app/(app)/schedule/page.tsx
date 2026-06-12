import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { getOrderConfig } from "@/lib/orders/config";
import { PageHeader } from "@/components/states";
import { ScheduleClient } from "./schedule-client";

export const metadata = { title: "Production Schedule" };

/**
 * Production Schedule (spec v6, Module 3): a live kanban/timeline over
 * print_schedule, which the sync trigger derives from the orders print state —
 * one source of truth. Staff see their own jobs (toggle to view all,
 * read-only); schedule.manage (Admin) drives everything.
 */
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("schedule.view")) redirect("/dashboard");

  const config = await getOrderConfig();

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <PageHeader
        title="Production Schedule"
        description="Live print queue per printer — drag cards to start, complete or reorder jobs."
      />
      <ScheduleClient
        userId={user.id}
        canManage={user.permissions.has("schedule.manage")}
        priorities={config.priorities.map((p) => ({ key: p.key, label: p.label }))}
        materials={config.materials.map((m) => ({ key: m.key, label: m.label }))}
      />
    </div>
  );
}
