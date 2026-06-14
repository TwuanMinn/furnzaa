"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { asRow, dbInsert, dbUpdate } from "@/lib/supabase/types";
import { requirePermission } from "@/lib/rbac/guards";
import { logActivity } from "@/lib/activity/log";
import { fail, type ActionResult } from "@/lib/actions/result";
import { createTaskSchema, type CreateTaskInput } from "./tasks";

/**
 * Staff-task actions. RLS is the second layer: inserts need tasks.manage;
 * updates are allowed on your OWN row (so a staff member can tick their own
 * task done) or with tasks.manage (an admin completing/editing anyone's).
 */

export type TaskResult<T = undefined> = ActionResult<T>;

/** Assign a new task to a staff member (managerial action). */
export async function createTaskAction(input: CreateTaskInput): Promise<TaskResult<{ id: string }>> {
  try {
    const actor = await requirePermission("tasks.manage");
    const parsed = createTaskSchema.safeParse(input);
    if (!parsed.success)
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("staff_tasks")
      .insert(dbInsert("staff_tasks", {
        assigned_to: v.assignedTo,
        title: v.title,
        priority: v.priority,
        category: v.category,
        due_date: v.dueDate ?? null,
        created_by: actor.id,
        updated_by: actor.id,
      }))
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    const id = (data as { id: string }).id;

    void logActivity({
      actor,
      action: "task.create",
      module: "tasks",
      targetType: "staff_task",
      targetId: id,
      summary: `Assigned task "${v.title}" (${v.category})`,
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Toggle a task's completion. RLS decides WHO can flip a given row (assignee or
 * tasks.manage) — a non-permitted update simply matches 0 rows and reports
 * "not found / not permitted".
 */
export async function toggleTaskAction(id: string, done: boolean): Promise<TaskResult> {
  try {
    const actor = await requirePermission("tasks.view");
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid task" };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("staff_tasks")
      .update(dbUpdate("staff_tasks", {
        done,
        completed_at: done ? new Date().toISOString() : null,
        updated_by: actor.id,
      }))
      .eq("id", id)
      .eq("is_active", true)
      .select("title")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    const row = asRow<{ title: string }>(data);
    if (!row) return { ok: false, error: "Task not found or not permitted" };

    void logActivity({
      actor,
      action: done ? "task.complete" : "task.reopen",
      module: "tasks",
      targetType: "staff_task",
      targetId: id,
      summary: `${done ? "Completed" : "Reopened"} task "${row.title}"`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
