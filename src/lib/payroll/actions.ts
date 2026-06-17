"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, dbInsert, dbUpdate, rpcParams } from "@/lib/supabase/types";
import { requirePermission } from "@/lib/rbac/guards";
import { fail, type ActionResult } from "@/lib/actions/result";
import { logActivity } from "@/lib/activity/log";
import { maskBankAccount } from "./formulas";
import {
  attendanceSchema,
  employeeSchema,
  payrollRunSchema,
  salaryStructureSchema,
  type AttendanceInput,
  type EmployeeInput,
  type PayrollRunInput,
  type SalaryStructureInput,
} from "./types";

/**
 * Payroll server actions (Module 16). requirePermission → zod → write/RPC →
 * logActivity. The most access-sensitive module: bank details are MASKED before
 * they reach the activity log, run lifecycle transitions are elevated severity,
 * and approved runs are immutable (the DB trigger enforces it).
 */

const firstErr = (e: z.ZodError) => e.issues[0]?.message ?? "Invalid input";
const toCents = (n: number) => Math.round(n * 100);
const firstOfMonth = (d: string) => `${d.slice(0, 7)}-01`;

// ── Employees ──────────────────────────────────────────────────────────────

export async function createEmployeeAction(input: EmployeeInput): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requirePermission("payroll.manage");
    const parsed = employeeSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstErr(parsed.error) };
    const v = parsed.data;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employees")
      .insert(
        dbInsert("employees", {
          employee_code: v.employeeCode,
          full_name: v.fullName,
          position: v.position ?? "",
          department_id: v.departmentId ?? null,
          employment_type: v.employmentType,
          hire_date: v.hireDate || null,
          status: v.status,
          user_id: v.userId ?? null,
          email: v.email || null,
          phone: v.phone || null,
          bank_account: v.bankAccount || null,
          bank_name: v.bankName || null,
          notes: v.notes || null,
          created_by: actor.id,
        }),
      )
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, error: error?.code === "23505" ? "That employee code already exists." : (error?.message ?? "Failed to create employee") };
    }
    const id = (data as { id: string }).id;

    void logActivity({
      actor,
      action: "payroll.employee_create",
      module: "payroll",
      targetType: "employee",
      targetId: id,
      summary: `Created employee ${v.fullName} (${v.employeeCode})`,
      after: { employee_code: v.employeeCode, full_name: v.fullName, bank_account: maskBankAccount(v.bankAccount) },
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateEmployeeAction(id: string, input: EmployeeInput): Promise<ActionResult> {
  try {
    const actor = await requirePermission("payroll.manage");
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid employee" };
    const parsed = employeeSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstErr(parsed.error) };
    const v = parsed.data;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("employees")
      .update(
        dbUpdate("employees", {
          employee_code: v.employeeCode,
          full_name: v.fullName,
          position: v.position ?? "",
          department_id: v.departmentId ?? null,
          employment_type: v.employmentType,
          hire_date: v.hireDate || null,
          status: v.status,
          user_id: v.userId ?? null,
          email: v.email || null,
          phone: v.phone || null,
          bank_account: v.bankAccount || null,
          bank_name: v.bankName || null,
          notes: v.notes || null,
          updated_by: actor.id,
        }),
      )
      .eq("id", id)
      .is("deleted_at", null)
      .select("id");
    if (error) return { ok: false, error: error.code === "23505" ? "That employee code already exists." : error.message };
    if (!data || (data as unknown[]).length === 0) return { ok: false, error: "Employee not found" };

    void logActivity({
      actor,
      action: "payroll.employee_edit",
      module: "payroll",
      targetType: "employee",
      targetId: id,
      summary: `Edited employee ${v.fullName} (${v.employeeCode})`,
      after: { full_name: v.fullName, status: v.status, bank_account: maskBankAccount(v.bankAccount) },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteEmployeeAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("payroll.manage");
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid employee" };

    const supabase = await createClient();
    const { data: beforeData } = await supabase
      .from("employees")
      .select("full_name, employee_code")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    const before = asRow<{ full_name: string; employee_code: string }>(beforeData);
    if (!before) return { ok: false, error: "Employee not found" };

    const { error } = await supabase
      .from("employees")
      .update(dbUpdate("employees", { is_active: false, deleted_at: new Date().toISOString(), updated_by: actor.id }))
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "payroll.employee_delete",
      module: "payroll",
      targetType: "employee",
      targetId: id,
      summary: `Removed employee ${before.full_name} (${before.employee_code})`,
      severity: "warning",
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Salary structures (effective-dated; always a new row) ────────────────────

export async function addSalaryStructureAction(input: SalaryStructureInput): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requirePermission("payroll.manage");
    const parsed = salaryStructureSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstErr(parsed.error) };
    const v = parsed.data;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("salary_structures")
      .insert(
        dbInsert("salary_structures", {
          employee_id: v.employeeId,
          effective_from: v.effectiveFrom,
          pay_basis: v.payBasis,
          base_salary_cents: toCents(v.baseSalary),
          hourly_rate_cents: toCents(v.hourlyRate),
          overtime_rate_cents: toCents(v.overtimeRate),
          recurring_allowances: v.recurringAllowances.map((a) => ({ label: a.label, amount_cents: toCents(a.amount), taxable: a.taxable })),
          recurring_deductions: v.recurringDeductions.map((d) => ({ label: d.label, amount_cents: toCents(d.amount), pre_tax: d.preTax })),
          tax_profile_id: v.taxProfileId ?? null,
          employer_contribution_profile_id: v.employerContributionProfileId ?? null,
          standard_working_days: v.standardWorkingDays,
          created_by: actor.id,
        }),
      )
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Failed to save salary structure" };
    const id = (data as { id: string }).id;

    void logActivity({
      actor,
      action: "payroll.salary_change",
      module: "payroll",
      targetType: "employee",
      targetId: v.employeeId,
      summary: `New salary structure effective ${v.effectiveFrom} (${v.payBasis})`,
      severity: "warning",
      after: { effective_from: v.effectiveFrom, pay_basis: v.payBasis, base_salary_cents: toCents(v.baseSalary) },
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

// ── Attendance (one row per employee per period) ─────────────────────────────

export async function saveAttendanceAction(input: AttendanceInput): Promise<ActionResult> {
  try {
    const actor = await requirePermission("attendance.manage");
    const parsed = attendanceSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstErr(parsed.error) };
    const v = parsed.data;
    const month = firstOfMonth(v.periodMonth);

    const supabase = await createClient();
    const { error } = await supabase.from("attendance_records").upsert(
      dbInsert("attendance_records", {
        employee_id: v.employeeId,
        period_month: month,
        days_worked: v.daysWorked,
        hours_worked: v.hoursWorked,
        overtime_hours: v.overtimeHours,
        leave_days_paid: v.leaveDaysPaid,
        leave_days_unpaid: v.leaveDaysUnpaid,
        absences: v.absences,
        notes: v.notes || null,
        created_by: actor.id,
      }),
      { onConflict: "employee_id,period_month" },
    );
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "payroll.attendance_save",
      module: "payroll",
      targetType: "employee",
      targetId: v.employeeId,
      summary: `Recorded attendance for ${month}`,
      after: { period_month: month, days_worked: v.daysWorked, overtime_hours: v.overtimeHours },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Payroll run lifecycle (separation of duties) ─────────────────────────────

export async function createPayrollRunAction(input: PayrollRunInput): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requirePermission("payroll.manage");
    const parsed = payrollRunSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstErr(parsed.error) };
    const v = parsed.data;
    const month = firstOfMonth(v.periodMonth);
    const name =
      v.name?.trim() ||
      `${v.runType === "regular" ? "Payroll" : v.runType === "adjustment" ? "Adjustment" : "Off-cycle"} ${new Date(`${month}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("payroll_runs")
      .insert(dbInsert("payroll_runs", { period_month: month, name, run_type: v.runType, created_by: actor.id }))
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Failed to create run" };
    const id = (data as { id: string }).id;

    void logActivity({
      actor,
      action: "payroll.run_create",
      module: "payroll",
      targetType: "payroll_run",
      targetId: id,
      summary: `Created ${v.runType} payroll run “${name}”`,
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function calculatePayrollRunAction(runId: string): Promise<ActionResult<{ count: number }>> {
  try {
    const actor = await requirePermission("payroll.run");
    if (!z.string().uuid().safeParse(runId).success) return { ok: false, error: "Invalid run" };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("calculate_payroll_run", rpcParams("calculate_payroll_run", { p_run_id: runId }));
    if (error) return { ok: false, error: error.message };
    const count = Number(data ?? 0);

    void logActivity({
      actor,
      action: "payroll.run_calculate",
      module: "payroll",
      targetType: "payroll_run",
      targetId: runId,
      summary: `Calculated payroll run (${count} employees)`,
      severity: "warning",
    });
    return { ok: true, data: { count } };
  } catch (e) {
    return fail(e);
  }
}

export async function approvePayrollRunAction(runId: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("payroll.approve");
    if (!z.string().uuid().safeParse(runId).success) return { ok: false, error: "Invalid run" };

    const supabase = await createClient();
    const { error } = await supabase.rpc("approve_payroll_run", rpcParams("approve_payroll_run", { p_run_id: runId }));
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "payroll.run_approve",
      module: "payroll",
      targetType: "payroll_run",
      targetId: runId,
      summary: "Approved payroll run (items frozen)",
      severity: "critical",
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Transitions past Approve use the service-role client (RLS update is scoped to
 *  draft/calculated only); the action enforces the permission + status guard. */
async function transitionRun(
  runId: string,
  from: string,
  patch: Record<string, unknown>,
  action: string,
  summary: string,
): Promise<ActionResult> {
  const admin = createAdminClient();
  const { data: cur } = await admin.from("payroll_runs").select("status").eq("id", runId).maybeSingle();
  const row = asRow<{ status: string }>(cur);
  if (!row) return { ok: false, error: "Run not found" };
  if (row.status !== from) return { ok: false, error: `Run must be ${from} (it is ${row.status})` };
  const { error } = await admin.from("payroll_runs").update(dbUpdate("payroll_runs", patch)).eq("id", runId);
  if (error) return { ok: false, error: error.message };
  void logActivity({ actor: null, action, module: "payroll", targetType: "payroll_run", targetId: runId, summary, severity: "critical" });
  return { ok: true };
}

export async function payPayrollRunAction(runId: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("payroll.pay");
    if (!z.string().uuid().safeParse(runId).success) return { ok: false, error: "Invalid run" };
    const res = await transitionRun(
      runId,
      "approved",
      { status: "paid", paid_at: new Date().toISOString(), paid_by: actor.id },
      "payroll.run_pay",
      "Marked payroll run paid",
    );
    return res;
  } catch (e) {
    return fail(e);
  }
}

export async function closePayrollRunAction(runId: string): Promise<ActionResult> {
  try {
    await requirePermission("payroll.manage");
    if (!z.string().uuid().safeParse(runId).success) return { ok: false, error: "Invalid run" };
    return await transitionRun(
      runId,
      "paid",
      { status: "closed", closed_at: new Date().toISOString() },
      "payroll.run_close",
      "Closed payroll run",
    );
  } catch (e) {
    return fail(e);
  }
}
