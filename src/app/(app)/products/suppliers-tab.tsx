"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Factory, Loader2, Plus } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Can } from "@/lib/rbac/context";
import { createSupplierAction, updateSupplierAction } from "@/lib/products/actions";
import { supplierSchema, type SupplierInput } from "@/lib/products/schemas";
import { formatDate } from "@/lib/format";
import type { SupplierListRow } from "@/lib/datasets/suppliers";

export function SuppliersTab() {
  const table = useDataTable<SupplierListRow>({
    endpoint: "/api/suppliers",
    defaultSort: { id: "company_name", dir: "asc" },
  });

  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; supplier: SupplierListRow } | null>(null);

  const columns: DataTableColumn<SupplierListRow>[] = [
    {
      id: "company_name",
      header: "Company",
      sortable: true,
      cell: (r) => <span className="font-medium">{r.company_name}</span>,
    },
    { id: "contact_name", header: "Contact", hideBelow: "md", cell: (r) => r.contact_name ?? "—" },
    { id: "email", header: "Email", hideBelow: "md", cell: (r) => r.email ?? "—" },
    { id: "phone", header: "Phone", hideBelow: "lg", cell: (r) => r.phone ?? "—" },
    {
      id: "created_at",
      header: "Added",
      sortable: true,
      hideBelow: "lg",
      cell: (r) => <span className="text-muted-foreground">{formatDate(r.created_at)}</span>,
    },
  ];

  return (
    <>
      <DataTable
        table={table}
        columns={columns}
        getRowId={(r) => r.id}
        searchPlaceholder="Search company, contact, email…"
        onRowClick={(r) => setDialog({ mode: "edit", supplier: r })}
        emptyIcon={Factory}
        emptyTitle="No suppliers yet"
        emptyDescription="Add the companies you purchase stock and materials from."
        toolbar={
          <Can permission="suppliers.view">
            <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
              <Plus /> Add supplier
            </Button>
          </Can>
        }
      />

      <SupplierDialog
        state={dialog}
        onOpenChange={(open) => !open && setDialog(null)}
        onSaved={table.refresh}
      />
    </>
  );
}

function SupplierDialog({
  state,
  onOpenChange,
  onSaved,
}: {
  state: { mode: "create" } | { mode: "edit"; supplier: SupplierListRow } | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { companyName: "", contactName: "", email: "", phone: "", address: "", notes: "" },
  });

  useEffect(() => {
    if (!state) return;
    if (state.mode === "edit") {
      reset({
        companyName: state.supplier.company_name,
        contactName: state.supplier.contact_name ?? "",
        email: state.supplier.email ?? "",
        phone: state.supplier.phone ?? "",
        address: state.supplier.address ?? "",
        notes: "",
      });
    } else {
      reset({ companyName: "", contactName: "", email: "", phone: "", address: "", notes: "" });
    }
  }, [state, reset]);

  async function onSubmit(values: SupplierInput) {
    if (!state) return;
    setSubmitting(true);
    try {
      const result =
        state.mode === "create"
          ? await createSupplierAction(values)
          : await updateSupplierAction(state.supplier.id, values);
      if (result.ok) {
        toast.success(state.mode === "create" ? "Supplier added" : "Supplier updated");
        onOpenChange(false);
        onSaved?.();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!state} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {state?.mode === "edit" ? `Edit ${state.supplier.company_name}` : "Add supplier"}
          </DialogTitle>
          <DialogDescription>Suppliers are linked to purchase orders.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sf-company">Company name</Label>
            <Input id="sf-company" {...register("companyName")} aria-invalid={!!errors.companyName} />
            {errors.companyName ? (
              <p className="text-xs text-destructive">{errors.companyName.message}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sf-contact">Contact person</Label>
              <Input id="sf-contact" {...register("contactName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sf-phone">Phone</Label>
              <Input id="sf-phone" {...register("phone")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sf-email">Email</Label>
            <Input id="sf-email" type="email" {...register("email")} aria-invalid={!!errors.email} />
            {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sf-address">Address</Label>
            <Textarea id="sf-address" rows={2} {...register("address")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {state?.mode === "edit" ? "Save changes" : "Add supplier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
