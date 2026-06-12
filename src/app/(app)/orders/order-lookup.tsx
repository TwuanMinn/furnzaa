/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Loader2, PackageSearch, ScanSearch, UserRound } from "lucide-react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatMoney } from "@/lib/format";
import type { LookupCustomerHit, LookupOrderHit } from "@/app/api/orders/lookup/route";

interface LookupResults {
  orders: LookupOrderHit[];
  customers: LookupCustomerHit[];
}

/**
 * The Hub's hero finder. Debounced lookup against order codes and customer
 * name/phone/email; picking a result jumps to the order or the customer's
 * full order history.
 */
export function OrderLookup() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const [value, setValue] = useState("");
  const debounced = useDebouncedValue(value.trim(), 300);
  const [results, setResults] = useState<LookupResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (debounced.length < 2) {
      setResults(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/orders/lookup?q=${encodeURIComponent(debounced)}`, { signal: controller.signal })
      .then(async (res) => (await res.json()) as { ok: boolean; data?: LookupResults })
      .then((body) => {
        if (body.ok && body.data) {
          setResults(body.data);
          setOpen(true);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [debounced]);

  // Close when clicking outside.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const hasResults = (results?.orders.length ?? 0) + (results?.customers.length ?? 0) > 0;

  return (
    <div ref={containerRef} className="relative">
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 via-card to-card p-4 shadow-xs">
        <label htmlFor="order-lookup" className="mb-2 flex items-center gap-2 text-sm font-medium">
          <ScanSearch className="size-4 text-primary" aria-hidden />
          Customer lookup
        </label>
        <div className="relative">
          <input
            id="order-lookup"
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => hasResults && setOpen(true)}
            placeholder="Order code, customer name, phone or email…"
            autoComplete="off"
            className="h-11 w-full rounded-lg border border-input bg-background px-4 pr-10 text-base shadow-xs transition-shadow outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {loading ? (
            <Loader2
              className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : null}
        </div>
      </div>

      <AnimatePresence>
        {open && results ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -4, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
            role="listbox"
            aria-label="Lookup results"
          >
            {!hasResults ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No orders or customers match “{debounced}”.
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto p-1.5">
                {results.orders.length > 0 ? (
                  <div className="mb-1">
                    <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
                      Orders
                    </p>
                    {results.orders.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          router.push(`/orders/${o.id}`);
                        }}
                        className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                      >
                        <PackageSearch className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="font-medium">{o.order_code}</span>
                        <span className="truncate text-muted-foreground">
                          {o.customers?.name} · {formatDate(o.buying_date)}
                        </span>
                        <span className="ml-auto flex items-center gap-2">
                          <span className="text-muted-foreground tabular-nums">
                            {formatMoney(o.total_cents, o.currency)}
                          </span>
                          <StatusBadge status={o.status} />
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {results.customers.length > 0 ? (
                  <div>
                    <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
                      Customers
                    </p>
                    {results.customers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          router.push(`/orders/customers/${c.id}`);
                        }}
                        className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent"
                      >
                        <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="font-medium">{c.name}</span>
                        <span className="truncate text-muted-foreground">
                          {[c.email, c.phone].filter(Boolean).join(" · ") || "No contact info"}
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          View order history →
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
