/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adjustStockAction } from "@/lib/products/actions";
import type { WarehouseOption } from "./page";

const MOVEMENT_TYPES = [
  { value: "purchase", label: "Purchase (stock in)", sign: 1 },
  { value: "return", label: "Return (stock in)", sign: 1 },
  { value: "adjustment", label: "Adjustment (±)", sign: 0 },
  { value: "transfer", label: "Transfer (±)", sign: 0 },
] as const;

/**
 * Manual stock movement — the ONLY manual write path to stock. Runs through
 * the locking ledger RPC; direction is explicit and every movement is
 * attributed and activity-logged.
 */
export function AdjustStockDialog({
  open,
  onOpenChange,
  product,
  warehouses,
  onAdjusted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: { id: string; name: string; current_stock: number } | null;
  warehouses: WarehouseOption[];
  onAdjusted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [movementType, setMovementType] = useState<string>("purchase");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [quantity, setQuantity] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>("__default__");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMovementType("purchase");
      setDirection("in");
      setQuantity("");
      setNotes("");
      setWarehouseId("__default__");
    }
  }, [open]);

  const fixedSign = MOVEMENT_TYPES.find((m) => m.value === movementType)?.sign ?? 0;
  const effectiveDirection = fixedSign === 1 ? "in" : direction;

  async function save() {
    if (!product) return;
    const qty = Math.abs(Math.trunc(Number(quantity)));
    if (!qty) {
      toast.error("Enter a quantity");
      return;
    }
    const signed = effectiveDirection === "in" ? qty : -qty;
    if (product.current_stock + signed < 0) {
      toast.error(`Only ${product.current_stock} in stock — can't remove ${qty}.`);
      return;
    }
    setSaving(true);
    try {
      const result = await adjustStockAction({
        productId: product.id,
        movementType: movementType as "purchase" | "adjustment" | "transfer" | "return",
        quantity: signed,
        warehouseId: warehouseId === "__default__" ? null : warehouseId,
        notes,
      });
      if (result.ok) {
        toast.success(
          `${product.name}: ${signed > 0 ? "+" : ""}${signed} → ${result.data.newStock.toLocaleString()} in stock`,
        );
        onOpenChange(false);
        onAdjusted?.();
        void queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/inventory/movements"] });
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record stock movement</DialogTitle>
          <DialogDescription>
            {product ? (
              <>
                {product.name} — currently{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {product.current_stock.toLocaleString()}
                </span>{" "}
                in stock. Direct stock edits are disabled; every change is a ledger movement.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="adj-type">Movement type</Label>
            <Select value={movementType} onValueChange={setMovementType}>
              <SelectTrigger id="adj-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOVEMENT_TYPES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="adj-qty">Quantity</Label>
              <Input
                id="adj-qty"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-dir">Direction</Label>
              <Select
                value={effectiveDirection}
                onValueChange={(v) => setDirection(v as "in" | "out")}
                disabled={fixedSign === 1}
              >
                <SelectTrigger id="adj-dir" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Stock in (+)</SelectItem>
                  <SelectItem value="out">Stock out (−)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {warehouses.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="adj-wh">Warehouse</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger id="adj-wh" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Default warehouse</SelectItem>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                      {w.is_default ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="adj-notes">Notes (optional)</Label>
            <Textarea
              id="adj-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. cycle count correction, damaged units"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Record movement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
