"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getBrowserClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/rbac/context";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/lib/notifications/actions";
import type { NotificationListRow } from "@/app/api/notifications/route";

interface BellData {
  rows: NotificationListRow[];
  unread: number;
}

/**
 * Topbar bell: live unread badge + recent-items dropdown. A Supabase Realtime
 * subscription on the user's notification_reads rows (RLS-scoped) refreshes
 * the count the moment a notification lands — no polling.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const user = useSession();
  const reduce = useReducedMotion();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications", "bell"],
    staleTime: 30_000,
    queryFn: async (): Promise<BellData> => {
      const res = await fetch("/api/notifications?limit=8");
      const body = (await res.json()) as { ok: boolean; data?: BellData };
      if (!body.ok || !body.data) throw new Error("Failed to load notifications");
      return body.data;
    },
  });

  const unread = data?.unread ?? initialUnread;
  const countLabel = unread > 99 ? "99+" : String(unread);

  // Live updates: new notification_reads row for me → refetch + toast.
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notification_reads", filter: `user_id=eq.${user.id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["notifications"] });
          toast.info("New notification", {
            action: { label: "View", onClick: () => router.push("/notifications") },
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user.id, queryClient, router]);

  async function openItem(row: NotificationListRow) {
    if (!row.read_at && row.notifications) {
      void markNotificationReadAction(row.notifications.id).then(() =>
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      );
    }
    router.push(row.notifications?.link_url || "/notifications");
  }

  async function markAll() {
    const result = await markAllNotificationsReadAction();
    if (result.ok) void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <DropdownMenu>
      <div className="relative">
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Notifications${unread > 0 ? `, ${countLabel} unread` : ""}`}
          >
            <Bell className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <AnimatePresence>
          {unread > 0 ? (
            <motion.span
              key="unread-badge"
              initial={reduce ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { scale: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              aria-hidden="true"
              className="pointer-events-none absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground"
            >
              {countLabel}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {unread > 0 ? (
            <Button variant="ghost" size="xs" onClick={() => void markAll()}>
              <CheckCheck /> Mark all read
            </Button>
          ) : null}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {(data?.rows.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <Inbox className="size-6" aria-hidden />
              You’re all caught up
            </div>
          ) : (
            <ul>
              <AnimatePresence initial={false}>
                {data!.rows.map((row) => (
                  <motion.li
                    key={row.id}
                    initial={reduce ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                  >
                    <button
                      type="button"
                      onClick={() => void openItem(row)}
                      className="flex w-full items-start gap-2.5 border-b border-border px-3 py-2.5 text-left text-sm last:border-0 hover:bg-accent"
                    >
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${row.read_at ? "bg-transparent" : "bg-primary"}`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate ${row.read_at ? "" : "font-medium"}`}>
                          {row.notifications?.title}
                        </span>
                        {row.notifications?.body ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {row.notifications.body}
                          </span>
                        ) : null}
                        <span className="block text-xs text-muted-foreground">
                          {formatDistanceToNowStrict(new Date(row.created_at), { addSuffix: true })}
                        </span>
                      </span>
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <div className="border-t border-border p-1.5">
          <Button variant="ghost" size="sm" className="w-full" asChild>
            <Link href="/notifications">View all notifications</Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
