/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2, PackageCheck, Plus, Trash2, XCircle } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Can } from "@/lib/rbac/context";
import {
  cancelPurchaseOrderAction,
  createPurchaseOrderAction,
  receivePurchaseOrderAction,
} from "@/lib/products/actions";
import { formatDate, formatMoney } from "@/lib/format";
import type { FilterDef } from "@/lib/datatable/types";
import type { PurchaseOrderItemRow, PurchaseOrderListRow } from "@/lib/datasets/purchase-orders";
import type { SupplierListRow } from "@/lib/datasets/suppliers";
import { ProductLinePicker, type ProductHit } from "@/app/(app)/orders/order-form-parts";

const PO_STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300",
  ordered: "bg-blue-100 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
  received: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-400/10 dark:text-red-300",
};

export function PurchaseOrdersTab() {
  const table = useDataTable<PurchaseOrderListRow>({
    endpoint: "/api/purchase-orders",
    defaultSort: { id: "created_at", dir: "desc" },
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<PurchaseOrderListRow | null>(null);

  // Supplier options for the filter + create form (small list).
  const { data: suppliers } = useQuery({
    queryKey: ["/api/suppliers", "options"],
    staleTime: 60_000,
    queryFn: async (): Promise<SupplierListRow[]> => {
      const res = await fetch("/api/suppliers?limit=50");
      const body = (await res.json()) as { ok: boolean; data?: { rows: SupplierListRow[] } };
      return body.ok && body.data ? body.data.rows : [];
    },
  });

  const columns: DataTableColumn<PurchaseOrderListRow>[] = [
    {
      id: "po_number",
      header: "PO",
      sortable: true,
      cell: (r) => <span className="font-medium tabular-nums">{r.po_number}</span>,
    },
    { id: "supplier", header: "Supplier", cell: (r) => r.suppliers?.company_name ?? "—" },
    {
      id: "order_date",
      header: "Ordered",
      sortable: true,
      hideBelow: "md",
      cell: (r) => <span className="text-muted-foreground">{formatDate(r.order_date)}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PO_STATUS_BADGE[r.status] ?? ""}`}
        >
          {r.status}
        </span>
      ),
    },
    {
      id: "total_cost_cents",
      header: "Total",
      sortable: true,
      align: "right",
      cell: (r) => <span className="tabular-nums">{formatMoney(r.total_cost_cents)}</span>,
    },
    {
      id: "by",
      header: "Created by",
      hideBelow: "lg",
      cell: (r) => <span className="text-muted-foreground">{r.created_by_user?.full_name ?? "—"}</span>,
    },
  ];

  const filters: FilterDef[] = [
    {
      type: "select",
      id: "status",
      label: "Status",
      options: ["draft", "ordered", "received", "cancelled"].map((s) => ({ value: s, label: s })),
    },
    {
      type: "select",
      id: "supplier",
      label: "Supplier",
      options: (suppliers ?? []).map((s) => ({ value: s.id, label: s.company_name })),
    },
    { type: "daterange", id: "order_date", label: "Ordered between" },
  ];

  return (
    <>
      <DataTable
        table={table}
        columns={columns}
        getRowId={(r) => r.id}
        filterDefs={filters}
        searchPlaceholder="Search PO number…"
        onRowClick={setDetail}
        emptyIcon={ClipboardList}
        emptyTitle="No purchase orders"
        emptyDescription="Create a PO to restock from a supplier — receiving it moves stock in atomically."
        toolbar={
          <Can permission="purchase_orders.create">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus /> New purchase order
            </Button>
          </Can>
        }
      />

      <CreatePoDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        suppliers={suppliers ?? []}
        onSaved={table.refresh}
      />
      <PoDetailSheet
        po={detail}
        onOpenChange={(open) => !open && setDetail(null)}
        onChanged={table.refresh}
      />
    </>
  );
}

interface PoLine {
  key: string;
  product: ProductHit | null;
  quantity: string;
  unitCost: string;
}

function CreatePoDialog({
  open,
  onOpenChange,
  suppliers,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: SupplierListRow[];
  onSaved?: () => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [lines, setLines] = useState<PoLine[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const d = new Date();
      setOrderDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
      setSupplierId("");
      setLines([{ key: crypto.randomUUID(), product: null, quantity: "1", unitCost: "" }]);
    }
  }, [open]);

  const totalCents = lines.reduce(
    (sum, l) => sum + Math.round((Number(l.unitCost) || 0) * 100) * (Number(l.quantity) || 0),
    0,
  );

  async function save() {
    if (!supplierId) {
      toast.error("Pick a supplier");
      return;
    }
    const items = lines
      .filter((l) => l.product && Number(l.quantity) > 0)
      .map((l) => ({
        productId: l.product!.id,
        quantity: Number(l.quantity),
        unitCostCents: l.unitCost,
      }));
    if (items.length === 0) {
      toast.error("Add at least one product line");
      return;
    }
    setSaving(true);
    try {
      const result = await createPurchaseOrderAction({
        supplierId,
        orderDate,
        items: items as never,
        notes: "",
      });
      if (result.ok) {
        toast.success(`Purchase order ${result.data.poNumber} created (Ordered)`);
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New purchase order</DialogTitle>
          <DialogDescription>
            The PO number is generated automatically. Receiving the PO later moves every line into
            stock atomically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="po-supplier">Supplier</Label>
              <Select value={supplierId || "__none__"} onValueChange={(v) => setSupplierId(v === "__none__" ? "" : v)}>
                <SelectTrigger id="po-supplier" className="w-full">
                  <SelectValue placeholder="Pick a supplier…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Pick a supplier…</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-date">Order date</Label>
              <Input id="po-date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Lines</Label>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { key: crypto.randomUUID(), product: null, quantity: "1", unitCost: "" },
                  ])
                }
              >
                <Plus /> Add line
              </Button>
            </div>
            {lines.map((line) => (
              <div key={line.key} className="grid grid-cols-[1fr_32px_64px_90px_32px] items-center gap-2">
                <div className="truncate rounded-md border border-input bg-muted/30 px-2.5 py-2 text-sm">
                  {line.product ? (
                    <>
                      <span className="font-medium">{line.product.name}</span>{" "}
                      <span className="text-xs text-muted-foreground">{line.product.sku}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Pick a product →</span>
                  )}
                </div>
                <ProductLinePicker
                  linked={false}
                  onPick={(p) =>
                    setLines((prev) =>
                      prev.map((l) =>
                        l.key === line.key
                          ? { ...l, product: p, unitCost: l.unitCost || (p.selling_price_cents / 200).toFixed(2) }
                          : l,
                      ),
                    )
                  }
                  onUnlink={() => undefined}
                />
                <Input
                  type="number"
                  min={1}
                  aria-label="Quantity"
                  value={line.quantity}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) => (l.key === line.key ? { ...l, quantity: e.target.value } : l)),
                    )
                  }
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Unit cost"
                  aria-label="Unit cost"
                  value={line.unitCost}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l) => (l.key === line.key ? { ...l, unitCost: e.target.value } : l)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove line"
                  disabled={lines.length === 1}
                  onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <p className="text-right text-sm">
              Total: <span className="font-semibold tabular-nums">{formatMoney(totalCents)}</span>
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Create PO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PoDetailSheet({
  po,
  onOpenChange,
  onChanged,
}: {
  po: PurchaseOrderListRow | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const [confirmReceive, setConfirmReceive] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const itemsQuery = useQuery({
    queryKey: ["po-items", po?.id],
    enabled: !!po,
    queryFn: async (): Promise<PurchaseOrderItemRow[]> => {
      const res = await fetch(`/api/purchase-orders/${po!.id}/items`);
      const body = (await res.json()) as { ok: boolean; data?: { items: PurchaseOrderItemRow[] } };
      return body.ok && body.data ? body.data.items : [];
    },
  });

  async function receive() {
    if (!po) return;
    setBusy("receive");
    try {
      const result = await receivePurchaseOrderAction(po.id);
      if (result.ok) {
        toast.success(`${po.po_number} received — ${result.data.lines} line(s) moved into stock`);
        onOpenChange(false);
        onChanged?.();
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(null);
      setConfirmReceive(false);
    }
  }

  async function cancel() {
    if (!po) return;
    setBusy("cancel");
    try {
      const result = await cancelPurchaseOrderAction(po.id);
      if (result.ok) {
        toast.success(`${po.po_number} cancelled`);
        onOpenChange(false);
        onChanged?.();
      } else {
        toast.error(result.error);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Sheet open={!!po} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {po ? (
            <>
              <SheetHeader>
                <SheetTitle className="text-left tabular-nums">{po.po_number}</SheetTitle>
                <SheetDescription className="text-left">
                  {po.suppliers?.company_name} · ordered {formatDate(po.order_date)}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-5 px-4 pb-6">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PO_STATUS_BADGE[po.status] ?? ""}`}
                  >
                    {po.status}
                  </span>
                  {po.received_at ? (
                    <Badge variant="outline">received {formatDate(po.received_at)}</Badge>
                  ) : null}
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-medium">Lines</h3>
                  {itemsQuery.isLoading ? (
                    <div className="space-y-1.5">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-10 w-full rounded-md" />
                      ))}
                    </div>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {(itemsQuery.data ?? []).map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-2"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{item.products?.name}</span>
                            <span className="block font-mono text-xs text-muted-foreground">
                              {item.products?.sku}
                            </span>
                          </span>
                          <span className="shrink-0 text-right tabular-nums">
                            {item.quantity} × {formatMoney(item.unit_cost_cents)}
                            <span className="block font-medium">{formatMoney(item.line_total_cents)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Separator className="my-3" />
                  <p className="text-right text-sm">
                    Total: <span className="font-semibold tabular-nums">{formatMoney(po.total_cost_cents)}</span>
                  </p>
                </div>

                {po.status === "ordered" ? (
                  <div className="flex flex-col gap-2">
                    <Can permission="purchase_orders.receive">
                      <Button className="justify-start" onClick={() => setConfirmReceive(true)}>
                        <PackageCheck /> Mark received (stock in)
                      </Button>
                    </Can>
                    <Can permission="purchase_orders.create">
                      <Button
                        variant="outline"
                        className="justify-start text-destructive hover:text-destructive"
                        disabled={busy === "cancel"}
                        onClick={() => void cancel()}
                      >
                        {busy === "cancel" ? <Loader2 className="animate-spin" /> : <XCircle />}
                        Cancel PO
                      </Button>
                    </Can>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmReceive} onOpenChange={(o) => !busy && setConfirmReceive(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Receive {po?.po_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every line is moved into stock as a Purchase movement in one atomic transaction, and
              the PO is stamped with who received it and when. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "receive"}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === "receive"}
              onClick={(e) => {
                e.preventDefault();
                void receive();
              }}
            >
              {busy === "receive" ? <Loader2 className="animate-spin" /> : null}
              Receive into stock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
