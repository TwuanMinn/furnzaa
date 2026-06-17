import { z } from "zod";

/**
 * Shared (non-"use server") schemas + types for Payroll (Module 16). Money
 * crosses the wire as PLAIN display units (đồng); the server converts to ×100
 * cents before writing.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const money = z.coerce.number().min(0).max(1e13);

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "intern", "hourly"] as const;
export const EMPLOYEE_STATUSES = ["active", "on_leave", "terminated"] as const;

export const employeeSchema = z.object({
  employeeCode: z.string().trim().min(1, "Employee code is required").max(40),
  fullName: z.string().trim().min(1, "Name is required").max(200),
  position: z.string().trim().max(120).optional().default(""),
  departmentId: z.string().uuid().nullable().optional(),
  employmentType: z.string().trim().min(1).max(40).default("full_time"),
  hireDate: z.string().regex(DATE_RE, "Use YYYY-MM-DD").nullable().optional(),
  status: z.enum(EMPLOYEE_STATUSES).default("active"),
  userId: z.string().uuid().nullable().optional(),
  email: z.string().trim().email("Enter a valid email").max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  bankAccount: z.string().trim().max(60).optional().or(z.literal("")),
  bankName: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

const allowanceLine = z.object({
  label: z.string().trim().min(1).max(80),
  amount: money.default(0),
  taxable: z.boolean().default(true),
});
const deductionLine = z.object({
  label: z.string().trim().min(1).max(80),
  amount: money.default(0),
  preTax: z.boolean().default(false),
});

export const salaryStructureSchema = z.object({
  employeeId: z.string().uuid(),
  effectiveFrom: z.string().regex(DATE_RE, "Use YYYY-MM-DD"),
  payBasis: z.enum(["salaried", "hourly"]).default("salaried"),
  baseSalary: money.default(0),
  hourlyRate: money.default(0),
  overtimeRate: money.default(0),
  recurringAllowances: z.array(allowanceLine).max(30).default([]),
  recurringDeductions: z.array(deductionLine).max(30).default([]),
  taxProfileId: z.string().uuid().nullable().optional(),
  employerContributionProfileId: z.string().uuid().nullable().optional(),
  standardWorkingDays: z.coerce.number().int().min(1).max(31).default(22),
});
export type SalaryStructureInput = z.infer<typeof salaryStructureSchema>;

const day = z.coerce.number().min(0).max(31);
export const attendanceSchema = z.object({
  employeeId: z.string().uuid(),
  periodMonth: z.string().regex(DATE_RE, "Use YYYY-MM-DD"),
  daysWorked: day.default(0),
  hoursWorked: z.coerce.number().min(0).max(1000).default(0),
  overtimeHours: z.coerce.number().min(0).max(1000).default(0),
  leaveDaysPaid: day.default(0),
  leaveDaysUnpaid: day.default(0),
  absences: day.default(0),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type AttendanceInput = z.infer<typeof attendanceSchema>;

export const payrollRunSchema = z.object({
  periodMonth: z.string().regex(DATE_RE, "Use YYYY-MM-DD"),
  name: z.string().trim().max(120).optional().default(""),
  runType: z.enum(["regular", "adjustment", "off_cycle"]).default("regular"),
});
export type PayrollRunInput = z.infer<typeof payrollRunSchema>;

// ── DataTable row shapes ─────────────────────────────────────────────────────

export type EmployeeListRow = {
  id: string;
  employee_code: string;
  full_name: string;
  position: string;
  department_id: string | null;
  department_name: string | null;
  department_color: string | null;
  employment_type: string;
  status: string;
  hire_date: string | null;
  created_at: string;
};

export type PayrollRunRow = {
  id: string;
  period_month: string;
  name: string;
  status: string;
  run_type: string;
  headcount: number;
  total_gross_cents: number;
  total_net_cents: number;
  total_employer_cost_cents: number;
  created_at: string;
};

export type PayrollItemRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department_name: string | null;
  period_month: string;
  run_status: string;
  gross_cents: number;
  total_deductions_cents: number;
  total_tax_cents: number;
  net_cents: number;
  employer_cost_cents: number;
  overtime_pay_cents: number;
  status: string;
};

export type PayslipRow = {
  id: string;
  employee_id: string;
  employee_name: string;
  period_month: string;
  status: string;
  generated_at: string;
  pdf_storage_path: string | null;
};

// ── Salary-cost analytics shapes (/api/payroll) ──────────────────────────────

export interface PayrollKpis {
  headcount: number;
  totalEmployerCostCents: number;
  totalNetCents: number;
  totalDeductionsCents: number;
  totalTaxCents: number;
  avgNetCents: number;
  totalOvertimeCents: number;
}

export interface PayrollSeriesPoint {
  month: string;
  employerCostCents: number;
  netCents: number;
  overtimeCents: number;
}

export interface PayrollDeptBreakdown {
  id: string | null;
  name: string;
  color: string;
  headcount: number;
  employerCostCents: number;
  netCents: number;
}

export interface PayrollData {
  kpis: PayrollKpis;
  prev: { employerCostCents: number; netCents: number } | null;
  series: PayrollSeriesPoint[];
  byDepartment: PayrollDeptBreakdown[];
  topEarners: { name: string; netCents: number }[];
}

// ── Employee detail (salary history + attendance + payslip history) ──────────

export interface SalaryStructureHistoryRow {
  id: string;
  effective_from: string;
  pay_basis: string;
  base_salary_cents: number;
  hourly_rate_cents: number;
  overtime_rate_cents: number;
  standard_working_days: number;
  recurring_allowances: { label: string; amount_cents: number; taxable: boolean }[];
  recurring_deductions: { label: string; amount_cents: number; pre_tax: boolean }[];
}

export interface AttendanceHistoryRow {
  id: string;
  period_month: string;
  days_worked: number;
  hours_worked: number;
  overtime_hours: number;
  leave_days_paid: number;
  leave_days_unpaid: number;
  absences: number;
}

export interface AttendanceDayHistoryRow {
  id: string;
  work_date: string;
  status: string;
  hours_worked: number;
  overtime_hours: number;
  note: string | null;
}

export interface EmployeePayItemRow {
  id: string;
  period_month: string;
  run_status: string;
  gross_cents: number;
  total_deductions_cents: number;
  net_cents: number;
  status: string;
}

export interface EmployeeDetailData {
  employee: {
    id: string;
    employee_code: string;
    full_name: string;
    position: string;
    department_name: string | null;
    department_color: string | null;
    employment_type: string;
    status: string;
    hire_date: string | null;
    email: string | null;
    phone: string | null;
    bank_masked: string | null;
  };
  salaryStructures: SalaryStructureHistoryRow[];
  attendance: AttendanceHistoryRow[];
  attendanceDays: AttendanceDayHistoryRow[];
  payItems: EmployeePayItemRow[];
}
