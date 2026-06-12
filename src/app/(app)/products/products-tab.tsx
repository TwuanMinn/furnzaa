"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { Boxes, PackagePlus, Tags } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/datatable/data-table";
import { useDataTable } from "@/lib/datatable/use-data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/lib/rbac/context";
import { getBrowserClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import type { FilterDef } from "@/lib/datatable/types";
import type { ProductListRow } from "@/lib/datasets/products";
import type { CategoryOption, WarehouseOption } from "./page";
import { CategoryDialog, ProductFormDialog } from "./product-dialogs";
import { ProductDetailSheet } from "./product-detail-sheet";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "discontinued", label: "Discontinued" },
];

export function ProductsTab({
  categories,
  warehouses,
}: {
  categories: CategoryOption[];
  warehouses: WarehouseOption[];
}) {
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const table = useDataTable<ProductListRow>({
    endpoint: "/api/products",
    defaultSort: { id: "created_at", dir: "desc" },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [detail, setDetail] = useState<ProductListRow | null>(null);

  // LIVE stock: any products UPDATE (movement RPCs touch current_stock)
  // refreshes the visible page — stock numbers tick without a reload.
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel("products-stock")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "products" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const columns: DataTableColumn<ProductListRow>[] = [
    {
      id: "name",
      header: "Product",
      sortable: true,
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          {r.image_url ? (
            <Image
              src={r.image_url}
              alt=""
              width={32}
              height={32}
              unoptimized
              className="size-8 rounded-md border border-border object-cover"
            />
          ) : (
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <Boxes className="size-4" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{r.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {r.product_categories?.name ?? "Uncategorised"}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "sku",
      header: "SKU",
      sortable: true,
      hideBelow: "md",
      cell: (r) => <span className="font-mono text-xs">{r.sku}</span>,
    },
    {
      id: "selling_price_cents",
      header: "Price",
      sortable: true,
      align: "right",
      cell: (r) => <span className="tabular-nums">{formatMoney(r.selling_price_cents)}</span>,
    },
    {
      id: "cost",
      header: "Cost",
      align: "right",
      hideBelow: "lg",
      cell: (r) => (
        <span className="text-muted-foreground tabular-nums">{formatMoney(r.cost_price_cents)}</span>
      ),
    },
    {
      id: "current_stock",
      header: "Stock",
      sortable: true,
      align: "right",
      cell: (r) => (
        <motion.span
          key={`${r.id}-${r.current_stock}`}
          initial={reduce ? false : { scale: 1.25, color: "var(--primary)" }}
          animate={{ scale: 1, color: "inherit" }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="inline-block font-medium tabular-nums"
        >
          {r.current_stock.toLocaleString()}
        </motion.span>
      ),
    },
    {
      id: "stock_level",
      header: "Level",
      cell: (r) =>
        r.low_stock ? (
          <Badge className="bg-red-100 text-red-700 ring-red-600/20 dark:bg-red-400/10 dark:text-red-300">
            Low (≤{r.minimum_stock})
          </Badge>
        ) : (
          <Badge className="bg-emerald-100 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300">
            In stock
          </Badge>
        ),
    },
    {
      id: "status",
      header: "Status",
      hideBelow: "lg",
      cell: (r) => (
        <Badge variant={r.status === "active" ? "secondary" : "outline"}>
          {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
        </Badge>
      ),
    },
  ];

  const filters: FilterDef[] = [
    {
      type: "select",
      id: "category",
      label: "Category",
      options: categories.map((c) => ({ value: c.id, label: c.name })),
    },
    { type: "select", id: "status", label: "Status", options: STATUS_OPTIONS },
    {
      type: "select",
      id: "stock",
      label: "Stock",
      options: [{ value: "low", label: "Low stock" }],
    },
  ];

  return (
    <>
      <DataTable
        table={table}
        columns={columns}
        getRowId={(r) => r.id}
        filterDefs={filters}
        searchPlaceholder="Search name, SKU, barcode…"
        exportDataset="products"
        importDataset="products"
        onRowClick={setDetail}
        emptyIcon={Boxes}
        emptyTitle="No products found"
        emptyDescription="Adjust filters, add a product, or import the catalog from CSV."
        toolbar={
          <Can permission="products.create">
            <Button variant="outline" size="sm" onClick={() => setCategoryOpen(true)}>
              <Tags /> New category
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <PackagePlus /> New product
            </Button>
          </Can>
        }
      />

      <ProductFormDialog
        mode="create"
        categories={categories}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={table.refresh}
      />
      <CategoryDialog open={categoryOpen} onOpenChange={setCategoryOpen} />
      <ProductDetailSheet
        product={detail}
        categories={categories}
        warehouses={warehouses}
        onOpenChange={(open) => !open && setDetail(null)}
        onChanged={table.refresh}
      />
    </>
  );
}
