"use client";

import { useState } from "react";
import { ArrowDownUp, History } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/datatable/data-table";
import { useDataTable } from "@/lib/datatable/use-data-table";
import { Can } from "@/lib/rbac/context";
import { formatDateTime, truncate } from "@/lib/format";
import type { FilterDef } from "@/lib/datatable/types";
import type { MovementListRow } from "@/lib/datasets/inventory";
import type { WarehouseOption } from "./page";
import type { ProductHit } from "@/app/(app)/orders/order-form-parts";
import { ProductLinePicker } from "@/app/(app)/orders/order-form-parts";
import { AdjustStockDialog } from "./adjust-stock-dialog";

const TYPE_BADGE: Record<string, string> = {
  purchase: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
  sale: "bg-blue-100 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300",
  production: "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300",
  adjustment: "bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300",
  transfer: "bg-slate-100 text-slate-700 dark:bg-slate-400/10 dark:text-slate-300",
  return: "bg-violet-100 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300",
};

const MOVEMENT_TYPES = ["purchase", "sale", "production", "adjustment", "transfer", "return"];

/** The append-only stock ledger + "record movement" entry point. */
export function MovementsTab({ warehouses }: { warehouses: WarehouseOption[] }) {
  const table = useDataTable<MovementListRow>({
    endpoint: "/api/inventory/movements",
    defaultSort: { id: "created_at", dir: "desc" },
  });

  const [adjustFor, setAdjustFor] = useState<ProductHit | null>(null);

  const columns: DataTableColumn<MovementListRow>[] = [
    {
      id: "created_at",
      header: "When",
      sortable: true,
      cell: (r) => (
        <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.created_at)}</span>
      ),
    },
    {
      id: "product",
      header: "Product",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.products?.name ?? "—"}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{r.products?.sku}</p>
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: (r) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[r.movement_type] ?? ""}`}
        >
          {r.movement_type}
        </span>
      ),
    },
    {
      id: "quantity",
      header: "Δ Qty",
      align: "right",
      cell: (r) => (
        <span
          className={`font-medium tabular-nums ${r.quantity > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
        >
          {r.quantity > 0 ? "+" : ""}
          {r.quantity}
        </span>
      ),
    },
    {
      id: "stock",
      header: "Stock",
      align: "right",
      hideBelow: "md",
      cell: (r) => (
        <span className="text-muted-foreground tabular-nums">
          {r.previous_stock} → {r.new_stock}
        </span>
      ),
    },
    {
      id: "reference",
      header: "Source",
      hideBelow: "lg",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.reference_type ? r.reference_type.replace(/_/g, " ") : "manual"}
          {r.notes ? ` · ${truncate(r.notes, 30)}` : ""}
        </span>
      ),
    },
    {
      id: "by",
      header: "By",
      hideBelow: "lg",
      cell: (r) => <span className="text-muted-foreground">{r.users?.full_name ?? "System"}</span>,
    },
  ];

  const filters: FilterDef[] = [
    {
      type: "select",
      id: "movement_type",
      label: "Type",
      options: MOVEMENT_TYPES.map((t) => ({ value: t, label: t })),
    },
    { type: "daterange", id: "created_at", label: "Between" },
  ];

  return (
    <>
      <DataTable
        table={table}
        columns={columns}
        getRowId={(r) => r.id}
        filterDefs={filters}
        searchPlaceholder="Search notes…"
        exportDataset="inventory-movements"
        emptyIcon={History}
        emptyTitle="No movements yet"
        emptyDescription="Sales, purchases, production and adjustments will appear here."
        toolbar={
          <Can permission="inventory.adjust">
            <div
              className="flex items-center gap-1 rounded-md border border-input bg-background py-0.5 pr-0.5 pl-2.5 shadow-xs"
              title="Pick a product to record a movement"
            >
              <ArrowDownUp className="size-4 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">Record movement</span>
              <ProductLinePicker linked={false} onPick={setAdjustFor} onUnlink={() => undefined} />
            </div>
          </Can>
        }
      />

      <AdjustStockDialog
        open={!!adjustFor}
        onOpenChange={(open) => !open && setAdjustFor(null)}
        product={adjustFor}
        warehouses={warehouses}
        onAdjusted={table.refresh}
      />
    </>
  );
}
