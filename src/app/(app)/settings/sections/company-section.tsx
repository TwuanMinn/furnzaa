"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { getBrowserClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/rbac/context";
import { updateCompanyAction } from "@/lib/settings/actions";
import { CURRENCIES, type CompanyInput } from "@/lib/settings/schemas";
import type { CompanyData } from "./types";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Organization identity: name, logo, contact details, currency and tax. */
export function CompanySection({ data, canEdit }: { data: CompanyData; canEdit: boolean }) {
  const router = useRouter();
  const session = useSession();

  const [companyName, setCompanyName] = useState(data.companyName);
  const [logoUrl, setLogoUrl] = useState<string | null>(data.logoUrl);
  const [addressLine, setAddressLine] = useState(data.addressLine);
  const [contactEmail, setContactEmail] = useState(data.contactEmail);
  const [contactPhone, setContactPhone] = useState(data.contactPhone);
  const [currency, setCurrency] = useState(data.currency);
  const [taxRate, setTaxRate] = useState(String(data.defaultTaxRate));

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function uploadLogo(file: File | null) {
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
      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-60);
      const path = `${session.id}/logo-${crypto.randomUUID()}-${safeName}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      setLogoUrl(pub.publicUrl);
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const payload: CompanyInput = {
        companyName,
        logoUrl,
        addressLine,
        contactEmail,
        contactPhone,
        currency: currency as CompanyInput["currency"],
        defaultTaxRate: Number(taxRate),
      };
      const res = await updateCompanyAction(payload);
      if (res.ok) {
        toast.success("Company settings saved");
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
        <CardTitle className="text-base">Company</CardTitle>
        <CardDescription>
          Organization identity, contact details and money formatting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          {logoUrl ? (
            <div className="relative">
              <Image
                src={logoUrl}
                alt=""
                width={64}
                height={64}
                unoptimized
                className="size-16 rounded-lg border border-border object-cover"
              />
              {canEdit ? (
                <button
                  type="button"
                  aria-label="Remove logo"
                  onClick={() => setLogoUrl(null)}
                  className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-destructive text-white"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          ) : canEdit ? (
            <label className="grid size-16 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary/50">
              {uploading ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <ImagePlus className="size-5" />
              )}
              <input
                type="file"
                accept={IMAGE_TYPES.join(",")}
                className="sr-only"
                onChange={(e) => void uploadLogo(e.target.files?.[0] ?? null)}
              />
            </label>
          ) : (
            <div className="grid size-16 place-items-center rounded-lg border-2 border-dashed border-border text-muted-foreground">
              <ImagePlus className="size-5" />
            </div>
          )}
          <div className="flex-1 space-y-2">
            <Label htmlFor="company-name">Company name</Label>
            <Input
              id="company-name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              maxLength={200}
              disabled={!canEdit}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Used on PDF exports, print headers and the login screen
        </p>

        <div className="space-y-2">
          <Label htmlFor="company-address">Address</Label>
          <Input
            id="company-address"
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            maxLength={400}
            disabled={!canEdit}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="company-email">Contact email</Label>
            <Input
              id="company-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-phone">Contact phone</Label>
            <Input
              id="company-phone"
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="company-currency">Currency</Label>
            <Select value={currency} onValueChange={setCurrency} disabled={!canEdit}>
              <SelectTrigger id="company-currency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              VND formats with dot separators, e.g. 300.000₫
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-tax">Default tax rate (%)</Label>
            <Input
              id="company-tax"
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              disabled={!canEdit}
            />
          </div>
        </div>

        {canEdit ? (
          <div className="space-y-2">
            <Button onClick={() => void save()} disabled={saving || uploading}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
            <p className="text-xs text-muted-foreground">
              Money already recorded keeps its value; only formatting changes with currency.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
