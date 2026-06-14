"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  FileText,
  Loader2,
  PackagePlus,
  PackageSearch,
  Printer,
  RotateCcw,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { DataTable, type DataTableColumn } from "@/components/datatable/data-table";
import { useDataTable } from "@/lib/datatable/use-data-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PrintChip } from "@/components/print/print-chip";
import { StatusBadge, PriorityBadge, PaymentBadge } from "@/components/ui/status-badge";
import { Can, usePermissions } from "@/lib/rbac/context";
import { downloadFromFetch } from "@/lib/export/csv";
import { formatDate, formatMinutes, formatMoney, toDateKey } from "@/lib/format";
import { badgeClass } from "@/lib/badges";
import type { FilterDef } from "@/lib/datatable/types";
import type { OrderListRow } from "@/lib/datasets/orders";
import type {
  MaterialTypeDef,
  OrderPriorityDef,
  OrderStatusDef,
  PrinterDef,
} from "@/lib/orders/config";
import type { StaffOption } from "@/app/api/staff/route";
import { PAYMENT_STATUSES, type BulkOrderAction } from "@/lib/orders/schemas";
import { bulkOrderActionsAction } from "@/lib/orders/actions";
import { OrdersBulkActionDialog } from "./bulk-action-dialog";

/** Radix Select needs a non-empty value, so "Unassigned" rides a sentinel. */
const UNASSIGNED = "__unassigned__";

/**
 * Inline assignee picker for the orders list — reassign a row without opening
 * it. Reuses bulkOrderActionsAction (single id), which gates on orders.assign,
 * notifies the new assignee, and logs the change. stopPropagation keeps the
 * row's click-to-open from firing; the trigger is controlled by the row's
 * current value and shows a saving spinner until the refetch lands.
 */
