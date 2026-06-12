"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { getBrowserClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/rbac/context";
import { formatMoney, toCents, centsToDecimalString } from "@/lib/format";
import { createTrendAction, updateTrendAction } from "@/lib/trends/actions";
import type { TrendInput } from "@/lib/trends/schemas";
import type { TrendListRow } from "@/lib/datasets/trends";
import { marginInfo, type TrendConfigProps } from "./trend-bits";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const NO_CATEGORY = "__none__";

interface FormState {
  name: string;
  sourcePlatform: string;
  sourceUrl: string;
  categoryId: string;
  description: string;
  images: string[];
  printHours: string;
  printMinutes: string;
  suggestedMaterial: string;
  estFilamentGrams: string;
  estSellingPrice: string;
  estCost: string;
  popularityScore: number;
  tags: string[];
  notes: string;
}

function emptyForm(defaultPlatform: string): FormState {
  return {
    name: "",
    sourcePlatform: defaultPlatform,
    sourceUrl: "",
    categoryId: NO_CATEGORY,
    description: "",
    images: [],
    printHours: "",
    printMinutes: "",
    suggestedMaterial: "",
    estFilamentGrams: "",
    estSellingPrice: "",
    estCost: "",
    popularityScore: 50,
    tags: [],
    notes: "",
  };
}

function fromRow(row: TrendListRow, currency: string): FormState {
  const mins = row.est_print_minutes ?? 0;
  return {
    name: row.name,
    sourcePlatform: row.source_platform,
    sourceUrl: row.source_url ?? "",
    categoryId: row.category_id ?? NO_CATEGORY,
    description: row.description ?? "",
    images: row.images ?? [],
    printHours: mins ? String(Math.floor(mins / 60)) : "",
    printMinutes: mins ? String(mins % 60) : "",
    suggestedMaterial: row.suggested_material ?? "",
    estFilamentGrams: row.est_filament_grams != null ? String(row.est_filament_grams) : "",
    estSellingPrice:
      row.est_selling_cents != null ? centsToDecimalString(row.est_selling_cents, currency) : "",
    estCost: row.est_cost_cents != null ? centsToDecimalString(row.est_cost_cents, currency) : "",
    popularityScore: row.popularity_score,
    tags: row.tags ?? [],
    notes: row.notes ?? "",
  };
}

