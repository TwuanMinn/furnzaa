"use client";

import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { Loader2, PackageSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge, PaymentBadge } from "@/components/ui/status-badge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { formatDate, formatMoney } from "@/lib/format";
import type { OrderPriorityDef, OrderStatusDef } from "@/lib/orders/config";
import type { CustomerOrderRow } from "@/app/api/customers/[id]/orders/route";
import type { CursorPage } from "@/lib/datatable/types";

interface CustomerOrdersListProps {
  customerId: string;
  statuses: OrderStatusDef[];
  priorities: OrderPriorityDef[];
}

/**
 * Chronological order history for one customer — infinite "load more" over
 * the cursor API (never loads the whole history at once).
 */
export function CustomerOrdersList({ customerId, statuses, priorities }: CustomerOrdersListProps) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const statusMap = new Map(statuses.map((s) => [s.key, s]));
  const priorityMap = new Map(priorities.map((p) => [p.key, p]));

  const query = useInfiniteQuery({
    queryKey: ["customer-orders", customerId],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }): Promise<CursorPage<CustomerOrderRow>> => {
      const params = new URLSearchParams({ limit: "25" });
      if (pageParam) params.set("cursor", pageParam);
      const res = await fetch(`/api/customers/${customerId}/orders?${params}`, { signal });
      const body = (await res.json()) as { ok: boolean; data?: CursorPage<CustomerOrderRow>; error?: string };
      if (!res.ok || !body.ok || !body.data) throw new Error(body.error ?? "Failed to load orders");
      return body.data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  if (query.isLoading) return <TableSkeleton rows={5} cols={5} />;
  if (query.error) {
    return (
      <div className="rounded-lg border border-border">
        <ErrorState description={query.error.message} />
      </div>
    );
  }

  const rows = query.data?.pages.flatMap((p) => p.rows) ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border">
        <EmptyState
          icon={PackageSearch}
          title="No orders yet"
          description="Orders placed by this customer will appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        Order history ({rows.length.toLocaleString()}
        {query.hasNextPage ? "+" : ""})
      </h2>
      <ol className="space-y-2">
        {rows.map((order, index) => {
          const statusDef = statusMap.get(order.status);
          const priorityDef = priorityMap.get(order.priority);
          return (
            <motion.li
              key={order.id}
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut", delay: reduce ? 0 : Math.min((index % 25) * 0.02, 0.25) }}
            >
              <button
                type="button"
                onClick={() => router.push(`/orders/${order.id}`)}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-card px-4 py-3 text-left text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="font-medium tabular-nums">{order.order_code}</span>
                <span className="text-muted-foreground">{formatDate(order.buying_date)}</span>
                <StatusBadge status={order.status} color={statusDef?.color} label={statusDef?.label} />
                <PriorityBadge priority={order.priority} color={priorityDef?.color} label={priorityDef?.label} />
                <PaymentBadge status={order.payment_status} />
                <span className="ml-auto font-medium tabular-nums">
                  {formatMoney(order.total_cents, order.currency)}
                </span>
              </button>
            </motion.li>
          );
        })}
      </ol>
      {query.hasNextPage ? (
        <div className="flex justify-center pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? <Loader2 className="animate-spin" /> : null}
            Load older orders
          </Button>
        </div>
      ) : null}
    </div>
  );
}
