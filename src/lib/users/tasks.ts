/**
 * Staff task model + the canonical priority/category definitions for the Tasks
 * tab on the user detail sheet.
 *
 * Backed by the `staff_tasks` table (migration 0032). Priority colours and the
 * category set are the single source of truth here, so the Performance tab
 * (which rolls up task completion) and the Tasks tab read consistently.
 */

import { z } from "zod";

export type TaskPriority = "high" | "medium" | "low";

export const TASK_CATEGORIES = [
  "Packing",
  "Inventory",
  "Returns",
  "Compliance",
  "Logistics",
  "Admin",
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export type TaskFilter = "all" | "open" | "done" | "overdue";

export interface StaffTask {
  id: string;
  title: string;
  done: boolean;
  priority: TaskPriority;
  category: TaskCategory;
  /** Local calendar day, YYYY-MM-DD, or null when no due date is set. */
  dueDate: string | null;
}

/**
 * Priority → filled dot colour. Same red / amber / emerald family the
 * Performance tab uses for its bad / warn / good metric tones (high = red,
 * medium = amber, low = green).
 */
export const TASK_PRIORITY_META: Record<TaskPriority, { label: string; dotClass: string }> = {
  high: { label: "High priority", dotClass: "bg-red-500" },
  medium: { label: "Medium priority", dotClass: "bg-amber-500" },
  low: { label: "Low priority", dotClass: "bg-emerald-500" },
};

/** Ordered priority options for the assign form. */
export const TASK_PRIORITIES: { key: TaskPriority; label: string }[] = [
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
];

/**
 * YYYY-MM-DD from LOCAL date parts — never `toISOString()`, which shifts a day
 * back in positive-UTC zones (the recurring Furnza timezone footgun).
 */
export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Add N calendar days to a YYYY-MM-DD key, staying in local time. */
export function addLocalDays(dayKey: string, offset: number): string {
  const parts = dayKey.split("-");
  const base = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  base.setDate(base.getDate() + offset);
  return toLocalDateKey(base);
}

/** A task is overdue only if it's still open AND has a due day before today. */
export function isTaskOverdue(task: StaffTask, today: string): boolean {
  return !task.done && task.dueDate != null && task.dueDate < today;
}

/** Map a raw `staff_tasks` row to the client shape. CHECK constraints in the
 *  migration guarantee priority/category are in range, so the casts are safe. */
export function rowToStaffTask(row: {
  id: string;
  title: string;
  done: boolean;
  priority: string;
  category: string;
  due_date: string | null;
}): StaffTask {
  return {
    id: row.id,
    title: row.title,
    done: row.done,
    priority: row.priority as TaskPriority,
    category: row.category as TaskCategory,
    dueDate: row.due_date,
  };
}

/** Validated payload for assigning a new task (server action input). */
export const createTaskSchema = z.object({
  assignedTo: z.string().uuid(),
  title: z.string().trim().min(1, "Title is required").max(200),
  priority: z.enum(["high", "medium", "low"]),
  category: z.enum(["Packing", "Inventory", "Returns", "Compliance", "Logistics", "Admin"]),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
    .nullable()
    .optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
