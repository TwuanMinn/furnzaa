"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getBrowserClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/rbac/context";
import {
  createCategoryAction,
  createProductAction,
  updateProductAction,
} from "@/lib/products/actions";
import { productSchema, type ProductInput } from "@/lib/products/schemas";
import type { ProductListRow } from "@/lib/datasets/products";
import type { CategoryOption } from "./page";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

type FormValues = {
  name: string;
  categoryId: string | null;
  barcode: string;
  description: string;
  costPriceCents: string | number;
  sellingPriceCents: string | number;
  laborCostCents: string | number;
  packagingCostCents: string | number;
  overheadCostCents: string | number;
  minimumStock: number;
  status: "active" | "inactive" | "discontinued";
  imageUrl: string | null;
};

/** Create/edit product. Prices entered as decimals; SKU auto-generates. */
export function ProductFormDialog({
  mode,
  product,
  categories,
  open,
  onOpenChange,
  onSaved,
}: {
  mode: "create" | "edit";
  product?: ProductListRow | null;
  categories: CategoryOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const session = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      categoryId: null,
      barcode: "",
      description: "",
      costPriceCents: "",
      sellingPriceCents: "",
      laborCostCents: "",
      packagingCostCents: "",
      overheadCostCents: "",
      minimumStock: 0,
      status: "active",
      imageUrl: null,
    },
  });

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && product) {
      reset({
        name: product.name,
        categoryId: product.category_id,
        barcode: product.barcode ?? "",
        description: product.description ?? "",
        costPriceCents: (product.cost_price_cents / 100).toFixed(2),
        sellingPriceCents: (product.selling_price_cents / 100).toFixed(2),
        laborCostCents: (product.labor_cost_cents / 100).toFixed(2),
        packagingCostCents: (product.packaging_cost_cents / 100).toFixed(2),
        overheadCostCents: (product.overhead_cost_cents / 100).toFixed(2),
        minimumStock: product.minimum_stock,
        status: product.status as FormValues["status"],
        imageUrl: product.image_url,
      });
    } else {
      reset({
        name: "",
        categoryId: null,
        barcode: "",
        description: "",
        costPriceCents: "",
        sellingPriceCents: "",
        laborCostCents: "",
        packagingCostCents: "",
        overheadCostCents: "",
        minimumStock: 0,
        status: "active",
        imageUrl: null,
      });
    }
  }, [open, mode, product, reset]);

  const imageUrl = watch("imageUrl");

  async function uploadImage(file: File | null) {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.error("Images must be PNG, JPEG or WebP");
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      toast.error("Image is too large (max 5 MB)");
      return;
    }
    setUploading(true);
    try {
      const supabase = getBrowserClient();
      const path = `${session.id}/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-60)}`;
      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      setValue("imageUrl", data.publicUrl, { shouldDirty: true });
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const payload = values as unknown as ProductInput;
      const result =
        mode === "create"
          ? await createProductAction(payload)
          : await updateProductAction(product!.id, payload);
      if (result.ok) {
        toast.success(
          mode === "create"
            ? `Product created${"data" in result ? ` (${(result.data as { sku: string }).sku})` : ""}`
            : "Product updated",
        );
        onOpenChange(false);
        onSaved?.();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const err = (m?: string) => (m ? <p className="text-xs text-destructive">{m}</p> : null);

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New product" : `Edit ${product?.name}`}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "The SKU is generated automatically from the Settings format."
              : `SKU ${product?.sku} — stock changes only via inventory movements.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="flex items-start gap-3">
            {imageUrl ? (
              <div className="relative">
                <Image
                  src={imageUrl}
                  alt=""
                  width={64}
                  height={64}
                  unoptimized
                  className="size-16 rounded-lg border border-border object-cover"
                />
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => setValue("imageUrl", null)}
                  className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-destructive text-white"
                >
                  <X className="size-3" />
                </button>
              </div>
            ) : (
              <label className="grid size-16 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary/50">
                {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                <input
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  className="sr-only"
                  onChange={(e) => void uploadImage(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="pf-name">Product name</Label>
              <Input id="pf-name" {...register("name")} aria-invalid={!!errors.name} />
              {err(errors.name?.message)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pf-category">Category</Label>
              <Controller
                control={control}
                name="categoryId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? "__none__"}
                    onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                  >
                    <SelectTrigger id="pf-category" className="w-full">
                      <SelectValue placeholder="Uncategorised" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Uncategorised</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-barcode">Barcode</Label>
              <Input id="pf-barcode" {...register("barcode")} placeholder="EAN/UPC…" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pf-desc">Description</Label>
            <Textarea id="pf-desc" rows={2} {...register("description")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pf-cost">Cost price</Label>
              <Input id="pf-cost" type="number" min={0} step="0.01" placeholder="0.00" {...register("costPriceCents")} />
              {err(errors.costPriceCents?.message as string)}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-sell">Selling price</Label>
              <Input id="pf-sell" type="number" min={0} step="0.01" placeholder="0.00" {...register("sellingPriceCents")} />
              {err(errors.sellingPriceCents?.message as string)}
            </div>
          </div>

          <details className="rounded-md border border-border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              Production cost components (optional)
            </summary>
            <div className="mt-2 grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-labor">Labor</Label>
                <Input id="pf-labor" type="number" min={0} step="0.01" placeholder="0.00" {...register("laborCostCents")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-pack">Packaging</Label>
                <Input id="pf-pack" type="number" min={0} step="0.01" placeholder="0.00" {...register("packagingCostCents")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-over">Overhead</Label>
                <Input id="pf-over" type="number" min={0} step="0.01" placeholder="0.00" {...register("overheadCostCents")} />
              </div>
            </div>
          </details>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pf-min">Minimum stock (low-stock alert)</Label>
              <Input id="pf-min" type="number" min={0} {...register("minimumStock")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-status">Status</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="pf-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="discontinued">Discontinued</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || uploading}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {mode === "create" ? "Create product" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Quick category creation. */
export function CategoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (name.trim().length < 2) {
      toast.error("Give the category a name");
      return;
    }
    setSaving(true);
    try {
      const result = await createCategoryAction({ name: name.trim(), description });
      if (result.ok) {
        toast.success(`Category “${name.trim()}” created — refresh to use it in filters`);
        onOpenChange(false);
        setName("");
        setDescription("");
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
          <DialogDescription>Categories group products for filtering and reports.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">Description (optional)</Label>
            <Textarea id="cat-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Create category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
