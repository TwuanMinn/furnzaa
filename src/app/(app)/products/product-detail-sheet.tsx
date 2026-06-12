"use client";

import { useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownUp, Boxes, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Can } from "@/lib/rbac/context";
import { softDeleteProductAction } from "@/lib/products/actions";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { ProductListRow } from "@/lib/datasets/products";
import type { MovementListRow } from "@/lib/datasets/inventory";
import type { CategoryOption, WarehouseOption } from "./page";
import { ProductFormDialog } from "./product-dialogs";
import { AdjustStockDialog } from "./adjust-stock-dialog";

const MOVEMENT_BADGE: Record<string, string> = {
  purchase: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  sale: "bg-blue-100 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
  production: "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300",
  adjustment: "bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300",
  transfer: "bg-slate-100 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300",
  return: "bg-violet-100 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300",
};

/** Product detail: pricing/costs, stock, recent ledger, edit/adjust/delete. */
export function ProductDetailSheet({
  product,
  categories,
  warehouses,
  onOpenChange,
  onChanged,
}: {
  product: ProductListRow | null;
  categories: CategoryOption[];
  warehouses: WarehouseOption[];
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const movementsQuery = useQuery({
    queryKey: ["/api/inventory/movements", "mini", product?.id],
    enabled: !!product,
    queryFn: async (): Promise<MovementListRow[]> => {
      const res = await fetch(`/api/inventory/movements?limit=8&f_product=${product!.id}`);
      const body = (await res.json()) as { ok: boolean; data?: { rows: MovementListRow[] } };
      return body.ok && body.data ? body.data.rows : [];
    },
  });

  async function softDelete() {
    if (!product) return;
    setBusy(true);
    try {
      const result = await softDeleteProductAction(product.id);
      if (result.ok) {
        toast.success(`${product.name} deleted`);
        onOpenChange(false);
        onChanged?.();
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(false);
      setDeleteOpen(false);
    }
  }

  const grossMarginPct =
    product && product.selling_price_cents > 0
      ? (((product.selling_price_cents - product.cost_price_cents) / product.selling_price_cents) * 100).toFixed(1)
      : null;

  return (
    <>
      <Sheet open={!!product} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {product ? (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  {product.image_url ? (
                    <Image
                      src={product.image_url}
                      alt=""
                      width={48}
                      height={48}
                      unoptimized
                      className="size-12 rounded-lg border border-border object-cover"
                    />
                  ) : (
                    <span className="grid size-12 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Boxes className="size-6" aria-hidden />
                    </span>
                  )}
                  <div>
                    <SheetTitle className="text-left">{product.name}</SheetTitle>
                    <SheetDescription className="text-left font-mono text-xs">
                      {product.sku}
                      {product.barcode ? ` · ${product.barcode}` : ""}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-5 px-4 pb-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={product.status === "active" ? "secondary" : "outline"}>
                    {product.status}
                  </Badge>
                  {product.low_stock ? (
                    <Badge className="bg-red-100 text-red-700 dark:bg-red-400/10 dark:text-red-300">
                      Low stock
                    </Badge>
                  ) : null}
                  {product.product_categories ? (
                    <Badge variant="outline">{product.product_categories.name}</Badge>
                  ) : null}
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                  <div>
                    <dt className="text-muted-foreground">In stock</dt>
                    <dd className="text-lg font-semibold tabular-nums">
                      {product.current_stock.toLocaleString()}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        (min {product.minimum_stock})
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Gross margin</dt>
                    <dd className="text-lg font-semibold tabular-nums">
                      {grossMarginPct != null ? `${grossMarginPct}%` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Selling price</dt>
                    <dd className="tabular-nums">{formatMoney(product.selling_price_cents)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Cost price</dt>
                    <dd className="tabular-nums">{formatMoney(product.cost_price_cents)}</dd>
                  </div>
                  {product.labor_cost_cents + product.packaging_cost_cents + product.overhead_cost_cents > 0 ? (
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Production cost components</dt>
                      <dd className="tabular-nums">
                        labor {formatMoney(product.labor_cost_cents)} · packaging{" "}
                        {formatMoney(product.packaging_cost_cents)} · overhead{" "}
                        {formatMoney(product.overhead_cost_cents)}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {product.description ? (
                  <p className="text-sm text-muted-foreground">{product.description}</p>
                ) : null}

                <Separator />

                <div className="flex flex-col gap-2">
                  <Can permission="inventory.adjust">
                    <Button variant="outline" className="justify-start" onClick={() => setAdjustOpen(true)}>
                      <ArrowDownUp /> Record stock movement
                    </Button>
                  </Can>
                  <Can permission="products.edit">
                    <Button variant="outline" className="justify-start" onClick={() => setEditOpen(true)}>
                      <Pencil /> Edit product
                    </Button>
                  </Can>
                  <Can permission="products.delete">
                    <Button
                      variant="outline"
                      className="justify-start text-destructive hover:text-destructive"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 /> Delete product
                    </Button>
                  </Can>
                </div>

                <Separator />

                <div>
                  <h3 className="mb-2 text-sm font-medium">Recent movements</h3>
                  {movementsQuery.isLoading ? (
                    <div className="space-y-1.5">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full rounded-md" />
                      ))}
                    </div>
                  ) : (movementsQuery.data?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No movements recorded yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {movementsQuery.data!.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs"
                        >
                          <span
                            className={`rounded-full px-1.5 py-0.5 font-medium ${MOVEMENT_BADGE[m.movement_type] ?? ""}`}
                          >
                            {m.movement_type}
                          </span>
                          <span className="font-medium tabular-nums">
                            {m.quantity > 0 ? "+" : ""}
                            {m.quantity}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {m.previous_stock} → {m.new_stock}
                          </span>
                          <span className="ml-auto text-muted-foreground">
                            {formatDateTime(m.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      {product ? (
        <>
          <ProductFormDialog
            mode="edit"
            product={product}
            categories={categories}
            open={editOpen}
            onOpenChange={setEditOpen}
            onSaved={() => {
              onChanged?.();
              onOpenChange(false);
            }}
          />
          <AdjustStockDialog
            open={adjustOpen}
            onOpenChange={setAdjustOpen}
            product={product}
            warehouses={warehouses}
            onAdjusted={() => {
              onChanged?.();
              onOpenChange(false);
            }}
          />
        </>
      ) : null}

      <AlertDialog open={deleteOpen} onOpenChange={(o) => !busy && setDeleteOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {product?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The product is soft-deleted (hidden from lists, marked discontinued) and stays in
              order history, movements and reports.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void softDelete();
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              Delete product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
