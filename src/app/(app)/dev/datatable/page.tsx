import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { PageHeader } from "@/components/states";
import { CustomersDemoTable } from "./customers-demo-table";

export const metadata = { title: "DataTable demo — Furnza" };

/**
 * Phase 3 demo: exercises the reusable DataTable (server cursor pagination,
 * debounced search, filters, sort, selection) plus the shared export
 * (CSV/PDF/print) and CSV-import services against the customers dataset.
 * Dev-only page — not in the sidebar.
 */
export default async function DataTableDemoPage() {
  const user = await getSessionUser();
  if (!user || !user.permissions.has("customers.view")) redirect("/dashboard");

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="DataTable demo"
        description="Reusable list engine: keyword search, filters, sortable columns, keyset cursor pagination, selection, export (CSV/PDF/print) and batched CSV import."
      />
      <CustomersDemoTable />
    </div>
  );
}
