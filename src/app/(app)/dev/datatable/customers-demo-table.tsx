"use client";

import { UsersRound } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/datatable/data-table";
import { useDataTable } from "@/lib/datatable/use-data-table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import type { FilterDef } from "@/lib/datatable/types";

interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

const COLUMNS: DataTableColumn<CustomerRow>[] = [
  { id: "name", header: "Name", sortable: true, cell: (r) => <span className="font-medium">{r.name}</span> },
  { id: "email", header: "Email", cell: (r) => r.email ?? "—", hideBelow: "md" },
  { id: "phone", header: "Phone", cell: (r) => r.phone ?? "—", hideBelow: "lg" },
  {
    id: "status",
    header: "Status",
    cell: (r) => (
      <Badge variant={r.is_active ? "secondary" : "outline"}>
        {r.is_active ? "Active" : "Inactive"}
      </Badge>
    ),
  },
  {
    id: "created_at",
    header: "Created",
    sortable: true,
    cell: (r) => <span className="text-muted-foreground">{formatDateTime(r.created_at)}</span>,
  },
];

const FILTERS: FilterDef[] = [
  {
    type: "select",
    id: "status",
    label: "Status",
    options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ],
  },
  { type: "daterange", id: "created_at", label: "Created between" },
];

export function CustomersDemoTable() {
  const table = useDataTable<CustomerRow>({
    endpoint: "/api/customers",
    defaultSort: { id: "created_at", dir: "desc" },
  });

  return (
    <DataTable
      table={table}
      columns={COLUMNS}
      getRowId={(r) => r.id}
      filterDefs={FILTERS}
      searchPlaceholder="Search name, email, phone…"
      exportDataset="customers"
      importDataset="customers"
      selectable
      emptyIcon={UsersRound}
      emptyTitle="No customers found"
      emptyDescription="Adjust the search or filters, or import customers from CSV."
    />
  );
}
