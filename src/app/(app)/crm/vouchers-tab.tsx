"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Power, Ticket } from "lucide-react";
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
import { Can } from "@/lib/rbac/context";
import { formatDate, formatMoney } from "@/lib/format";
import { createVouchersAction, setVoucherActiveAction } from "@/lib/crm/actions";
import type { VoucherListRow } from "@/lib/datasets/crm";
import type { FilterDef } from "@/lib/datatable/types";

const SOURCES = ["manual", "automatic", "birthday", "rank_upgrade", "promotional"];

function voucherValue(r: VoucherListRow, currency: string): string {
  if (r.type === "percentage") return `${Number(r.value_percent)}% off`;
  if (r.type === "fixed") return `${formatMoney(r.value_cents ?? 0, currency)} off`;
  return "Free shipping";
}

export function VouchersTab({ currency }: { currency: string }) {
  const table = useDataTable<VoucherListRow>({
    endpoint: "/api/crm/vouchers",
    defaultSort: { id: "created_at", dir: "desc" },
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function toggle(row: VoucherListRow) {
    setTogglingId(row.id);
    try {
      const result = await setVoucherActiveAction(row.id, !row.is_active);
      if (result.ok) {
        toast.success(`${row.code} ${row.is_active ? "deactivated" : "activated"}`);
        table.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setTogglingId(null);
    }
  }

  const columns: DataTableColumn<VoucherListRow>[] = [
    {
      id: "code",
      header: "Code",
      sortable: true,
      cell: (r) => <span className="font-mono text-xs font-medium">{r.code}</span>,
    },
    { id: "value", header: "Value", cell: (r) => voucherValue(r, currency) },
    {
      id: "source",
      header: "Source",
      hideBelow: "md",
      cell: (r) => <Badge variant="outline">{r.source.replace("_", " ")}</Badge>,
    },
    {
      id: "assigned",
      header: "Assigned to",
      hideBelow: "lg",
      cell: (r) => (
        <span className="text-muted-foreground">{r.assigned_customer?.name ?? "Generic"}</span>
      ),
    },
    {
      id: "window",
      header: "Validity",
      hideBelow: "md",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {formatDate(r.start_date)} → {r.end_date ? formatDate(r.end_date) : "no expiry"}
        </span>
      ),
    },
    {
      id: "used_count",
      header: "Used",
      sortable: true,
      align: "right",
      cell: (r) => (
        <span className="tabular-nums">
          {r.used_count}
          {r.usage_limit ? ` / ${r.usage_limit}` : ""}
        </span>
      ),
    },
    {
      id: "active",
      header: "Status",
      cell: (r) =>
        r.is_active ? (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
            Active
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Inactive
          </Badge>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: (r) => (
        <Can permission="vouchers.create">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={r.is_active ? `Deactivate ${r.code}` : `Activate ${r.code}`}
            disabled={togglingId === r.id}
            onClick={(e) => {
              e.stopPropagation();
              void toggle(r);
            }}
            className={r.is_active ? "text-muted-foreground hover:text-destructive" : "text-muted-foreground hover:text-emerald-600"}
          >
            {togglingId === r.id ? <Loader2 className="animate-spin" /> : <Power />}
          </Button>
        </Can>
      ),
    },
  ];

  const filters: FilterDef[] = [
    {
      type: "select",
      id: "type",
      label: "Type",
      options: [
        { value: "percentage", label: "Percentage" },
        { value: "fixed", label: "Fixed amount" },
        { value: "free_shipping", label: "Free shipping" },
      ],
    },
    {
      type: "select",
      id: "source",
      label: "Source",
      options: SOURCES.map((s) => ({ value: s, label: s.replace("_", " ") })),
    },
    {
      type: "select",
      id: "status",
      label: "Status",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },
  ];

  return (
    <>
      <DataTable
        table={table}
        columns={columns}
        getRowId={(r) => r.id}
        filterDefs={filters}
        searchPlaceholder="Search code…"
        exportDataset="vouchers"
        emptyIcon={Ticket}
        emptyTitle="No vouchers"
        emptyDescription="Create manual or promotional vouchers — rank-upgrade and birthday vouchers are issued automatically."
        toolbar={
          <Can permission="vouchers.create">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus /> New voucher
            </Button>
          </Can>
        }
      />
      <VoucherCreateDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={table.refresh} currency={currency} />
    </>
  );
}

function VoucherCreateDialog({
  open,
  onOpenChange,
  onSaved,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  currency: string;
}) {
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percentage" | "fixed" | "free_shipping">("percentage");
  const [value, setValue] = useState("10");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [source, setSource] = useState<"manual" | "promotional">("manual");
  const [generateCount, setGenerateCount] = useState("1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const d = new Date();
      setStartDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
      setCode("");
      setType("percentage");
      setValue("10");
      setEndDate("");
      setUsageLimit("");
      setSource("manual");
      setGenerateCount("1");
    }
  }, [open]);

  async function save() {
    setSaving(true);
    try {
      const result = await createVouchersAction({
        code,
        type,
        value: Number(value) || 0,
        startDate,
        endDate,
        usageLimit: usageLimit === "" ? "" : Number(usageLimit),
        assignedCustomerId: "",
        source,
        generateCount: Number(generateCount) || 1,
      } as never);
      if (result.ok) {
        toast.success(
          result.data.created === 1
            ? `Voucher ${result.data.firstCode} created`
            : `${result.data.created} vouchers generated`,
        );
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
          <DialogTitle>New voucher</DialogTitle>
          <DialogDescription>
            Leave the code blank to auto-generate (set a count to generate a batch). Validity,
            usage limits and assignment are enforced server-side at redemption.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vc-code">Code (optional)</Label>
              <Input
                id="vc-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="AUTO"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vc-count">Generate count</Label>
              <Input
                id="vc-count"
                type="number"
                min={1}
                max={500}
                value={generateCount}
                disabled={code.trim() !== ""}
                onChange={(e) => setGenerateCount(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vc-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger id="vc-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage off</SelectItem>
                  <SelectItem value="fixed">Fixed amount off</SelectItem>
                  <SelectItem value="free_shipping">Free shipping</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vc-value">
                {type === "percentage" ? "Percent" : type === "fixed" ? `Amount (${currency})` : "Value"}
              </Label>
              <Input
                id="vc-value"
                type="number"
                min={0}
                step={type === "fixed" ? "0.01" : "1"}
                value={value}
                disabled={type === "free_shipping"}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vc-start">Valid from</Label>
              <Input id="vc-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vc-end">Valid to (optional)</Label>
              <Input id="vc-end" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vc-limit">Usage limit (optional)</Label>
              <Input
                id="vc-limit"
                type="number"
                min={1}
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vc-source">Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
                <SelectTrigger id="vc-source" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="promotional">Promotional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
