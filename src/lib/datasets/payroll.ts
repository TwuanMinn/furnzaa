import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { asRows } from "@/lib/supabase/types";
import type { PayrollData, PayrollDeptBreakdown, PayrollKpis, PayrollSeriesPoint } from "@/lib/payroll/types";

/**
 * Salary-cost analytics (Module 16). Everything comes from
 * payroll_monthly_rollup (frozen at Approve) — never a live scan over
 * payroll_items. Read via the service role AFTER the payroll.analytics_view gate
 * in the route. Top earners reads only the latest period's items (bounded).
 */

type CompanyRow = {
  period_month: string;
  headcount: number;
  total_employer_cost_cents: number;
  total_net_cents: number;
  total_deductions_cents: number;
  total_tax_cents: number;
  total_overtime_cost_cents: number;
  avg_net_cents: number;
};

const ZERO_KPIS: PayrollKpis = {
  headcount: 0,
  totalEmployerCostCents: 0,
  totalNetCents: 0,
  totalDeductionsCents: 0,
  totalTaxCents: 0,
  avgNetCents: 0,
  totalOvertimeCents: 0,
};

export async function readPayrollData(): Promise<PayrollData> {
  const admin = createAdminClient();

  const { data: companyData } = await admin
    .from("payroll_monthly_rollup")
    .select(
      "period_month, headcount, total_employer_cost_cents, total_net_cents, total_deductions_cents, total_tax_cents, total_overtime_cost_cents, avg_net_cents",
    )
    .is("department_id", null)
    .order("period_month", { ascending: true })
    .limit(60);
  const company = asRows<CompanyRow>(companyData);

  const series: PayrollSeriesPoint[] = company.map((r) => ({
    month: r.period_month,
    employerCostCents: r.total_employer_cost_cents,
    netCents: r.total_net_cents,
    overtimeCents: r.total_overtime_cost_cents,
  }));

  const latest = company[company.length - 1] ?? null;
  const prevRow = company.length >= 2 ? company[company.length - 2]! : null;
  const kpis: PayrollKpis = latest
    ? {
        headcount: latest.headcount,
        totalEmployerCostCents: latest.total_employer_cost_cents,
        totalNetCents: latest.total_net_cents,
        totalDeductionsCents: latest.total_deductions_cents,
        totalTaxCents: latest.total_tax_cents,
        avgNetCents: latest.avg_net_cents,
        totalOvertimeCents: latest.total_overtime_cost_cents,
      }
    : ZERO_KPIS;
  const prev = prevRow
    ? { employerCostCents: prevRow.total_employer_cost_cents, netCents: prevRow.total_net_cents }
    : null;

  let byDepartment: PayrollDeptBreakdown[] = [];
  let topEarners: { name: string; netCents: number }[] = [];

  if (latest) {
    const { data: deptData } = await admin
      .from("payroll_monthly_rollup")
      .select(
        "department_id, headcount, total_employer_cost_cents, total_net_cents, department:departments!payroll_monthly_rollup_department_id_fkey(name, color)",
      )
      .eq("period_month", latest.period_month)
      .not("department_id", "is", null);
    byDepartment = asRows<{
      department_id: string | null;
      headcount: number;
      total_employer_cost_cents: number;
      total_net_cents: number;
      department: { name: string; color: string } | null;
    }>(deptData)
      .map((d) => ({
        id: d.department_id,
        name: d.department?.name ?? "Unassigned",
        color: d.department?.color ?? "slate",
        headcount: d.headcount,
        employerCostCents: d.total_employer_cost_cents,
        netCents: d.total_net_cents,
      }))
      .sort((a, b) => b.employerCostCents - a.employerCostCents);

    const { data: runData } = await admin
      .from("payroll_runs")
      .select("id")
      .eq("period_month", latest.period_month)
      .in("status", ["approved", "paid", "closed"]);
    const runIds = asRows<{ id: string }>(runData).map((r) => r.id);
    if (runIds.length > 0) {
      const { data: itemData } = await admin
        .from("payroll_items")
        .select("net_cents, employee:employees!payroll_items_employee_id_fkey(full_name)")
        .in("payroll_run_id", runIds)
        .order("net_cents", { ascending: false })
        .limit(10);
      topEarners = asRows<{ net_cents: number; employee: { full_name: string } | null }>(itemData).map((i) => ({
        name: i.employee?.full_name ?? "—",
        netCents: i.net_cents,
      }));
    }
  }

  return { kpis, prev, series, byDepartment, topEarners };
}
