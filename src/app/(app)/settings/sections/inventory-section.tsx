"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateInventoryConfigAction } from "@/lib/settings/actions";
import type { InventoryData } from "./types";

const BARCODE_FORMATS = ["EAN13", "EAN8", "UPC", "CODE128"] as const;
type BarcodeFormat = (typeof BARCODE_FORMATS)[number];

/** Sentinel for "no default warehouse" — shadcn Select cannot hold null. */
const NO_WAREHOUSE = "__none__";

function asBarcodeFormat(value: string): BarcodeFormat {
  return (BARCODE_FORMATS as readonly string[]).includes(value)
    ? (value as BarcodeFormat)
    : "EAN13";
}

/**
 * Org-wide inventory configuration: SKU/barcode generation rules, the default
 * receiving warehouse, and low-stock alerting. Read-only when canEdit is false.
 */
export function InventorySection({ data, canEdit }: { data: InventoryData; canEdit: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [skuPrefix, setSkuPrefix] = useState(data.skuPrefix);
  const [skuFormat, setSkuFormat] = useState(data.skuFormat);
  const [barcodeFormat, setBarcodeFormat] = useState<BarcodeFormat>(
    asBarcodeFormat(data.barcodeFormat),
  );
  const [warehouseId, setWarehouseId] = useState(data.defaultWarehouseId ?? NO_WAREHOUSE);
  const [lowStockAlertsEnabled, setLowStockAlertsEnabled] = useState(data.lowStockAlertsEnabled);

  async function save() {
    if (!skuFormat.includes("{seq}")) {
      toast.error("SKU format must include {seq}");
      return;
    }
    setSaving(true);
    try {
      const res = await updateInventoryConfigAction({
        skuPrefix: skuPrefix.trim(),
        skuFormat: skuFormat.trim(),
        barcodeFormat,
        defaultWarehouseId: warehouseId === NO_WAREHOUSE ? null : warehouseId,
        lowStockAlertsEnabled,
      });
      if (res.ok) {
        toast.success("Inventory settings saved");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Inventory</CardTitle>
        <CardDescription>
          SKU and barcode generation, default warehouse, and stock alerts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="inv-sku-prefix">SKU prefix</Label>
            <Input
              id="inv-sku-prefix"
              value={skuPrefix}
              maxLength={8}
              disabled={!canEdit}
              onChange={(e) => setSkuPrefix(e.target.value.toUpperCase())}
            />
            <p className="text-xs text-muted-foreground">
              New products get {"{prefix}-{seq}"}, e.g. SKU-000042
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-sku-format">SKU format</Label>
            <Input
              id="inv-sku-format"
              value={skuFormat}
              maxLength={60}
              disabled={!canEdit}
              onChange={(e) => setSkuFormat(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Must include {"{seq}"}.</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Existing SKUs never change; the format applies to new products only.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="inv-barcode-format">Barcode format</Label>
            <Select
              value={barcodeFormat}
              onValueChange={(v: string) => setBarcodeFormat(asBarcodeFormat(v))}
            >
              <SelectTrigger id="inv-barcode-format" className="w-full" disabled={!canEdit}>
                <SelectValue placeholder="Select a format" />
              </SelectTrigger>
              <SelectContent>
                {BARCODE_FORMATS.map((format) => (
                  <SelectItem key={format} value={format}>
                    {format}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-default-warehouse">Default warehouse</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger id="inv-default-warehouse" className="w-full" disabled={!canEdit}>
                <SelectValue placeholder="Select a warehouse" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_WAREHOUSE}>No default</SelectItem>
                {data.warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="inv-low-stock" className="font-normal">
              Low-stock alerts
            </Label>
            <p className="text-xs text-muted-foreground">
              Notifies staff when stock crosses a product&apos;s minimum
            </p>
          </div>
          <Switch
            id="inv-low-stock"
            checked={lowStockAlertsEnabled}
            onCheckedChange={setLowStockAlertsEnabled}
            disabled={!canEdit}
          />
        </div>

        {canEdit ? (
          <div className="flex justify-end">
            <Button disabled={saving || !canEdit} onClick={() => void save()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
