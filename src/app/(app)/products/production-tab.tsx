/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Factory, ListTree, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/datatable/data-table";
import { useDataTable } from "@/lib/datatable/use-data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Can } from "@/lib/rbac/context";
import {
  completeProductionOrderAction,
  createProductionOrderAction,
  setBomAction,
} from "@/lib/products/actions";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { FilterDef } from "@/lib/datatable/types";
import type { BomLineRow, ProductionOrderListRow } from "@/lib/datasets/production";
import { ProductLinePicker, type ProductHit } from "@/app/(app)/orders/order-form-parts";
import { LineItemRow } from "./line-item-row";

const PRODUCTION_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-400/10 dark:text-red-300",
};

export function ProductionTab() {
  const table = useDataTable<ProductionOrderListRow>({
    endpoint: "/api/production",
    defaultSort: { id: "created_at", dir: "desc" },
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [bomOpen, setBomOpen] = useState(false);
  const [completing, setCompleting] = useState<ProductionOrderListRow | null>(null);
  const [busy, setBusy] = useState(false);

  async function complete() {
    if (!completing) return;
    setBusy(true);
    try {
      const result = await completeProductionOrderAction(completing.id);
      if (result.ok) {
        toast.success(
          `${completing.code} completed — consumed components, produced ${completing.quantity} unit(s). Total cost ${formatMoney(result.data.totalCostCents)}.`,
        );
        table.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(false);
      setCompleting(null);
    }
  }

  const columns: DataTableColumn<ProductionOrderListRow>[] = [
    {
      id: "code",
      header: "Order",
      sortable: true,
      cell: (r) => <span className="font-medium tabular-nums">{r.code}</span>,
    },
    {
      id: "product",
      header: "Finished product",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.products?.name ?? "—"}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{r.products?.sku}</p>
        </div>
      ),
    },
    { id: "quantity", header: "Qty", align: "right", cell: (r) => <span className="tabular-nums">{r.quantity}</span> },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PRODUCTION_BADGE[r.status] ?? ""}`}
        >
          {r.status.replace("_", " ")}
        </span>
      ),
    },
    {
      id: "cost",
      header: "Total cost",
      align: "right",
      hideBelow: "md",
      cell: (r) => (
        <span className="text-muted-foreground tabular-nums">
          {r.total_cost_cents > 0 ? formatMoney(r.total_cost_cents) : "—"}
        </span>
      ),
    },
    {
      id: "completed_at",
      header: "Completed",
      hideBelow: "lg",
      cell: (r) => (
        <span className="text-muted-foreground">
          {r.completed_at ? formatDateTime(r.completed_at) : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (r) =>
        r.status === "in_progress" || r.status === "draft" ? (
          <Can permission="production.manage">
            <Button
              size="xs"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setCompleting(r);
              }}
            >
              <CheckCircle2 /> Complete
            </Button>
          </Can>
        ) : null,
    },
  ];

  const filters: FilterDef[] = [
    {
      type: "select",
      id: "status",
      label: "Status",
      options: ["draft", "in_progress", "completed", "cancelled"].map((s) => ({
        value: s,
        label: s.replace("_", " "),
      })),
    },
  ];

  return (
    <>
      <DataTable
        table={table}
        columns={columns}
        getRowId={(r) => r.id}
        filterDefs={filters}
        searchPlaceholder="Search production code…"
        emptyIcon={Factory}
        emptyTitle="No production orders"
        emptyDescription="Define a bill of materials, then start a production run to convert components into finished goods."
        toolbar={
          <Can permission="production.manage">
            <Button variant="outline" size="sm" onClick={() => setBomOpen(true)}>
              <ListTree /> Bill of materials
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus /> New production order
            </Button>
          </Can>
        }
      />

      <CreateProductionDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={table.refresh} />
      <BomDialog open={bomOpen} onOpenChange={setBomOpen} />

      <AlertDialog open={!!completing} onOpenChange={(o) => !busy && !o && setCompleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete {completing?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Consumes the BOM components for {completing?.quantity} unit(s) (negative Production
              movements), adds the finished goods to stock, and records material + labor +
              packaging + overhead costs — all in one transaction.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void complete();
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              Complete production
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CreateProductionDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [product, setProduct] = useState<ProductHit | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [labor, setLabor] = useState("");
  const [packaging, setPackaging] = useState("");
  const [overhead, setOverhead] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setProduct(null);
      setQuantity("1");
      setLabor("");
      setPackaging("");
      setOverhead("");
    }
  }, [open]);

  async function save() {
    if (!product) {
      toast.error("Pick the finished product");
      return;
    }
    setSaving(true);
    try {
      const result = await createProductionOrderAction({
        productId: product.id,
        quantity: Number(quantity) || 1,
        laborCostCents: labor || 0,
        packagingCostCents: packaging || 0,
        overheadCostCents: overhead || 0,
        notes: "",
      } as never);
      if (result.ok) {
        toast.success(`Production order ${result.data.code} started`);
        onOpenChange(false);
        onSaved?.();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New production order</DialogTitle>
          <DialogDescription>
            The finished product must have a bill of materials; completing the run consumes
            components per unit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Finished product</Label>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate rounded-md border border-input bg-muted/30 px-2.5 py-2 text-sm">
                {product ? (
                  <>
                    <span className="font-medium">{product.name}</span>{" "}
                    <span className="text-xs text-muted-foreground">{product.sku}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Pick a product →</span>
                )}
              </div>
              <ProductLinePicker linked={false} onPick={setProduct} onUnlink={() => undefined} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-qty">Quantity to produce</Label>
            <Input id="prod-qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prod-labor">Labor</Label>
              <Input id="prod-labor" type="number" min={0} step="0.01" placeholder="0.00" value={labor} onChange={(e) => setLabor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-pack">Packaging</Label>
              <Input id="prod-pack" type="number" min={0} step="0.01" placeholder="0.00" value={packaging} onChange={(e) => setPackaging(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-over">Overhead</Label>
              <Input id="prod-over" type="number" min={0} step="0.01" placeholder="0.00" value={overhead} onChange={(e) => setOverhead(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Start production
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BomEditLine {
  key: string;
  product: ProductHit | null;
  quantityPerUnit: string;
}

function BomDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [finished, setFinished] = useState<ProductHit | null>(null);
  const [lines, setLines] = useState<BomEditLine[]>([]);
  const [saving, setSaving] = useState(false);

  const bomQuery = useQuery({
    queryKey: ["bom", finished?.id],
    enabled: !!finished,
    queryFn: async (): Promise<BomLineRow[]> => {
      const res = await fetch(`/api/production/bom?product=${finished!.id}`);
      const body = (await res.json()) as { ok: boolean; data?: { lines: BomLineRow[] } };
      return body.ok && body.data ? body.data.lines : [];
    },
  });

  useEffect(() => {
    if (!open) {
      setFinished(null);
      setLines([]);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (bomQuery.data) {
      setLines(
        bomQuery.data.map((l) => ({
          key: l.id,
          product: l.component
            ? {
                id: l.component.id,
                sku: l.component.sku,
                name: l.component.name,
                selling_price_cents: 0,
                current_stock: l.component.current_stock,
              }
            : null,
          quantityPerUnit: String(l.quantity_per_unit),
        })),
      );
    }
  }, [bomQuery.data]);

  async function save() {
    if (!finished) return;
    const valid = lines.filter((l) => l.product && Number(l.quantityPerUnit) > 0);
    setSaving(true);
    try {
      const result = await setBomAction(
        finished.id,
        valid.map((l) => ({ componentProductId: l.product!.id, quantityPerUnit: Number(l.quantityPerUnit) })),
      );
      if (result.ok) {
        toast.success(`Bill of materials saved (${valid.length} component(s))`);
        void queryClient.invalidateQueries({ queryKey: ["bom"] });
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bill of materials</DialogTitle>
          <DialogDescription>
            Components consumed per unit when a production order completes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Finished product</Label>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 truncate rounded-md border border-input bg-muted/30 px-2.5 py-2 text-sm">
                {finished ? (
                  <>
                    <span className="font-medium">{finished.name}</span>{" "}
                    <span className="text-xs text-muted-foreground">{finished.sku}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Pick a product →</span>
                )}
              </div>
              <ProductLinePicker linked={false} onPick={setFinished} onUnlink={() => undefined} />
            </div>
          </div>

          {finished ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Components (per unit)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    setLines((prev) => [
                      ...prev,
                      { key: crypto.randomUUID(), product: null, quantityPerUnit: "1" },
                    ])
                  }
                >
                  <Plus /> Add component
                </Button>
              </div>
              {bomQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading current BOM…</p>
              ) : lines.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                  No components yet — add the parts this product is made from.
                </p>
              ) : (
                lines.map((line) => (
                  <LineItemRow
                    key={line.key}
                    product={line.product}
                    secondary={(p) => (
                      <span className="text-xs text-muted-foreground">{p.current_stock} in stock</span>
                    )}
                    emptyLabel="Pick component →"
                    onPick={(p) =>
                      setLines((prev) => prev.map((l) => (l.key === line.key ? { ...l, product: p } : l)))
                    }
                    onRemove={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                    removeLabel="Remove component"
                    className="grid-cols-[1fr_32px_88px_32px]"
                  >
                    <Input
                      type="number"
                      min={0}
                      step="0.001"
                      aria-label="Quantity per unit"
                      value={line.quantityPerUnit}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l) => (l.key === line.key ? { ...l, quantityPerUnit: e.target.value } : l)),
                        )
                      }
                    />
                  </LineItemRow>
                ))
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !finished}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save BOM
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
