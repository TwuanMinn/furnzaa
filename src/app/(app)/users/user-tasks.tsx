"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { formatDate } from "@/lib/format";
import { usePermissions } from "@/lib/rbac/context";
import { createTaskAction, toggleTaskAction } from "@/lib/users/task-actions";
import {
  addLocalDays,
  isTaskOverdue,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_PRIORITY_META,
  toLocalDateKey,
  type StaffTask,
  type TaskCategory,
  type TaskFilter,
  type TaskPriority,
} from "@/lib/users/tasks";

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "done", label: "Done" },
  { key: "overdue", label: "Overdue" },
];

/**
 * Tasks tab on the user detail sheet — backed by the staff_tasks table.
 * Completion toggles are optimistic; assigning is gated on tasks.manage and
 * persists via a server action. The summary recomputes live from the list.
 */
export function UserTasksPanel({ userId }: { userId: string }) {
  const reduce = useReducedMotion();
  const queryClient = useQueryClient();
  const canManage = usePermissions().has("tasks.manage");
  const queryKey = ["user-tasks", userId];

  // "Today" snapshot at mount — overdue labels are relative to this. The sheet
  // is a transient slide-over, so a midnight rollover while it's open isn't
  // worth a ticking clock.
  const [today] = useState(() => toLocalDateKey(new Date()));
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [adding, setAdding] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey,
    staleTime: 30_000,
    queryFn: async (): Promise<StaffTask[]> => {
      const res = await fetch(`/api/users/${userId}/tasks`);
      const body = (await res.json()) as {
        ok: boolean;
        data?: { tasks: StaffTask[] };
        error?: string;
      };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Failed to load tasks");
      return body.data.tasks;
    },
  });

  const tasks = query.data ?? [];

  async function toggle(task: StaffTask) {
    if (pendingIds.has(task.id)) return; // ignore re-clicks while this row is in flight
    const next = !task.done;
    const patch = (value: boolean) =>
      queryClient.setQueryData<StaffTask[]>(queryKey, (old) =>
        (old ?? []).map((t) => (t.id === task.id ? { ...t, done: value } : t)),
      );
    setPendingIds((prev) => new Set(prev).add(task.id));
    patch(next); // optimistic
    const res = await toggleTaskAction(task.id, next);
    if (!res.ok) {
      patch(!next); // rollback
      toast.error(res.error);
    } else {
      void queryClient.invalidateQueries({ queryKey });
    }
    setPendingIds((prev) => {
      const n = new Set(prev);
      n.delete(task.id);
      return n;
    });
  }

  const total = tasks.length;
  const completed = tasks.filter((t) => t.done).length;
  const overdueCount = tasks.filter((t) => isTaskOverdue(t, today)).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const counts: Record<TaskFilter, number> = {
    all: total,
    open: total - completed,
    done: completed,
    overdue: overdueCount,
  };

  const visible = tasks.filter((t) => {
    if (filter === "open") return !t.done;
    if (filter === "done") return t.done;
    if (filter === "overdue") return isTaskOverdue(t, today);
    return true;
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-16 rounded-lg" />
        </div>
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Couldn't load tasks"
        description={query.error instanceof Error ? query.error.message : undefined}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary — recomputes live as tasks toggle. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border p-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Tasks assigned
          </p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">{total}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Completed
          </p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums">
            {completed}
            <span className="ml-1 text-sm font-normal text-muted-foreground">· {pct}%</span>
          </p>
        </div>
      </div>

      {/* Filter chips. */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter tasks">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === f.key
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
            <span className={cn("tabular-nums", filter === f.key ? "opacity-80" : "opacity-60")}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Scrollable task list. */}
      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          {filter === "overdue"
            ? "Nothing overdue — nice."
            : filter === "done"
              ? "No completed tasks yet."
              : filter === "open"
                ? "All tasks are done — nothing open."
                : "No tasks assigned yet."}
        </p>
      ) : (
        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {visible.map((t, i) => {
              const overdue = isTaskOverdue(t, today);
              const priority = TASK_PRIORITY_META[t.priority];
              return (
                <motion.div
                  key={t.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 0.18,
                    delay: reduce ? 0 : Math.min(i * 0.03, 0.2),
                    ease: "easeOut",
                  }}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border border-border p-3 transition-opacity",
                    t.done && "opacity-60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void toggle(t)}
                    disabled={pendingIds.has(t.id)}
                    aria-pressed={t.done}
                    aria-label={t.done ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`}
                    className={cn(
                      "mt-px flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                      t.done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-muted-foreground/40 hover:border-foreground",
                    )}
                  >
                    {t.done ? <Check className="size-3.5" aria-hidden /> : null}
                  </button>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm leading-snug",
                      t.done && "text-muted-foreground line-through",
                    )}
                  >
                    {t.title}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                    <span className="inline-flex items-center" title={priority.label}>
                      <span className={cn("size-1.5 rounded-full", priority.dotClass)} aria-hidden />
                      <span className="sr-only">{priority.label}</span>
                    </span>
                    <span
                      className={cn(
                        "text-muted-foreground",
                        overdue && "font-medium text-red-600 dark:text-red-400",
                      )}
                    >
                      {t.dueDate
                        ? `${overdue ? "Overdue · " : "Due "}${formatDate(t.dueDate)}`
                        : "No due date"}
                    </span>
                    <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {t.category}
                    </span>
                  </div>
                </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Assign (managers only). */}
      {canManage ? (
        adding ? (
          <AssignTaskForm
            today={today}
            onCancel={() => setAdding(false)}
            onCreate={async (input) => {
              const res = await createTaskAction({ assignedTo: userId, ...input });
              if (res.ok) {
                toast.success("Task assigned");
                setAdding(false);
                setFilter("all");
                void queryClient.invalidateQueries({ queryKey });
              } else {
                toast.error(res.error);
              }
              return res.ok;
            }}
          />
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setAdding(true)}>
            <Plus aria-hidden /> Assign task
          </Button>
        )
      ) : null}
    </div>
  );
}

/** Compact inline composer for assigning a task. */
function AssignTaskForm({
  today,
  onCreate,
  onCancel,
}: {
  today: string;
  onCreate: (input: {
    title: string;
    priority: TaskPriority;
    category: TaskCategory;
    dueDate: string | null;
  }) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [category, setCategory] = useState<TaskCategory>("Admin");
  const [dueDate, setDueDate] = useState(() => addLocalDays(today, 3));
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    await onCreate({ title: title.trim(), priority, category, dueDate: dueDate || null });
    setSaving(false);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="space-y-1.5">
        <Label htmlFor="task-title">New task</Label>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="e.g. Pack rush order"
          maxLength={200}
          autoFocus
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="task-priority">Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
            <SelectTrigger id="task-priority" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITIES.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-category">Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
            <SelectTrigger id="task-category" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="task-due">Due date</Label>
        <Input
          id="task-due"
          type="date"
          min={today}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => void submit()} disabled={saving || !title.trim()}>
          {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
          Assign task
        </Button>
        <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Cancel" disabled={saving}>
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
}
