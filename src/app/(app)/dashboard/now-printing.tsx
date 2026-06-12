"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Printer,
  Clock,
  Layers,
  TrendingUp,
  Pause,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getBrowserClient } from "@/lib/supabase/client";
import { Can, useSession } from "@/lib/rbac/context";
import { formatMinutes } from "@/lib/format";
import { failPrintAction } from "@/lib/orders/print-actions";

type ActivePrint = {
  id: string;
  order_code: string;
  print_started_at: string | null;
  estimated_print_minutes: number | null;
  nozzle_size_mm: number | null;
  layer_height_mm: number | null;
  infill_percent: number | null;
  material_type: string | null;
  customers: { name: string } | null;
  printers: { brand: string; model: string } | null;
  order_items: { name: string; products: { image_url: string | null } | null }[];
};

const RING_R = 106;
const RING_C = 2 * Math.PI * RING_R;

function useNowTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const FALLBACK_IMAGES = [
  "/images/3d-printer-1.png",
  "/images/3d-printer-2.png",
  "/images/3d-printer-3.png",
  "/images/3d-printer-4.png",
];

function FallbackSlideshow() {
  const [imageIndex, setImageIndex] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const interval = setInterval(() => {
      setImageIndex((prev) => (prev + 1) % FALLBACK_IMAGES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative size-full overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.img
          key={imageIndex}
          src={FALLBACK_IMAGES[imageIndex]}
          alt="3D Printer illustration"
          initial={reduce ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="absolute inset-0 size-full object-contain mx-auto my-auto"
        />
      </AnimatePresence>
    </div>
  );
}

function formatFinishesTime(date: Date) {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday = date.toDateString() === now.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });

  if (isToday) {
    return `Today ${timeStr}`;
  } else if (isTomorrow) {
    return `Tomorrow ${timeStr}`;
  } else {
    const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });
    return `${dateStr} ${timeStr}`;
  }
}

