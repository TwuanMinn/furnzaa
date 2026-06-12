"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { updateLoyaltyConfigAction } from "@/lib/settings/actions";
import type { LoyaltyData } from "./types";

type VoucherType = LoyaltyData["voucherType"];

const VOUCHER_TYPES: { value: VoucherType; label: string }[] = [
  { value: "fixed", label: "Fixed amount" },
  { value: "percentage", label: "Percentage" },
  { value: "free_shipping", label: "Free shipping" },
];

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Loyalty configuration: rank-upgrade voucher defaults and customer-score
 * accrual rates. Tier thresholds/benefits themselves live in CRM → Tiers.
 */
export function LoyaltySection({ data, canEdit }: { data: LoyaltyData; canEdit: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [voucherType, setVoucherType] = useState<VoucherType>(data.voucherType);
  // Display value: currency units when fixed (stored cents / 100), whole percent otherwise.
  const [voucherValue, setVoucherValue] = useState(
    data.voucherType === "fixed" ? (data.voucherValue / 100).toString() : String(data.voucherValue),
  );
  const [voucherValidDays, setVoucherValidDays] = useState(String(data.voucherValidDays));
  const [pointsPerOrder, setPointsPerOrder] = useState(String(data.pointsPerOrder));
  const [pointsPer100Currency, setPointsPer100Currency] = useState(
    String(data.pointsPer100Currency),
  );

  async function save() {
    setSaving(true);
    try {
      const res = await updateLoyaltyConfigAction({
        voucherType,
        voucherValue:
          voucherType === "fixed"
            ? Math.round(toNumber(voucherValue) * 100)
            : voucherType === "percentage"
              ? Math.round(toNumber(voucherValue))
              : 0,
        voucherValidDays: Math.round(toNumber(voucherValidDays)),
        pointsPerOrder: toNumber(pointsPerOrder),
        pointsPer100Currency: toNumber(pointsPer100Currency),
      });
      if (res.ok) {
        toast.success("Saved");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  const saveBar = canEdit ? (
    <div className="flex justify-end">
      <Button onClick={save} disabled={saving || !canEdit}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : null}
        Save changes
      </Button>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rank-upgrade vouchers</CardTitle>
          <CardDescription>
            Default voucher issued when a customer reaches a new tier.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="loyalty-voucher-type">Voucher type</Label>
              <Select
                value={voucherType}
                onValueChange={(v: string) => setVoucherType(v as VoucherType)}
                disabled={!canEdit}
              >
                <SelectTrigger id="loyalty-voucher-type" className="w-full">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {VOUCHER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {voucherType !== "free_shipping" ? (
              <div className="space-y-2">
                <Label htmlFor="loyalty-voucher-value">
                  {voucherType === "fixed"
                    ? `Voucher amount (${data.currency})`
                    : "Voucher percentage (%)"}
                </Label>
                <Input
                  id="loyalty-voucher-value"
                  type="number"
                  min={0}
                  step={voucherType === "fixed" ? "any" : 1}
                  value={voucherValue}
                  onChange={(e) => setVoucherValue(e.target.value)}
                  disabled={!canEdit}
                />
                {voucherType === "fixed" ? (
                  <p className="text-xs text-muted-foreground">
                    Customers receive{" "}
                    {formatMoney(Math.round(toNumber(voucherValue) * 100), data.currency)}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="loyalty-voucher-valid-days">Validity (days)</Label>
              <Input
                id="loyalty-voucher-valid-days"
                type="number"
                min={1}
                max={730}
                step={1}
                value={voucherValidDays}
                onChange={(e) => setVoucherValidDays(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Tier-specific voucher amounts live on each tier&apos;s benefits — this sets type and
            validity.
          </p>
          {saveBar}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer score</CardTitle>
          <CardDescription>How customers earn points toward tier upgrades.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="loyalty-points-per-order">Points per order</Label>
              <Input
                id="loyalty-points-per-order"
                type="number"
                min={0}
                max={1000}
                step={0.1}
                value={pointsPerOrder}
                onChange={(e) => setPointsPerOrder(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loyalty-points-per-100">
                Points per 100 {data.currency} spent
              </Label>
              <Input
                id="loyalty-points-per-100"
                type="number"
                min={0}
                max={1000}
                step={0.1}
                value={pointsPer100Currency}
                onChange={(e) => setPointsPer100Currency(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Score updates as orders are delivered and feeds tier rules. Applies to new orders only.
          </p>
          {saveBar}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="text-sm text-muted-foreground">
          Tier thresholds &amp; benefits are managed in{" "}
          <Link
            href="/crm"
            className="inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-4 hover:no-underline"
          >
            CRM &amp; Loyalty → Tiers
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
