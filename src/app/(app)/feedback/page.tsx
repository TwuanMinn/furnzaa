import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRows } from "@/lib/supabase/types";
import { getOrgSettings } from "@/lib/settings/config";
import { PageHeader } from "@/components/states";
import { FeedbackClient } from "./feedback-client";

export const metadata = { title: "Customer Feedback" };

/**
 * Customer Feedback (spec v6, Module 8): structured report → assign → resolve
 * workflow with photos, internal discussion and pre-aggregated analytics.
 * Staff see records they submitted or are assigned (RLS); feedback.view_all
 * sees everything.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const [user, sp] = await Promise.all([getSessionUser(), searchParams]);
  if (!user) redirect("/login");
  if (!user.permissions.has("feedback.create")) redirect("/dashboard");

  // Assignment targets: every active user (admins included) — admin client so
  // staff submitters can hand records to anyone, mirroring assignFeedbackAction.
  const [settings, usersRes] = await Promise.all([
    getOrgSettings(),
    createAdminClient()
      .from("users")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name")
      .limit(200),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <PageHeader
        title="Customer Feedback"
        description="Log what customers tell you, assign it, resolve it with a note — and watch the trends."
      />
      <FeedbackClient
        config={{
          categories: settings.feedback.categories,
          channels: settings.feedback.channels,
          severities: settings.feedback.severities,
        }}
        currency={settings.currency}
        users={asRows<{ id: string; full_name: string }>(usersRes.data)}
        me={{
          id: user.id,
          canAssign: user.permissions.has("feedback.assign"),
          canResolve: user.permissions.has("feedback.resolve"),
          canViewAll: user.permissions.has("feedback.view_all"),
          canAnalytics: user.permissions.has("feedback.analytics_view"),
        }}
        initialOpen={sp.open ?? null}
      />
    </div>
  );
}