export function TrendDialog({
  open,
  onOpenChange,
  trend,
  config,
  materials,
  perGramCostCents,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create */
  trend: TrendListRow | null;
  config: TrendConfigProps;
  materials: { key: string; label: string; costPerGramCents: number }[];
  perGramCostCents: number;
  onSaved: () => void;
}) {
  const session = useSession();
  const [form, setForm] = useState<FormState>(() => emptyForm(config.platforms[0] ?? "Other"));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tagDraft, setTagDraft] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(trend ? fromRow(trend, config.currency) : emptyForm(config.platforms[0] ?? "Other"));
    setTagDraft("");
  }, [open, trend, config.platforms, config.currency]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Material cost auto-estimate: grams × per-gram cost (selected material first,
  // Settings default otherwise) — mirrors the order form behaviour.
  const gramCost =
    materials.find((m) => m.key === form.suggestedMaterial)?.costPerGramCents ?? perGramCostCents;
  const grams = Number(form.estFilamentGrams) || 0;
  const materialCostCents = Math.round(grams * gramCost);
  const margin = marginInfo(
    toCents(form.estSellingPrice),
    form.estCost ? toCents(form.estCost) : null,
    config.targetMarginPct,
  );

  async function uploadImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = 5 - form.images.length;
    const list = [...files].slice(0, room);
    if (files.length > room) toast.error("Up to 5 reference images — extra files skipped");
    setUploading(true);
    try {
      const supabase = getBrowserClient();
      const uploaded: string[] = [];
      for (const file of list) {
        if (!IMAGE_TYPES.includes(file.type)) {
          toast.error(`${file.name}: images must be PNG, JPEG or WebP`);
          continue;
        }
        if (file.size > IMAGE_MAX_BYTES) {
          toast.error(`${file.name}: too large (max 5 MB)`);
          continue;
        }
        const path = `${session.id}/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-60)}`;
        const { error } = await supabase.storage
          .from("trending")
          .upload(path, file, { contentType: file.type });
        if (error) {
          toast.error(`${file.name}: ${error.message}`);
          continue;
        }
        uploaded.push(supabase.storage.from("trending").getPublicUrl(path).data.publicUrl);
      }
      if (uploaded.length > 0) set("images", [...form.images, ...uploaded].slice(0, 5));
    } finally {
      setUploading(false);
    }
  }

  function addTag() {
    const value = tagDraft.trim().toLowerCase();
    if (!value) return;
    if (form.tags.includes(value)) {
      setTagDraft("");
      return;
    }
    if (form.tags.length >= 15) {
      toast.error("Up to 15 tags");
      return;
    }
    set("tags", [...form.tags, value]);
    setTagDraft("");
  }

  async function save() {
    const hours = Number(form.printHours) || 0;
    const minutes = Number(form.printMinutes) || 0;
    const totalMinutes = Math.round(hours * 60 + minutes);
    const input: TrendInput = {
      name: form.name.trim(),
      sourcePlatform: form.sourcePlatform,
      sourceUrl: form.sourceUrl.trim(),
      categoryId: form.categoryId === NO_CATEGORY ? null : form.categoryId,
      description: form.description.trim(),
      images: form.images,
      estPrintMinutes: totalMinutes > 0 ? totalMinutes : null,
      suggestedMaterial: form.suggestedMaterial,
      estFilamentGrams: grams > 0 ? Math.round(grams) : null,
      estSellingCents: form.estSellingPrice ? toCents(form.estSellingPrice) : null,
      estCostCents: form.estCost ? toCents(form.estCost) : null,
      popularityScore: form.popularityScore,
      tags: form.tags,
      notes: form.notes.trim(),
    };
    setSaving(true);
    try {
      const res = trend
        ? await updateTrendAction(trend.id, input)
        : await createTrendAction(input);
      if (res.ok) {
        toast.success(trend ? "Trend entry updated" : "Trend entry added");
        onOpenChange(false);
        onSaved();
      } else {
        toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{trend ? "Edit trending product" : "Add trending product"}</DialogTitle>
          <DialogDescription>
            Research entry only — promote it later to create a real catalog product.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="trend-name">Name</Label>
            <Input
              id="trend-name"
              value={form.name}
              maxLength={200}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Articulated crystal dragon"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trend-platform">Source platform</Label>
            <Select value={form.sourcePlatform} onValueChange={(v) => set("sourcePlatform", v)}>
              <SelectTrigger id="trend-platform" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {config.platforms.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trend-url">Source URL</Label>
            <Input
              id="trend-url"
              value={form.sourceUrl}
              maxLength={1000}
              onChange={(e) => set("sourceUrl", e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trend-category">Category</Label>
            <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
              <SelectTrigger id="trend-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                {config.categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trend-popularity">
              Popularity score: <span className="tabular-nums">{form.popularityScore}</span>
            </Label>
            <input
              id="trend-popularity"
              type="range"
              min={1}
              max={100}
              value={form.popularityScore}
              onChange={(e) => set("popularityScore", Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="trend-description">Description</Label>
            <Textarea
              id="trend-description"
              value={form.description}
              maxLength={4000}
              rows={2}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          {/* Reference images — first is the cover */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Reference images ({form.images.length}/5)</Label>
            <div className="flex flex-wrap gap-2">
              {form.images.map((url, i) => (
                <div key={url} className="group relative size-16 overflow-hidden rounded-md border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="size-full object-cover" />
                  {i === 0 ? (
                    <span className="absolute bottom-0 inset-x-0 bg-black/60 text-center text-[9px] text-white">
                      cover
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => set("images", form.images.filter((u) => u !== url))}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {form.images.length < 5 ? (
                <label
                  className={cn(
                    "flex size-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:bg-muted",
                    uploading && "pointer-events-none opacity-60",
                  )}
                >
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                  <input
                    type="file"
                    accept={IMAGE_TYPES.join(",")}
                    multiple
                    className="sr-only"
                    onChange={(e) => void uploadImages(e.target.files)}
                  />
                </label>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Estimated print time</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={form.printHours}
                onChange={(e) => set("printHours", e.target.value)}
                aria-label="Hours"
                placeholder="h"
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">h</span>
              <Input
                type="number"
                min={0}
                max={59}
                value={form.printMinutes}
                onChange={(e) => set("printMinutes", e.target.value)}
                aria-label="Minutes"
                placeholder="m"
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">m</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trend-material">Suggested material</Label>
            <Select
              value={form.suggestedMaterial || "__none__"}
              onValueChange={(v) => set("suggestedMaterial", v === "__none__" ? "" : v)}
            >
              <SelectTrigger id="trend-material" className="w-full">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {materials.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trend-grams">Est. filament (g)</Label>
            <Input
              id="trend-grams"
              type="number"
              min={0}
              value={form.estFilamentGrams}
              onChange={(e) => set("estFilamentGrams", e.target.value)}
              placeholder="e.g. 85"
            />
            {grams > 0 ? (
              <p className="text-xs text-muted-foreground">
                ≈ {formatMoney(materialCostCents, config.currency)} material cost
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trend-cost">Est. total cost</Label>
            <Input
              id="trend-cost"
              type="number"
              min={0}
              value={form.estCost}
              onChange={(e) => set("estCost", e.target.value)}
              placeholder="e.g. 60000"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trend-price">Est. selling price</Label>
            <Input
              id="trend-price"
              type="number"
              min={0}
              value={form.estSellingPrice}
              onChange={(e) => set("estSellingPrice", e.target.value)}
              placeholder="e.g. 150000"
            />
          </div>
          <div className="flex items-end pb-1">
            {margin ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                  margin.className,
                )}
              >
                {margin.label}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                Enter price + cost for the margin estimate
              </span>
            )}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="trend-tags">Trend tags</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {form.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  {tag}
                  <button
                    type="button"
                    aria-label={`Remove tag ${tag}`}
                    onClick={() => set("tags", form.tags.filter((t) => t !== tag))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <Input
                id="trend-tags"
                value={tagDraft}
                maxLength={40}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
                placeholder="viral, seasonal…"
                className="h-7 w-36"
              />
            </div>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="trend-notes">Notes</Label>
            <Textarea
              id="trend-notes"
              value={form.notes}
              maxLength={4000}
              rows={2}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving || uploading || form.name.trim().length < 2} onClick={() => void save()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {trend ? "Save changes" : "Add entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
