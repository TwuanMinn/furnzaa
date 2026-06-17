import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import { withPermission } from "@/lib/api/with-permission";
import { jsonOk, jsonError } from "@/lib/api/response";
import type { AttendanceDayCell, AttendanceEmployee, AttendanceRangeData, AttendanceStatus } from "@/lib/payroll/attendance";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/payroll/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD — the active
 * employee roster plus every daily attendance row in the range. RLS-scoped via
 * the session client (payroll.view_all sees all). Management view → payroll.view_all.
 */
export const GET = withPermission("payroll.view_all", async (req) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return jsonError("from/to must be YYYY-MM-DD", 400, "bad_request");

  const supabase = await createClient();

  const [empRes, dayRes] = await Promise.all([
    supabase
      .from("employees")
      .select("id, full_name, employee_code, department:departments!employees_department_id_fkey(name, color)")
      .is("deleted_at", null)
      .neq("status", "terminated")
      .order("full_name")
      .limit(500),
    supabase
      .from("attendance_days")
      .select("id, employee_id, work_date, status, hours_worked, overtime_hours, note")
      .gte("work_date", from)
      .lte("work_date", to)
      .limit(20000),
  ]);

  const employees: AttendanceEmployee[] = asRows<{
    id: string;
    full_name: string;
    employee_code: string;
    department: { name: string; color: string } | null;
  }>(empRes.data).map((e) => ({
    id: e.id,
    full_name: e.full_name,
    employee_code: e.employee_code,
    department_name: e.department?.name ?? null,
    department_color: e.department?.color ?? null,
  }));

  const days = asRows<{
    id: string;
    employee_id: string;
    work_date: string;
    status: string;
    hours_worked: number;
    overtime_hours: number;
    note: string | null;
  }>(dayRes.data).map((d): AttendanceDayCell => ({
    id: d.id,
    employee_id: d.employee_id,
    work_date: d.work_date,
    status: d.status as AttendanceStatus,
    hours_worked: Number(d.hours_worked),
    overtime_hours: Number(d.overtime_hours),
    note: d.note,
  }));

  const data: AttendanceRangeData = { employees, days };
  return jsonOk(data);
});
