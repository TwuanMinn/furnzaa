import { z } from "zod";

/**
 * Shared (non-"use server") metadata + schema for daily attendance. The status
 * set mirrors the attendance_days CHECK constraint + the monthly rollup in
 * migration 0039 (present/remote count as a worked day, half_day = 0.5).
 */

export const ATTENDANCE_STATUSES = [
  "present",
  "remote",
  "half_day",
  "leave_paid",
  "leave_unpaid",
  "absent",
  "holiday",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** label = full name, short = one-glyph cell marker, color = badge token. */
export const ATTENDANCE_STATUS_META: Record<AttendanceStatus, { label: string; short: string; color: string }> = {
  present: { label: "Present", short: "P", color: "green" },
  remote: { label: "Remote", short: "R", color: "indigo" },
  half_day: { label: "Half day", short: "½", color: "violet" },
  leave_paid: { label: "Paid leave", short: "L", color: "blue" },
  leave_unpaid: { label: "Unpaid leave", short: "U", color: "amber" },
  absent: { label: "Absent", short: "A", color: "red" },
  holiday: { label: "Holiday", short: "H", color: "slate" },
};

export function attendanceStatusMeta(status: string) {
  return ATTENDANCE_STATUS_META[status as AttendanceStatus] ?? { label: status, short: "?", color: "slate" };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const attendanceDaySchema = z.object({
  employeeId: z.string().uuid(),
  workDate: z.string().regex(DATE_RE, "Use YYYY-MM-DD"),
  status: z.enum(ATTENDANCE_STATUSES),
  hours: z.coerce.number().min(0).max(24).default(0),
  overtime: z.coerce.number().min(0).max(24).default(0),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
export type AttendanceDayInput = z.infer<typeof attendanceDaySchema>;

// ── /api/payroll/attendance shapes ───────────────────────────────────────────

export interface AttendanceEmployee {
  id: string;
  full_name: string;
  employee_code: string;
  department_name: string | null;
  department_color: string | null;
}

export interface AttendanceDayCell {
  id: string;
  employee_id: string;
  work_date: string;
  status: AttendanceStatus;
  hours_worked: number;
  overtime_hours: number;
  note: string | null;
}

export interface AttendanceRangeData {
  employees: AttendanceEmployee[];
  days: AttendanceDayCell[];
}
