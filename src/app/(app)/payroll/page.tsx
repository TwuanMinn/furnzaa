import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import { getOrgBranding } from "@/lib/export/branding";
import { PageHeader } from "@/components/states";
import { PayrollClient } from "./payroll-client";
import { MyPayslips } from "./my-payslips";

export const metadata = { title: "Payroll" };

type Ref = { id: string; name: string; color: string };

/**
 * Module 16 — Payroll. Admin (payroll.view_all) gets the full module; staff
 * (payroll.view_own only) get the self-service "My Payslips" view. The page
 * resolves which surface to render server-side; RLS enforces the rest.
 */
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const canViewAll = user.permissions.has("payroll.view_all");
  const canViewOwn = user.permissions.has("payroll.view_own");
  if (!canViewAll && !canViewOwn) redirect("/dashboard");

  const branding = await getOrgBranding();

  if (!canViewAll) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <PageHeader title="My Payslips" description="Your pay history and payslips." />
        <MyPayslips currency={branding.currency} />
      </div>
    );
  }

  const supabase = await createClient();
  const [deptRes, taxRes, empRes] = await Promise.all([
    supabase.from("departments").select("id, name, color").is("deleted_at", null).order("sort_order").order("name"),
    supabase.from("tax_profiles").select("id, name").is("deleted_at", null).order("name"),
    supabase.from("employer_contribution_profiles").select("id, name").is("deleted_at", null).order("name"),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <PageHeader title="Payroll" description="Employees, payroll runs, payslips and salary-cost analytics." />
      <PayrollClient
        currency={branding.currency}
        departments={asRows<Ref>(deptRes.data)}
        taxProfiles={asRows<{ id: string; name: string }>(taxRes.data)}
        employerProfiles={asRows<{ id: string; name: string }>(empRes.data)}
        canManage={user.permissions.has("payroll.manage")}
        canRun={user.permissions.has("payroll.run")}
        canApprove={user.permissions.has("payroll.approve")}
        canPay={user.permissions.has("payroll.pay")}
        canGenerate={user.permissions.has("payslip.generate")}
        canAttendance={user.permissions.has("attendance.manage")}
        canAnalytics={user.permissions.has("payroll.analytics_view")}
      />
    </div>
  );
}
