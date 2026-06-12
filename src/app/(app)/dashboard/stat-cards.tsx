"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { animate, motion, useReducedMotion } from "motion/react";
import {
  Bell,
  CircleAlert,
  PackageOpen,
  ShoppingCart,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getBrowserClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/rbac/context";

/**
 * Module 0 quick-stat cards: soft gradient cards with an icon chip top-right,
 * staggered entrance, and COUNT-UP numbers (instant under reduced motion).
 * Counts arrive pre-aggregated from the server; the unread card re-counts live
 * via the same Realtime stream the bell uses — both stay in sync.
 */

export interface DashboardStats {
  scope: "company" | "own";
  totalOrders: number;
  /** Admin: total active customers. Staff: their open (non-final) orders. */
  secondCount: number;
  unread: number;
  /** Admin only (null hides the card). */
  lowStock: number | null;
  ordersThisWeek: number;
  newThisMonth: number;
}

function CountUp({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = value.toLocaleString();
      last.current = value;
      return;
    }
    const controls = animate(last.current, value, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => {
        el.textContent = Math.round(v).toLocaleString();
      },
    });
    last.current = value;
    return () => controls.stop();
  }, [value, reduce]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {value.toLocaleString()}
    </span>
  );
}

function StatCard({
  index,
  label,
  value,
  icon: Icon,
  href,
  borderColor,
  iconBg,
  iconText,
  subtext,
  badge,
}: {
  index: number;
  label: string;
  value: number;
  icon: LucideIcon;
  href: string;
  borderColor: string;
  iconBg: string;
  iconText: string;
  subtext?: string;
  badge?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: reduce ? 0 : index * 0.06, ease: "easeOut" }}
    >
      <Link
        href={href}
        className={cn(
          "group relative block overflow-hidden rounded-xl border border-border p-4 transition-transform duration-200 ease-out hover:-translate-y-0.5 focus-visible:ring-[3px] focus-visible:ring-ring/50 bg-card border-t-[3px]",
          borderColor,
        )}
      >
        <span
          className={cn(
            "absolute top-4 right-4 grid size-9 place-items-center rounded-lg ring-1 ring-inset ring-border/50 backdrop-blur-sm",
            iconBg,
            iconText,
          )}
        >
          <Icon className="size-4.5" aria-hidden />
        </span>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-bold">
          <CountUp value={value} />
        </p>
        {subtext ? (
          <p className="mt-2 text-xs text-muted-foreground">{subtext}</p>
        ) : null}
        {badge ? (
          <div className="mt-2">{badge}</div>
        ) : null}
      </Link>
    </motion.div>
  );
}

export function StatCards({ stats }: { stats: DashboardStats }) {
  const session = useSession();
  const queryClient = useQueryClient();

  // Live unread count — identical source to the bell (index-backed per-user RPC,
  // re-counted on each Realtime event for this user's notification_reads rows).
  const unreadQuery = useQuery({
    queryKey: ["dashboard-unread"],
    initialData: stats.unread,
    staleTime: 10_000,
    queryFn: async (): Promise<number> => {
      const supabase = getBrowserClient();
      const { data } = await supabase.rpc("unread_notification_count");
      return Number(data ?? 0);
    },
  });

  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`dashboard-unread:${session.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notification_reads", filter: `user_id=eq.${session.id}` },
        () => void queryClient.invalidateQueries({ queryKey: ["dashboard-unread"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session.id, queryClient]);

  const isCompany = stats.scope === "company";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <StatCard
        index={0}
        label={isCompany ? "Orders (all)" : "My orders"}
        value={stats.totalOrders}
        icon={ShoppingCart}
        href="/orders"
        borderColor="border-t-blue-500"
        iconBg="bg-blue-500/10"
        iconText="text-blue-500 ring-blue-500/20"
        subtext={`${stats.ordersThisWeek} this week`}
      />
      <StatCard
        index={1}
        label={isCompany ? "Customers" : "My open orders"}
        value={stats.secondCount}
        icon={isCompany ? Users : PackageOpen}
        href={isCompany ? "/crm" : "/orders"}
        borderColor="border-t-purple-500"
        iconBg="bg-purple-500/10"
        iconText="text-purple-500 ring-purple-500/20"
        subtext={isCompany ? `${stats.newThisMonth} new this month` : `${stats.newThisMonth} high priority`}
      />
      <StatCard
        index={2}
        label="Unread notifications"
        value={unreadQuery.data ?? 0}
        icon={Bell}
        href="/notifications"
        borderColor="border-t-amber-500"
        iconBg="bg-amber-500/10"
        iconText="text-amber-500 ring-amber-500/20"
        subtext={(unreadQuery.data ?? 0) === 0 ? "No urgent alerts" : `${unreadQuery.data} unread alerts`}
      />
      {stats.lowStock !== null ? (
        <StatCard
          index={3}
          label="Low-stock products"
          value={stats.lowStock}
          icon={CircleAlert}
          href="/products?f_stock=low"
          borderColor="border-t-red-500"
          iconBg="bg-red-500/10"
          iconText="text-red-500 ring-red-500/20"
          badge={
            stats.lowStock > 0 ? (
              <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-500 border border-red-500/25">
                Action needed
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-semibold text-green-500 border border-green-500/25">
                All in stock
              </span>
            )
          }
        />
      ) : null}
    </div>
  );
}