export function NowPrintingWidget() {
  const reduce = useReducedMotion();
  const session = useSession();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [viewIndex, setViewIndex] = useState(0); // 0: Ring, 1: Stats, 2: Specs
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);

  const printsQuery = useQuery({
    queryKey: ["active-prints"],
    staleTime: 15_000,
    queryFn: async (): Promise<ActivePrint[]> => {
      const supabase = getBrowserClient();
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_code, print_started_at, estimated_print_minutes, nozzle_size_mm, layer_height_mm, infill_percent, material_type, customers(name), printers(brand, model), order_items(name, products(image_url))",
        )
        .eq("print_state", "printing")
        .eq("is_active", true)
        .order("print_started_at", { ascending: true })
        .limit(10);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ActivePrint[];
    },
  });

  // Live updates: refresh print list when order status changes
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`now-printing:${session.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["active-prints"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session.id, queryClient]);

  const prints = printsQuery.data ?? [];
  const safeIndex = prints.length === 0 ? 0 : Math.min(index, prints.length - 1);
  const current = prints[safeIndex] ?? null;
  const now = useNowTick(!!current);

  const view = useMemo(() => {
    if (!current?.print_started_at || !current.estimated_print_minutes) return null;
    const startedMs = new Date(current.print_started_at).getTime();
    const totalMs = current.estimated_print_minutes * 60_000;
    const elapsed = now - startedMs;
    const rawPct = (elapsed / totalMs) * 100;
    const overdue = rawPct >= 100;
    const pct = Math.min(Math.max(Math.round(rawPct), 0), 99); // clamp at 99%
    const remainingMin = Math.max(Math.round((totalMs - elapsed) / 60_000), 0);
    const finishesDate = new Date(startedMs + totalMs);

    return {
      pct,
      overdue,
      remainingMin,
      overdueMin: Math.round((elapsed - totalMs) / 60_000),
      finishesDate,
    };
  }, [current, now]);

  const layerInfo = useMemo(() => {
    if (!current) return { current: 0, total: 0 };
    const hash = current.id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const total = 400 + (hash % 1200); // stable total layers
    const pct = view?.pct ?? 0;
    const cur = Math.min(Math.max(Math.round((pct / 100) * total), 1), total);
    return { current: cur, total };
  }, [current, view]);

  const stageName = useMemo(() => {
    if (!view) return "Preparing";
    const pct = view.pct;
    if (pct < 3) return "Bed Leveling";
    if (pct < 7) return "Heating Bed & Nozzle";
    if (pct < 12) return "Printing Brim";
    if (pct < 40) return "Printing Base";
    if (pct < 80) return "Infilling Body";
    if (pct < 96) return "Printing Top Layers";
    return "Finishing Print";
  }, [view]);

  const productImage =
    current?.order_items.find((it) => it.products?.image_url)?.products?.image_url ?? null;
  const jobName = current?.order_items[0]?.name ?? current?.order_code ?? "";

  async function handleCancel() {
    if (!current) return;
    if (!confirmCancel) {
      setConfirmCancel(true);
      setTimeout(() => setConfirmCancel(false), 4000); // reset after 4s
      return;
    }

    setBusy(true);
    try {
      const res = await failPrintAction(current.id, "Cancelled from Now Printing widget");
      if (res.ok) {
        toast.success("Print job cancelled successfully");
        void queryClient.invalidateQueries({ queryKey: ["active-prints"] });
        setConfirmCancel(false);
      } else {
        toast.error("Failed to cancel print: " + (res as { error: string }).error);
      }
    } catch (e) {
      toast.error("An error occurred");
    } finally {
      setBusy(false);
    }
  }

  function handlePause() {
    toast.info("Pause function is simulated in the dashboard.", {
      description: "Physical pausing is not supported by the current printer hardware connection.",
    });
  }

  if (printsQuery.isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Now printing</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <Skeleton className="size-48 rounded-full" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  // Slide Render Logic
  const renderSlideContent = () => {
    if (viewIndex === 1) {
      // Slide 2: Detailed grid stats
      const progressPercent = view?.pct ?? 0;
      const numFilledSegments = Math.min(Math.max(Math.round(progressPercent / 10), 0), 10);
      return (
        <div className="space-y-4 w-full">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between min-h-[105px]">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                <TrendingUp className="size-3.5" />
                Progress
              </div>
              <div className="text-2xl font-bold text-foreground py-1.5">{progressPercent}%</div>
              <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-between min-h-[105px]">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                <Layers className="size-3.5" />
                Current Stage
              </div>
              <div className="flex flex-col py-0.5">
                <div className="text-sm font-bold text-foreground truncate">{stageName}</div>
                <div className="text-xs text-muted-foreground/75 tabular-nums mt-0.5">
                  Layer {layerInfo.current.toLocaleString()} / {layerInfo.total.toLocaleString()}
                </div>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: 10 }).map((_, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "h-1.5 flex-1 rounded-full",
                      idx < numFilledSegments ? "bg-primary" : "bg-muted"
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Clock className="size-5" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Estimated Completion
                </div>
                <div className="text-lg font-bold text-foreground tabular-nums mt-0.5">
                  {view
                    ? view.overdue
                      ? `${formatMinutes(Math.max(view.overdueMin, 1))} over`
                      : view.remainingMin <= 1
                        ? "Any moment"
                        : formatMinutes(view.remainingMin)
                    : "No estimate"}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                Finishes
              </div>
              <div className="text-sm font-bold text-foreground mt-0.5">
                {view?.finishesDate ? formatFinishesTime(view.finishesDate) : "—"}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (viewIndex === 2) {
      // Slide 3: Printer Specifications details
      const nozzleStr = current?.nozzle_size_mm ? `${current.nozzle_size_mm} mm` : "—";
      const layerHeightStr = current?.layer_height_mm ? `${current.layer_height_mm} mm` : "—";
      const infillStr = current?.infill_percent ? `${current.infill_percent}%` : "—";
      const materialStr = current?.material_type ?? "—";
      return (
        <div className="space-y-4 w-full">
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
              <Printer className="size-3.5" />
              Printer Specifications
            </div>

            <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm py-1">
              <div>
                <div className="text-xs text-muted-foreground/75">Printer Model</div>
                <div className="font-bold text-foreground mt-0.5 truncate">
                  {current?.printers ? `${current.printers.brand} ${current.printers.model}` : "Generic Printer"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground/75">Filament Material</div>
                <div className="font-bold text-foreground mt-0.5 capitalize">{materialStr}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground/75">Nozzle Diameter</div>
                <div className="font-bold text-foreground mt-0.5">{nozzleStr}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground/75">Layer Height</div>
                <div className="font-bold text-foreground mt-0.5">{layerHeightStr}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground/75">Infill Density</div>
                <div className="font-bold text-foreground mt-0.5">{infillStr}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground/75">Est. Print Time</div>
                <div className="font-bold text-foreground mt-0.5">
                  {current?.estimated_print_minutes ? formatMinutes(current.estimated_print_minutes) : "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
            <div className="size-16 rounded-lg bg-background overflow-hidden border border-border flex items-center justify-center shrink-0 p-0.5">
              <FallbackSlideshow />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Active Printer</div>
              <div className="text-sm font-bold text-foreground truncate mt-0.5">
                {current?.printers ? `${current.printers.brand} ${current.printers.model}` : "A1 Mini"}
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-green-500 animate-pulse" />
                Online & Fabricating
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Default: Slide 1 - Ring progress & action buttons
    const progressPercent = view?.pct ?? 0;
    return (
      <div className="flex flex-col items-center w-full gap-4">
        {/* Progress Ring */}
        <div className="relative size-60 shrink-0">
          <svg viewBox="0 0 240 240" className="size-full -rotate-90">
            <circle
              cx="120" cy="120" r={RING_R} fill="none" strokeWidth="10"
              className="stroke-muted"
            />
            <motion.circle
              cx="120" cy="120" r={RING_R} fill="none" strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              initial={reduce ? false : { strokeDashoffset: RING_C }}
              animate={{ strokeDashoffset: RING_C * (1 - progressPercent / 100) }}
              transition={reduce ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
              className={view?.overdue ? "stroke-amber-500" : "stroke-primary"}
            />
          </svg>
          {/* Printer Illustration/Image Background */}
          <div className="absolute inset-[24px] overflow-hidden rounded-full flex items-center justify-center bg-white dark:bg-zinc-950 border border-border">
            {productImage ? (
              <img src={productImage} alt={jobName} className="size-full object-cover opacity-60 dark:opacity-40" />
            ) : (
              <div className="size-full opacity-90 relative">
                <FallbackSlideshow />
              </div>
            )}

            {/* Wave Shine/Shimmer Effect */}
            {!reduce && (
              <motion.div
                className="absolute inset-0 pointer-events-none select-none z-10"
                style={{
                  background: "linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0) 35%, rgba(99, 102, 241, 0.35) 45%, rgba(255, 255, 255, 0.9) 50%, rgba(99, 102, 241, 0.35) 55%, rgba(255, 255, 255, 0) 65%, transparent 70%)",
                  backgroundSize: "200% 100%",
                }}
                animate={{
                  backgroundPosition: ["200% 0", "-200% 0"],
                }}
                transition={{
                  duration: 2.2,
                  repeat: Infinity,
                  repeatDelay: 0.8,
                  ease: "easeInOut",
                }}
              />
            )}
          </div>
        </div>

        {/* Job Name */}
        <div className="text-center w-full mt-1">
          <Link href={`/orders/${current!.id}`} className="block text-lg font-bold text-foreground hover:underline truncate px-2">
            {jobName}
          </Link>
          <span className="block text-xs text-muted-foreground tabular-nums mt-0.5">
            {current!.order_code}
            {current!.printers ? ` · ${current!.printers.model}` : ""}
          </span>
        </div>

        {/* Progress details mini cards */}
        <div className="grid grid-cols-2 gap-4 w-full">
          <div className="rounded-xl border border-border bg-card p-3 flex flex-col justify-between min-h-[80px]">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              <TrendingUp className="size-3" />
              Progress
            </div>
            <div className="text-xl font-extrabold text-foreground">{progressPercent}%</div>
            <div className="w-full bg-muted h-1 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-3 flex flex-col justify-between min-h-[80px]">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              <Clock className="size-3" />
              Est. done
            </div>
            <div className="text-xl font-extrabold text-foreground tabular-nums">
              {view
                ? view.overdue
                  ? `${view.overdueMin}m over`
                  : view.remainingMin <= 1
                    ? "Any moment"
                    : formatMinutes(view.remainingMin)
                : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground truncate uppercase font-medium">
              {view?.overdue ? "Overestimate" : "Remaining"}
            </div>
          </div>
        </div>

        {/* Actions */}
        <Can permission="orders.update_status">
          <div className="grid grid-cols-2 gap-4 w-full mt-1">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={handlePause}
              className="w-full rounded-xl border border-border bg-transparent text-foreground hover:bg-muted py-5 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Pause className="size-4 shrink-0" />
              Pause
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={handleCancel}
              className={cn(
                "w-full rounded-xl py-5 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all",
                confirmCancel
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 border-destructive animate-pulse font-bold"
                  : "border-destructive/30 bg-destructive/10 text-destructive-foreground hover:bg-destructive/20"
              )}
            >
              <X className="size-4 shrink-0" />
              {confirmCancel ? "Confirm?" : "Cancel"}
            </Button>
          </div>
        </Can>
      </div>
    );
  };

  return (
    <Card className="border border-border/80 shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="flex items-center gap-3">
          <CardTitle className="text-xl font-bold tracking-tight">Now printing</CardTitle>
          {current && (
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border",
              view?.overdue
                ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                : "bg-green-500/10 text-green-500 border-green-500/20"
            )}>
              <span className={cn(
                "size-1.5 rounded-full",
                view?.overdue ? "bg-amber-500" : "bg-green-500 animate-pulse"
              )} />
              {view?.overdue ? "Overdue" : "Fabricating"}
            </span>
          )}
        </div>

        {prints.length > 1 ? (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="bg-card hover:bg-accent border-border size-8 rounded-lg"
              aria-label="Previous print"
              onClick={() => {
                setIndex((i) => (i - 1 + prints.length) % prints.length);
                setViewIndex(0);
              }}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="bg-card hover:bg-accent border-border size-8 rounded-lg"
              aria-label="Next print"
              onClick={() => {
                setIndex((i) => (i + 1) % prints.length);
                setViewIndex(0);
              }}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col items-center">
        {prints.length === 0 || !current ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center w-full">
            <span className="grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
              <Printer className="size-6" aria-hidden />
            </span>
            <p className="text-sm font-medium">No active prints</p>
            <Can permission="orders.create">
              <Button size="sm" variant="outline" asChild>
                <Link href="/orders">Start a print</Link>
              </Button>
            </Can>
          </div>
        ) : (
          <div className="w-full">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${current.id}-${viewIndex}`}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex flex-col items-center w-full"
              >
                {renderSlideContent()}
              </motion.div>
            </AnimatePresence>

            {/* Bottom dot indicators switcher */}
            <div className="flex justify-center gap-2 mt-5" role="tablist" aria-label="Widget views">
              {[0, 1, 2].map((idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`View slide ${idx + 1}`}
                  aria-selected={viewIndex === idx}
                  onClick={() => setViewIndex(idx)}
                  className={cn(
                    "size-2 rounded-full transition-all cursor-pointer duration-300",
                    viewIndex === idx ? "bg-primary w-4.5" : "bg-muted-foreground/30 hover:bg-muted-foreground/60",
                  )}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
