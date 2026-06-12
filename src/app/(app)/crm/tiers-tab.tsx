"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

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
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Can } from "@/lib/rbac/context";
import { badgeClass } from "@/lib/badges";
import { formatMoney } from "@/lib/format";
import { updateTierAction } from "@/lib/crm/actions";
import type { TierRow } from "@/lib/datasets/crm";

/**
 * The 15-tier ladder with thresholds + benefits. Values are editable here
 * (crm.manage_tiers) and also surface in Settings → Loyalty; the upgrade
 * engine reads them live.
 */
export function TiersTab({ tiers, currency }: { tiers: TierRow[]; currency: string }) {
  const [editing, setEditing] = useState<TierRow | null>(null);

  const groups = tiers.reduce<Map<string, TierRow[]>>((map, t) => {
    const list = map.get(t.group_name) ?? [];
    list.push(t);
    map.set(t.group_name, list);
    return map;
  }, new Map());

  return (
    <>
      <div className="space-y-5">
        {[...groups.entries()].map(([group, rows]) => (
          <div key={group}>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">{group}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {rows.map((tier) => {
                const b = tier.tier_benefits;
                return (
                  <Card key={tier.id}>
                    <CardContent className="pt-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium ring-1 ring-inset ${badgeClass(tier.badge_color)}`}
                          >
                            <Crown className="size-3.5" aria-hidden />
                            {tier.name}
                          </span>
                          <p className="mt-1.5 text-sm text-muted-foreground">
                            From{" "}
                            <span className="font-medium text-foreground tabular-nums">
                              {formatMoney(tier.lifetime_spend_threshold_cents, currency)}
                            </span>{" "}
                            lifetime spend
                          </p>
                        </div>
                        <Can permission="crm.manage_tiers">
                          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${tier.name}`} onClick={() => setEditing(tier)}>
                            <Pencil />
                          </Button>
                        </Can>
                      </div>
                      {b ? (
                        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {b.discount_percent > 0 ? <li>{b.discount_percent}% discount</li> : null}
                          {b.voucher_amount_cents > 0 ? (
                            <li>{formatMoney(b.voucher_amount_cents, currency)} upgrade voucher</li>
                          ) : null}
                          {b.free_shipping ? <li>Free shipping</li> : null}
                          {b.priority_support ? <li>Priority support</li> : null}
                          {b.exclusive_promotions ? <li>Exclusive promos</li> : null}
                          {b.cashback_percent > 0 ? <li>{b.cashback_percent}% cashback</li> : null}
                        </ul>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <TierEditDialog tier={editing} currency={currency} onOpenChange={(open) => !open && setEditing(null)} />
    </>
  );
}

function TierEditDialog({
  tier,
  currency,
  onOpenChange,
}: {
  tier: TierRow | null;
  currency: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [threshold, setThreshold] = useState("");
  const [discount, setDiscount] = useState("");
  const [voucher, setVoucher] = useState("");
  const [cashback, setCashback] = useState("");
  const [freeShipping, setFreeShipping] = useState(false);
  const [prioritySupport, setPrioritySupport] = useState(false);
  const [exclusivePromos, setExclusivePromos] = useState(false);

  // Initialize fields each time a tier opens.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (tier && openedFor !== tier.id) {
    setOpenedFor(tier.id);
    setThreshold((tier.lifetime_spend_threshold_cents / 100).toString());
    setDiscount(String(tier.tier_benefits?.discount_percent ?? 0));
    setVoucher(((tier.tier_benefits?.voucher_amount_cents ?? 0) / 100).toString());
    setCashback(String(tier.tier_benefits?.cashback_percent ?? 0));
    setFreeShipping(tier.tier_benefits?.free_shipping ?? false);
    setPrioritySupport(tier.tier_benefits?.priority_support ?? false);
    setExclusivePromos(tier.tier_benefits?.exclusive_promotions ?? false);
  }

  async function save() {
    if (!tier) return;
    setSaving(true);
    try {
      const result = await updateTierAction({
        tierId: tier.id,
        lifetimeSpendThreshold: Number(threshold) || 0,
        benefits: {
          discountPercent: Number(discount) || 0,
          voucherAmount: Number(voucher) || 0,
          freeShipping,
          prioritySupport,
          exclusivePromotions: exclusivePromos,
          cashbackPercent: Number(cashback) || 0,
        },
      });
      if (result.ok) {
        toast.success(`${tier.name} updated`);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!tier} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {tier?.name}</DialogTitle>
          <DialogDescription>
            Threshold + benefit changes apply to the upgrade engine immediately and are logged.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="te-threshold">Lifetime spend threshold ({currency})</Label>
            <Input id="te-threshold" type="number" min={0} step="1" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="te-discount">Discount %</Label>
              <Input id="te-discount" type="number" min={0} max={100} value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="te-voucher">Upgrade voucher</Label>
              <Input id="te-voucher" type="number" min={0} step="0.01" value={voucher} onChange={(e) => setVoucher(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="te-cashback">Cashback %</Label>
              <Input id="te-cashback" type="number" min={0} max={100} value={cashback} onChange={(e) => setCashback(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2.5 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="te-ship" className="font-normal">Free shipping</Label>
              <Switch id="te-ship" checked={freeShipping} onCheckedChange={setFreeShipping} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="te-support" className="font-normal">Priority support</Label>
              <Switch id="te-support" checked={prioritySupport} onCheckedChange={setPrioritySupport} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="te-promo" className="font-normal">Exclusive promotions</Label>
              <Switch id="te-promo" checked={exclusivePromos} onCheckedChange={setExclusivePromos} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Save tier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
