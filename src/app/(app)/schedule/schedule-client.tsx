"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { KanbanSquare, GanttChartSquare, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { getBrowserClient } from "@/lib/supabase/client";
import { ScheduleBoard } from "./board";
import { ScheduleTimeline } from "./timeline";
import type { BoardData } from "./types";

/**
 * Production Schedule orchestrator: filters + Board|Timeline toggle + the
 * /api/schedule query, kept live by a Supabase Realtime subscription on
 * print_schedule (the sync trigger writes it in the same transaction as every
 * print action, so every open board updates without reload).
 */

const ALL = "__all__";

interface FilterOption {
  key: string;
  label: string;
}

export function ScheduleClient({
  userId,
  canManage,
  priorities,
  materials,
}: {
  userId: string;
  canManage: boolean;
  priorities: FilterOption[];
  materials: FilterOption[];
}) {
  const reduce = useReducedMotion();
  const queryClient = useQueryClient();

  const [view, setView] = useState<"board" | "timeline">("board");
  const [mine, setMine] = useState(!canManage); // staff default: their own jobs
  const [printer, setPrinter] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [material, setMaterial] = useState(ALL);
  const [staff, setStaff] = useState(ALL);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [limits, setLimits] = useState({ queued: 30, completed: 20, failed: 20 });

  // Debounced search (~300ms), like every other list screen.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (printer !== ALL) p.set("printer", printer);
    if (priority !== ALL) p.set("priority", priority);
    if (material !== ALL) p.set("material", material);
    const staffFilter = mine ? userId : staff !== ALL ? staff : "";
    if (staffFilter) p.set("staff", staffFilter);
    if (q) p.set("q", q);
    p.set("qLimit", String(limits.queued));
    p.set("cLimit", String(limits.completed));
    p.set("fLimit", String(limits.failed));
    return p.toString();
  }, [printer, priority, material, mine, staff, q, limits, userId]);

  const query = useQuery({
    queryKey: ["schedule", params],
    queryFn: async (): Promise<BoardData> => {
      const res = await fetch(`/api/schedule?${params}`);
      const body = (await res.json()) as { ok: boolean; data?: BoardData; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Failed to load");
      return body.data;
    },
    staleTime: 15_000,
  });

  // Live board: any print_schedule change (the sync trigger fires on every
  // print action and printer assignment) refreshes the query.
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel("print-schedule-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "print_schedule" },
        () => void queryClient.invalidateQueries({ queryKey: ["schedule"] }),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [queryClient]);

  const staffQuery = useQuery({
    queryKey: ["schedule-staff"],
    enabled: canManage,
    queryFn: async (): Promise<{ id: string; full_name: string }[]> => {
      const res = await fetch("/api/staff");
      const body = (await res.json()) as { data?: { staff?: { id: string; full_name: string }[] } };
      return body.data?.staff ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const refetch = () => void queryClient.invalidateQueries({ queryKey: ["schedule"] });

  return (
    <div className="space-y-4">
      {/* Toolbar: view toggle + scope + filters + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-border p-0.5">
          {(
            [
              { id: "board", label: "Board", icon: KanbanSquare },
              { id: "timeline", label: "Timeline", icon: GanttChartSquare },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              aria-pressed={view === id}
              className={cn(
                "relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                view === id ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {view === id ? (
                <motion.span
                  layoutId="schedule-view-pill"
                  className="absolute inset-0 rounded-md bg-muted"
                  transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.4 }}
                />
              ) : null}
              <Icon className="relative size-4" aria-hidden />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>

        {!canManage ? (
          <div className="flex items-center rounded-lg border border-border p-0.5">
            {(
              [
                { id: true, label: "My jobs" },
                { id: false, label: "All (read-only)" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={String(id)}
                type="button"
                onClick={() => setMine(id)}
                aria-pressed={mine === id}
                className={cn(
                  "relative rounded-md px-3 py-1.5 text-sm transition-colors",
                  mine === id ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {mine === id ? (
                  <motion.span
                    layoutId="schedule-scope-pill"
                    className="absolute inset-0 rounded-md bg-muted"
                    transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.4 }}
                  />
                ) : null}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="relative ml-auto w-full max-w-56">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code, product, customer…"
            aria-label="Search jobs"
            className="h-9 pl-8"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={printer} onValueChange={setPrinter}>
          <SelectTrigger size="sm" className="w-auto min-w-32 gap-1" aria-label="Printer filter">
            <span className="text-muted-foreground">Printer:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All</SelectItem>
            <SelectItem value="none">Unassigned</SelectItem>
            {(query.data?.capacity ?? []).map((p) => (
              <SelectItem key={p.printerId} value={p.printerId}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger size="sm" className="w-auto min-w-32 gap-1" aria-label="Priority filter">
            <span className="text-muted-foreground">Priority:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All</SelectItem>
            {priorities.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={material} onValueChange={setMaterial}>
          <SelectTrigger size="sm" className="w-auto min-w-32 gap-1" aria-label="Material filter">
            <span className="text-muted-foreground">Material:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All</SelectItem>
            {materials.map((m) => (
              <SelectItem key={m.key} value={m.key}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage ? (
          <Select value={staff} onValueChange={setStaff}>
            <SelectTrigger size="sm" className="w-auto min-w-32 gap-1" aria-label="Assignee filter">
              <span className="text-muted-foreground">Assigned:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              {(staffQuery.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          title="Couldn't load the schedule"
          description={query.error instanceof Error ? query.error.message : undefined}
          action={
            <button type="button" onClick={refetch} className="text-sm font-medium text-primary hover:underline">
              Try again
            </button>
          }
        />
      ) : query.data ? (
        view === "board" ? (
          <ScheduleBoard
            data={query.data}
            userId={userId}
            canManage={canManage}
            onMutated={refetch}
            onLoadMore={(state) =>
              setLimits((prev) => ({ ...prev, [state]: prev[state] + 30 }))
            }
          />
        ) : (
          <ScheduleTimeline data={query.data} canManage={canManage} onMutated={refetch} />
        )
      ) : null}
    </div>
  );
}
