import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { asRow, asRows } from "@/lib/supabase/types";
import { withPermission } from "@/lib/api/with-permission";
import { jsonOk, jsonError } from "@/lib/api/response";
import { maskBankAccount } from "@/lib/payroll/formulas";
import type {
  AttendanceHistoryRow,
  EmployeeDetailData,
  EmployeePayItemRow,
  SalaryStructureHistoryRow,
} from "@/lib/payroll/types";

/**
 * GET /api/payroll/employees/[id] — one employee's full payroll profile:
 * effective-dated salary-structure history, attendance records, and payslip
 * (payroll-item) history. RLS-scoped via the session client; management-only
 * (payroll.view_all). Bank details are masked before they leave the server.
 */
export const GET = withPermission("payroll.view_all", async (_req, ctx) => {
  const params = ctx.params ? await ctx.params : {};
  const id = params.id ?? "";
  if (!z.string().uuid().safeParse(id).success) return jsonError("Invalid employee", 400, "bad_request");

  const supabase = await createClient();

  const { data: empData } = await supabase
    .from("employees")
    .select(
      "id, employee_code, full_name, position, employment_type, status, hire_date, email, phone, bank_account, department:departments!employees_department_id_fkey(name, color)",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const emp = asRow<{
    id: string;
    employee_code: string;
    full_name: string;
    position: string;
    employment_type: string;
    status: string;
    hire_date: string | null;
    email: string | null;
    phone: string | null;
    bank_account: string | null;
    department: { name: string; color: string } | null;
  }>(empData);
  if (!emp) return jsonError("Employee not found", 404, "not_found");

  const [structRes, attRes, itemRes] = await Promise.all([
    supabase
      .from("salary_structures")
      .select(
        "id, effective_from, pay_basis, base_salary_cents, hourly_rate_cents, overtime_rate_cents, standard_working_days, recurring_allowances, recurring_deductions",
      )
      .eq("employee_id", id)
      .order("effective_from", { ascending: false })
      .limit(50),
    supabase
      .from("attendance_records")
      .select(
        "id, period_month, days_worked, hours_worked, overtime_hours, leave_days_paid, leave_days_unpaid, absences",
      )
      .eq("employee_id", id)
      .order("period_month", { ascending: false })
      .limit(24),
    supabase
      .from("payroll_items")
      .select(
        "id, gross_cents, total_deductions_cents, net_cents, status, created_at, run:payroll_runs!payroll_items_payroll_run_id_fkey(period_month, status)",
      )
      .eq("employee_id", id)
      .order("created_at", { ascending: false })
      .limit(24),
  ]);

  const payItems: EmployeePayItemRow[] = asRows<{
    id: string;
    gross_cents: number;
    total_deductions_cents: number;
    net_cents: number;
    status: string;
    run: { period_month: string; status: string } | null;
  }>(itemRes.data)
    .filter((r) => r.run && ["approved", "paid", "closed"].includes(r.run.status))
    .map((r) => ({
      id: r.id,
      period_month: r.run!.period_month,
      run_status: r.run!.status,
      gross_cents: r.gross_cents,
      total_deductions_cents: r.total_deductions_cents,
      net_cents: r.net_cents,
      status: r.status,
    }));

  const data: EmployeeDetailData = {
    employee: {
      id: emp.id,
      employee_code: emp.employee_code,
      full_name: emp.full_name,
      position: emp.position,
      department_name: emp.department?.name ?? null,
      department_color: emp.department?.color ?? null,
      employment_type: emp.employment_type,
      status: emp.status,
      hire_date: emp.hire_date,
      email: emp.email,
      phone: emp.phone,
      bank_masked: emp.bank_account ? maskBankAccount(emp.bank_account) : null,
    },
    salaryStructures: asRows<SalaryStructureHistoryRow>(structRes.data),
    attendance: asRows<AttendanceHistoryRow>(attRes.data),
    payItems,
  };
  return jsonOk(data);
});
