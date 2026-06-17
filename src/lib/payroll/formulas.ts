/**
 * Pure Payroll helpers shared by client + server: status/type badge metadata,
 * the run-lifecycle transition map, and sensitive-field masking for the
 * activity log. No money math here — that lives in calculate_payroll_run (SQL).
 */

export type Tone = "ok" | "low" | "loss" | "muted";

/** Run lifecycle badge colors (badgeClass tokens). */
export const RUN_STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "slate" },
  calculated: { label: "Calculated", color: "blue" },
  approved: { label: "Approved", color: "indigo" },
  paid: { label: "Paid", color: "green" },
  closed: { label: "Closed", color: "slate" },
};
export function runStatusMeta(status: string): { label: string; color: string } {
  return RUN_STATUS_META[status] ?? { label: status, color: "slate" };
}

export const EMPLOYMENT_TYPE_META: Record<string, { label: string; color: string }> = {
  full_time: { label: "Full-time", color: "green" },
  part_time: { label: "Part-time", color: "blue" },
  contract: { label: "Contract", color: "amber" },
  intern: { label: "Intern", color: "violet" },
  hourly: { label: "Hourly", color: "indigo" },
};
export function employmentTypeMeta(type: string): { label: string; color: string } {
  return EMPLOYMENT_TYPE_META[type] ?? { label: type, color: "slate" };
}

export const EMPLOYEE_STATUS_META: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "green" },
  on_leave: { label: "On leave", color: "amber" },
  terminated: { label: "Terminated", color: "red" },
};
export function employeeStatusMeta(status: string): { label: string; color: string } {
  return EMPLOYEE_STATUS_META[status] ?? { label: status, color: "slate" };
}

export type RunAction = "calculate" | "approve" | "pay" | "close";

/** The primary next lifecycle action for a run status (null = terminal). */
export function nextRunAction(status: string): { action: RunAction; label: string } | null {
  switch (status) {
    case "draft":
      return { action: "calculate", label: "Calculate" };
    case "calculated":
      return { action: "approve", label: "Approve" };
    case "approved":
      return { action: "pay", label: "Mark paid" };
    case "paid":
      return { action: "close", label: "Close" };
    default:
      return null;
  }
}

/** Mask a bank account number for logs/display — keep only the last 4. */
export function maskBankAccount(value: string | null | undefined): string {
  if (!value) return "";
  const s = String(value).replace(/\s+/g, "");
  if (s.length <= 4) return "••••";
  return `••••${s.slice(-4)}`;
}
