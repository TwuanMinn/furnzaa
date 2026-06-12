"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PackagePlus, PackageSearch } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/datatable/data-table";
import { useDataTable } from "@/lib/datatable/use-data-table";
import { Button } from "@/components/ui/button";
import { PrintChip } from "@/components/print/print-chip";
import { StatusBadge, PriorityBadge, PaymentBadge } from "@/components/ui/status-badge";
import { Can } from "@/lib/rbac/context";
import { formatDate, formatMinutes, formatMoney } from "@/lib/format";
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
import { PAYMENT_STATUSES } from "@/lib/orders/schemas";

interface OrdersTableProps {
  statuses: OrderStatusDef[];
  priorities: OrderPriorityDef[];
  printers: PrinterDef[];
  materials: MaterialTypeDef[];
}

export function OrdersTable({ statuses, priorities, printers, materials }: OrdersTableProps) {
  const router = useRouter();
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
      cell: (r) => <span className="text-muted-foreground">{r.assigned?.full_name ?? "—"}</span>,
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
    <DataTable
      table={table}
      columns={columns}
      getRowId={(r) => r.id}
      filterDefs={filters}
      searchPlaceholder="Search code, customer, phone, email…"
      exportDataset="orders"
      importDataset="orders"
      onRowClick={(r) => router.push(`/orders/${r.id}`)}
      emptyIcon={PackageSearch}
      emptyTitle="No orders found"
      emptyDescription="Adjust the search or filters, create an order, or import historical orders from CSV."
      toolbar={
        <Can permission="orders.create">
          <Button size="sm" onClick={() => router.push("/orders/new")}>
            <PackagePlus /> New order
          </Button>
        </Can>
      }
    />
  );
}