function AssigneeCell({
  orderId,
  currentId,
  currentName,
  staff,
  onChanged,
}: {
  orderId: string;
  currentId: string | null;
  currentName: string | null;
  staff: StaffOption[];
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);

  // Keep the current assignee selectable even if they've dropped off the
  // active-staff list (deactivated, role changed) — otherwise the trigger
  // would render blank.
  const options =
    currentId && currentName && !staff.some((s) => s.id === currentId)
      ? [{ id: currentId, full_name: currentName }, ...staff]
      : staff;

  async function change(next: string) {
    const assignedStaffId = next === UNASSIGNED ? null : next;
    if ((currentId ?? null) === assignedStaffId) return; // no-op reselect
    setPending(true);
    try {
      const result = await bulkOrderActionsAction({
        action: "assign",
        orderIds: [orderId],
        assignedStaffId,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        assignedStaffId
          ? `Assigned to ${options.find((s) => s.id === assignedStaffId)?.full_name ?? "teammate"}`
          : "Order unassigned",
      );
      onChanged();
    } finally {
      setPending(false);
    }
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Select
        value={currentId ?? UNASSIGNED}
        onValueChange={(v) => void change(v)}
        disabled={pending}
      >
        <SelectTrigger
          size="sm"
          aria-label="Assigned to"
          className="w-full max-w-[170px] border-0 bg-transparent px-1.5 shadow-none hover:bg-muted dark:bg-transparent dark:hover:bg-muted/50"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
          {options.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface OrdersTableProps {
  statuses: OrderStatusDef[];
  priorities: OrderPriorityDef[];
  printers: PrinterDef[];
  materials: MaterialTypeDef[];
}

export function OrdersTable({ statuses, priorities, printers, materials }: OrdersTableProps) {
  const router = useRouter();
  const canAssign = usePermissions().has("orders.assign");
  const table = useDataTable<OrderListRow>({
    endpoint: "/api/orders",
    defaultSort: { id: "created_at", dir: "desc" },
  });

  // Staff options for the "Assigned to" filter (small, cached).
  const { data: staffData } = useQuery({
    queryKey: ["/api/staff"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch("/api/staff");
      const body = (await res.json()) as { ok: boolean; data?: { staff: StaffOption[] } };
      return body.ok ? (body.data?.staff ?? []) : [];
    },
  });

  const [bulkState, setBulkState] = useState<{ action: BulkOrderAction; ids: string[] } | null>(
    null,
  );
  const [exportingSelected, setExportingSelected] = useState(false);

  // Recycle-bin view: drives the dataset's `deleted` filter (shows is_active=false
  // rows). Derived from the live filter so it can't desync from "Clear filters".
  const showDeleted = table.filters["deleted"] === "true";

  async function exportSelected(format: "csv" | "pdf", ids: string[], clear: () => void) {
    setExportingSelected(true);
    try {
      const params = new URLSearchParams({ format, f_ids: ids.join(",") });
      await downloadFromFetch(
        `/api/export/orders?${params}`,
        `orders-selected-${toDateKey()}.${format}`,
      );
      toast.success(`Exported ${ids.length} order(s) as ${format.toUpperCase()}`);
      clear();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportingSelected(false);
    }
  }

  // Print just the selected rows: the print view reads the same `f_ids` filter
  // the export route does, so the document matches the selection exactly.
  function printSelected(ids: string[], clear: () => void) {
    const params = new URLSearchParams({ f_ids: ids.join(",") });
    window.open(`/print/orders?${params}`, "_blank", "noopener");
    clear();
  }

  const statusMap = new Map(statuses.map((s) => [s.key, s]));
  const priorityMap = new Map(priorities.map((p) => [p.key, p]));

  const columns: DataTableColumn<OrderListRow>[] = [
    {
      id: "order_code",
      header: "Order",
      sortable: true,
      cell: (r) => <span className="font-medium tabular-nums">{r.order_code}</span>,
    },
    {
      id: "customer",
      header: "Customer",
      cell: (r) => <span className="truncate">{r.customers?.name ?? "—"}</span>,
    },
    {
      id: "product",
      header: "Product",
      hideBelow: "md",
      cell: (r) => {
        const items = [...(r.order_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
        const first = items[0];
        if (!first) return <span className="text-muted-foreground">—</span>;
        const extra = items.length - 1;
        return (
          <span className="flex items-center gap-1.5" title={items.map((i) => i.name).join(", ")}>
            <span className="max-w-[180px] truncate">{first.name}</span>
            {extra > 0 ? (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                +{extra}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      id: "quantity",
      header: "Qty",
      hideBelow: "md",
      align: "right",
      cell: (r) => {
        const items = r.order_items ?? [];
        if (items.length === 0) return <span className="text-muted-foreground">—</span>;
        const total = items.reduce((sum, i) => sum + i.quantity, 0);
        return <span className="tabular-nums">{total}</span>;
      },
    },
    {
      id: "buying_date",
      header: "Bought",
      sortable: true,
      hideBelow: "md",
      cell: (r) => <span className="text-muted-foreground">{formatDate(r.buying_date)}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => {
        const def = statusMap.get(r.status);
        return <StatusBadge status={r.status} color={def?.color} label={def?.label} />;
      },
    },
    {
      id: "priority",
      header: "Priority",
      hideBelow: "sm",
      cell: (r) => {
        const def = priorityMap.get(r.priority);
        return <PriorityBadge priority={r.priority} color={def?.color} label={def?.label} />;
      },
    },
    {
      id: "payment",
      header: "Payment",
      hideBelow: "lg",
      cell: (r) => <PaymentBadge status={r.payment_status} />,
    },
    {
      id: "printer",
      header: "Printer",
      hideBelow: "lg",
      cell: (r) => {
        if (!r.printers) return <span className="text-muted-foreground">—</span>;
        return (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeClass(r.printers.badge_color)}`}
            title={`${r.printers.brand} ${r.printers.model}`}
          >
            {r.printers.model}
          </span>
        );
      },
    },
    {
      id: "actual_print_minutes",
      header: "Print time",
      sortable: true,
      hideBelow: "lg",
      align: "right",
      cell: (r) =>
        r.print_state === "printing" || r.print_state === "failed" ? (
          <PrintChip
            state={r.print_state}
            startedAt={r.print_started_at}
            estimatedMinutes={r.estimated_print_minutes}
            actualMinutes={r.actual_print_minutes}
          />
        ) : (
          <span className="text-muted-foreground tabular-nums">
            {formatMinutes(r.actual_print_minutes)}
          </span>
        ),
    },
    {
      id: "total_cents",
      header: "Total",
      sortable: true,
      align: "right",
      cell: (r) => <span className="tabular-nums">{formatMoney(r.total_cents, r.currency)}</span>,
    },
    {
      id: "assigned",
      header: "Assigned to",
      hideBelow: "lg",
      cell: (r) =>
        canAssign ? (
          <AssigneeCell
            orderId={r.id}
            currentId={r.assigned?.id ?? null}
            currentName={r.assigned?.full_name ?? null}
            staff={staffData ?? []}
            onChanged={table.refresh}
          />
        ) : (
          <span className="text-muted-foreground">{r.assigned?.full_name ?? "—"}</span>
        ),
    },
  ];

  const filters: FilterDef[] = [
    {
      type: "select",
      id: "status",
      label: "Status",
      options: statuses.map((s) => ({ value: s.key, label: s.label })),
    },
    {
      type: "select",
      id: "priority",
      label: "Priority",
      options: priorities.map((p) => ({ value: p.key, label: p.label })),
    },
    {
      type: "select",
      id: "payment_status",
      label: "Payment",
      options: PAYMENT_STATUSES.map((p) => ({ value: p.value, label: p.label })),
    },
    {
      type: "select",
      id: "assigned",
      label: "Assigned",
      options: (staffData ?? []).map((s) => ({ value: s.id, label: s.full_name })),
    },
    {
      type: "select",
      id: "printer",
      label: "Printer",
      options: printers.map((p) => ({ value: p.id, label: `${p.brand} ${p.model}` })),
    },
    {
      type: "select",
      id: "material",
      label: "Material",
      options: materials.map((m) => ({ value: m.key, label: m.label })),
    },
    {
      type: "select",
      id: "print_state",
      label: "Print state",
      options: [
        { value: "not_started", label: "Not started" },
        { value: "printing", label: "Printing" },
        { value: "completed", label: "Print completed" },
        { value: "failed", label: "Print failed" },
      ],
    },
    { type: "daterange", id: "buying_date", label: "Bought between" },
  ];

  return (
    <>
      <DataTable
        table={table}
        columns={columns}
        getRowId={(r) => r.id}
        filterDefs={filters}
        searchPlaceholder="Search code, customer, phone, email…"
        exportDataset="orders"
        importDataset="orders"
        selectable
        onRowClick={(r) => router.push(`/orders/${r.id}`)}
        emptyIcon={PackageSearch}
        emptyTitle="No orders found"
        emptyDescription="Adjust the search or filters, create an order, or import historical orders from CSV."
        bulkActions={(ids, clear) => (
          <>
            {showDeleted ? (
              <Can permission="orders.delete">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setBulkState({ action: "restore", ids })}
                >
                  <RotateCcw /> Restore
                </Button>
              </Can>
            ) : (
              <Can permission="orders.assign">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkState({ action: "assign", ids })}
                >
                  <UserPlus /> Assign
                </Button>
              </Can>
            )}
            <Can permission="orders.export">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={exportingSelected}>
                    {exportingSelected ? <Loader2 className="animate-spin" /> : <Download />} Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>{ids.length} selected</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void exportSelected("csv", ids, clear)}>
                    <Download /> Export CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void exportSelected("pdf", ids, clear)}>
                    <FileText /> Export PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => printSelected(ids, clear)}>
                    <Printer /> Print
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Can>
            {!showDeleted ? (
              <Can permission="orders.delete">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setBulkState({ action: "delete", ids })}
                >
                  <Trash2 /> Delete
                </Button>
              </Can>
            ) : null}
          </>
        )}
        toolbar={
          <>
            <Can permission="orders.delete">
              <Button
                size="sm"
                variant={showDeleted ? "secondary" : "outline"}
                onClick={() => table.setFilter("deleted", showDeleted ? "" : "true")}
              >
                {showDeleted ? <RotateCcw /> : <Trash2 />}
                {showDeleted ? "Show active" : "Recycle bin"}
              </Button>
            </Can>
            <Can permission="orders.create">
              <Button size="sm" onClick={() => router.push("/orders/new")}>
                <PackagePlus /> New order
              </Button>
            </Can>
          </>
        }
      />
      <OrdersBulkActionDialog
        state={bulkState}
        staff={staffData ?? []}
        onOpenChange={(o) => {
          if (!o) setBulkState(null);
        }}
        onDone={() => {
          table.clearSelection();
          table.refresh();
        }}
      />
    </>
  );
}
