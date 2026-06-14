"use client";

import { type ReactNode } from "react";
import { Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProductLinePicker, type ProductHit } from "@/app/(app)/orders/order-form-parts";

/**
 * One product line shared by the PO and BOM editors: a product-display cell, a
 * product picker, caller-supplied input cells (quantity, unit cost, …) and a
 * remove button — laid out in a grid whose column template the caller controls
 * via `className`. The middle `children` fill the columns between the picker
 * and the remove button.
 */
export function LineItemRow({
  product,
  secondary,
  emptyLabel,
  onPick,
  onRemove,
  removeDisabled,
  removeLabel,
  className,
  children,
}: {
  product: ProductHit | null;
  /** Secondary text after the product name (SKU, stock level, …). */
  secondary?: (product: ProductHit) => ReactNode;
  /** Placeholder shown until a product is picked. */
  emptyLabel: string;
  onPick: (product: ProductHit) => void;
  onRemove: () => void;
  removeDisabled?: boolean;
  removeLabel: string;
  /** Grid column template, e.g. "grid-cols-[1fr_32px_64px_90px_32px]". */
  className: string;
  /** Input cells placed between the picker and the remove button. */
  children: ReactNode;
}) {
  return (
    <div className={cn("grid items-center gap-2", className)}>
      <div className="truncate rounded-md border border-input bg-muted/30 px-2.5 py-2 text-sm">
        {product ? (
          <>
            <span className="font-medium">{product.name}</span>{" "}
            {secondary?.(product)}
          </>
        ) : (
          <span className="text-muted-foreground">{emptyLabel}</span>
        )}
      </div>
      <ProductLinePicker linked={false} onPick={onPick} onUnlink={() => undefined} />
      {children}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={removeLabel}
        disabled={removeDisabled}
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 />
      </Button>
    </div>
  );
}
