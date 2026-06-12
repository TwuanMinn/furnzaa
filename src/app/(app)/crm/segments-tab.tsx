"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/states";
import { Can } from "@/lib/rbac/context";
import { deleteSegmentAction, saveSegmentAction } from "@/lib/crm/actions";
import type { SegmentFilter, SegmentRow, TierRow } from "@/lib/datasets/crm";

/** Human summary of a stored segment definition. */
function describeFilter(filter: SegmentFilter, tiers: TierRow[]): string[] {
  const parts: string[] = [];
  if (filter.spend_min_cents != null) parts.push(`spend ≥ ${(filter.spend_min_cents / 100).toLocaleString()}`);
  if (filter.spend_max_cents != null) parts.push(`spend ≤ ${(filter.spend_max_cents / 100).toLocaleString()}`);
  if (filter.order_count_min != null) parts.push(`orders ≥ ${filter.order_count_min}`);
  if (filter.tier_keys?.length) {
    const names = filter.tier_keys.map((k) => tiers.find((t) => t.key === k)?.name ?? k);
    parts.push(`tier: ${names.join(", ")}`);
  }
  if (filter.last_purchase_before) parts.push(`inactive since ${filter.last_purchase_before}`);
  if (filter.last_purchase_after) parts.push(`purchased after ${filter.last_purchase_after}`);
  if (filter.regions?.length) parts.push(`region: ${filter.regions.join(", ")}`);
  if (filter.product_id) parts.push("bought a specific product");
  return parts.length > 0 ? parts : ["All customers"];
}

/**
 * Reusable, named filter definitions. The CRM customers tab and Marketing
 * targeting both expand these into the same indexed predicates.
 */
export function SegmentsTab({ segments, tiers }: { segments: SegmentRow[]; tiers: TierRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<SegmentRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function remove(segment: SegmentRow) {
    setDeletingId(segment.id);
    try {
      const result = await deleteSegmentAction(segment.id);
      if (result.ok) {
        toast.success(`Segment “${segment.name}” deleted`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Can permission="crm.manage_tiers">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus /> New segment
          </Button>
        </Can>
      </div>

      {segments.length === 0 ? (
        <div className="rounded-lg border border-border">
          <EmptyState
            icon={Filter}
            title="No segments yet"
            description="Save reusable customer filters — Marketing campaigns target them directly."
          />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {segments.map((segment) => (
            <Card key={segment.id}>
              <CardContent className="pt-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{segment.name}</p>
                    {segment.description ? (
                      <p className="text-sm text-muted-foreground">{segment.description}</p>
                    ) : null}
                  </div>
                  <Can permission="crm.manage_tiers">
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${segment.name}`} onClick={() => setEditing(segment)}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${segment.name}`}
                        disabled={deletingId === segment.id}
                        onClick={() => void remove(segment)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {deletingId === segment.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      </Button>
                    </div>
                  </Can>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {describeFilter(segment.filter, tiers).map((part, i) => (
                    <Badge key={i} variant="outline" className="font-normal">
                      {part}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SegmentEditorDialog
        open={createOpen || !!editing}
        segment={editing}
        tiers={tiers}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditing(null);
          }
        }}
      />
    </>
  );
}

function SegmentEditorDialog({
  open,
  segment,
  tiers,
  onOpenChange,
}: {
  open: boolean;
  segment: SegmentRow | null;
  tiers: TierRow[];
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [spendMin, setSpendMin] = useState("");
  const [spendMax, setSpendMax] = useState("");
  const [ordersMin, setOrdersMin] = useState("");
  const [tierKeys, setTierKeys] = useState<ReadonlySet<string>>(new Set());
  const [inactiveSince, setInactiveSince] = useState("");
  const [regions, setRegions] = useState("");

  useEffect(() => {
    if (!open) return;
    if (segment) {
      setName(segment.name);
      setDescription(segment.description ?? "");
      setSpendMin(segment.filter.spend_min_cents != null ? String(segment.filter.spend_min_cents / 100) : "");
      setSpendMax(segment.filter.spend_max_cents != null ? String(segment.filter.spend_max_cents / 100) : "");
      setOrdersMin(segment.filter.order_count_min != null ? String(segment.filter.order_count_min) : "");
      setTierKeys(new Set(segment.filter.tier_keys ?? []));
      setInactiveSince(segment.filter.last_purchase_before ?? "");
      setRegions((segment.filter.regions ?? []).join(", "));
    } else {
      setName("");
      setDescription("");
      setSpendMin("");
      setSpendMax("");
      setOrdersMin("");
      setTierKeys(new Set());
      setInactiveSince("");
      setRegions("");
    }
  }, [open, segment]);

  async function save() {
    setSaving(true);
    try {
      const result = await saveSegmentAction({
        id: segment?.id,
        name,
        description,
        filter: {
          spend_min_cents: spendMin ? Math.round(Number(spendMin) * 100) : undefined,
          spend_max_cents: spendMax ? Math.round(Number(spendMax) * 100) : undefined,
          order_count_min: ordersMin ? Number(ordersMin) : undefined,
          tier_keys: tierKeys.size > 0 ? [...tierKeys] : undefined,
          last_purchase_before: inactiveSince || undefined,
          regions: regions
            ? regions
                .split(",")
                .map((r) => r.trim())
                .filter(Boolean)
            : undefined,
        },
      });
      if (result.ok) {
        toast.success(segment ? "Segment updated" : "Segment created");
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
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{segment ? `Edit ${segment.name}` : "New segment"}</DialogTitle>
          <DialogDescription>
            Every criterion runs on an indexed customer aggregate — segments stay fast at a
            million customers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sg-name">Name</Label>
            <Input id="sg-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sg-desc">Description (optional)</Label>
            <Input id="sg-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sg-min">Min spend</Label>
              <Input id="sg-min" type="number" min={0} value={spendMin} onChange={(e) => setSpendMin(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sg-max">Max spend</Label>
              <Input id="sg-max" type="number" min={0} value={spendMax} onChange={(e) => setSpendMax(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sg-orders">Min orders</Label>
              <Input id="sg-orders" type="number" min={0} value={ordersMin} onChange={(e) => setOrdersMin(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sg-inactive">No purchase since (inactivity)</Label>
            <Input id="sg-inactive" type="date" value={inactiveSince} onChange={(e) => setInactiveSince(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sg-regions">Regions (comma-separated)</Label>
            <Input id="sg-regions" value={regions} onChange={(e) => setRegions(e.target.value)} placeholder="e.g. West, Midwest" />
          </div>
          <div className="space-y-1.5">
            <Label>Tiers ({tierKeys.size || "any"})</Label>
            <ScrollArea className="h-36 rounded-md border p-2">
              <ul className="space-y-1.5">
                {tiers.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`sg-tier-${t.key}`}
                      checked={tierKeys.has(t.key)}
                      onCheckedChange={(checked) => {
                        setTierKeys((prev) => {
                          const next = new Set(prev);
                          if (checked === true) next.add(t.key);
                          else next.delete(t.key);
                          return next;
                        });
                      }}
                    />
                    <Label htmlFor={`sg-tier-${t.key}`} className="font-normal">
                      {t.name}
                    </Label>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || name.trim().length < 2}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {segment ? "Save segment" : "Create segment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
