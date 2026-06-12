"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { BellOff, CheckCheck, Loader2, Megaphone, PackageCheck, PackageSearch, MessageSquare } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/notifications/actions";
import type { NotificationListRow } from "@/app/api/notifications/route";
import type { CursorPage } from "@/lib/datatable/types";

type PageData = CursorPage<NotificationListRow> & { unread: number };

const CATEGORY_ICONS: Record<string, typeof Megaphone> = {
  manual: Megaphone,
  order_assigned: PackageSearch,
  order_delivered: PackageCheck,
  new_message: MessageSquare,
};

export function NotificationsCenter() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"all" | "unread">("all");

  const query = useInfiniteQuery({
    queryKey: ["notifications", "center", tab],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }): Promise<PageData> => {
      const params = new URLSearchParams({ limit: "20" });
      if (pageParam) params.set("cursor", pageParam);
      if (tab === "unread") params.set("unread", "true");
      const res = await fetch(`/api/notifications?${params}`, { signal });
      const body = (await res.json()) as { ok: boolean; data?: PageData; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Failed to load");
      return body.data;
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  const rows = query.data?.pages.flatMap((p) => p.rows) ?? [];
  const unread = query.data?.pages[0]?.unread ?? 0;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function open(row: NotificationListRow) {
    if (!row.read_at && row.notifications) {
      await markNotificationReadAction(row.notifications.id);
      invalidate();
    }
    if (row.notifications?.link_url) router.push(row.notifications.link_url);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "unread")}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="unread">
              Unread
              {unread > 0 ? (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {unread > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void markAllNotificationsReadAction().then(invalidate)}
          >
            <CheckCheck /> Mark all read
          </Button>
        ) : null}
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : query.error ? (
        <div className="rounded-lg border border-border">
          <ErrorState description={query.error.message} />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border">
          <EmptyState
            icon={BellOff}
            title={tab === "unread" ? "No unread notifications" : "No notifications yet"}
            description="Order assignments, deliveries and announcements will appear here."
          />
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {rows.map((row, index) => {
              const n = row.notifications;
              const Icon = CATEGORY_ICONS[n?.category ?? "manual"] ?? Megaphone;
              return (
                <motion.li
                  key={row.id}
                  layout={reduce ? false : "position"}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: "easeOut", delay: reduce ? 0 : Math.min((index % 20) * 0.02, 0.2) }}
                >
                  <button
                    type="button"
                    onClick={() => void open(row)}
                    className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                      row.read_at ? "border-border bg-card" : "border-primary/30 bg-primary/[0.03]"
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${
                        row.read_at ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                      }`}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${row.read_at ? "" : "font-medium"}`}>
                        {n?.title}
                      </span>
                      {n?.body ? (
                        <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>
                      ) : null}
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(row.created_at), { addSuffix: true })}
                        {n?.sender ? ` · from ${n.sender.full_name}` : ""}
                        {n?.type === "system" ? " · automatic" : ""}
                      </span>
                    </span>
                    {!row.read_at ? (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
                    ) : null}
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? <Loader2 className="animate-spin" /> : null}
            Load older
          </Button>
        </div>
      ) : null}
    </div>
  );
}
