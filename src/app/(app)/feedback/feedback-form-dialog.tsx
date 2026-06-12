"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ImagePlus, Loader2, Search, Star, X } from "lucide-react";
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
import { badgeClass } from "@/lib/badges";
import { createFeedbackAction } from "@/lib/feedback/actions";
import {
  FEEDBACK_PHOTO_MAX_BYTES,
  FEEDBACK_PHOTO_MAX_COUNT,
  FEEDBACK_PHOTO_MIME_TYPES,
  type FeedbackSeverity,
} from "@/lib/feedback/schemas";

interface LookupHit {
  id: string;
  name: string;
  phone: string | null;
}

interface OrderHit {
  id: string;
  order_code: string;
  customers: { id: string; name: string } | null;
}

interface PhotoDraft {
  path: string;
  name: string;
  mime: string;
  size: number;
  preview: string;
}

export interface FeedbackConfigProps {
  categories: string[];
  channels: string[];
  severities: { key: string; label: string; color: string }[];
}

/**
 * Manual feedback entry (spec: tappable animated stars, customer lookup with a
 * walk-in fallback, optional order link, photos into the PRIVATE feedback
 * bucket — previews are local object URLs; the server signs real URLs later).
 */
export function FeedbackFormDialog({
  open,
  onOpenChange,
  config,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: FeedbackConfigProps;
  onSaved: () => void;
}) {
  const reduce = useReducedMotion();
  const session = useSession();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState("");
  const [category, setCategory] = useState(config.categories[0] ?? "Other");
  const [channel, setChannel] = useState(config.channels[0] ?? "In person");
  const [severity, setSeverity] = useState<FeedbackSeverity>("low");

  const [customer, setCustomer] = useState<LookupHit | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [hits, setHits] = useState<LookupHit[]>([]);
  const [fallbackName, setFallbackName] = useState("");
  const [fallbackPhone, setFallbackPhone] = useState("");

  const [order, setOrder] = useState<OrderHit | null>(null);
  const [orderQuery, setOrderQuery] = useState("");
  const [orderHits, setOrderHits] = useState<OrderHit[]>([]);

  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRating(0);
    setComments("");
    setCategory(config.categories[0] ?? "Other");
    setChannel(config.channels[0] ?? "In person");
    setSeverity("low");
    setCustomer(null);
    setCustomerQuery("");
    setHits([]);
    setFallbackName("");
    setFallbackPhone("");
    setOrder(null);
    setOrderQuery("");
    setOrderHits([]);
    setPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.preview));
      return [];
    });
  }, [open, config.categories, config.channels]);

  // Debounced customer lookup against the Hub's finder endpoint.
  useEffect(() => {
    const q = customerQuery.trim();
    if (q.length < 2 || customer) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      void fetch(`/api/orders/lookup?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((body: { data?: { customers?: LookupHit[] } }) =>
          setHits(body.data?.customers ?? []),
        )
        .catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [customerQuery, customer]);

  // Debounced order lookup (by code).
  useEffect(() => {
    const q = orderQuery.trim();
    if (q.length < 2 || order) {
      setOrderHits([]);
      return;
    }
    const t = setTimeout(() => {
      void fetch(`/api/orders/lookup?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((body: { data?: { orders?: OrderHit[] } }) => setOrderHits(body.data?.orders ?? []))
        .catch(() => setOrderHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [orderQuery, order]);

  const severityMeta = useMemo(
    () => config.severities.find((s) => s.key === severity),
    [config.severities, severity],
  );

  async function uploadPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = FEEDBACK_PHOTO_MAX_COUNT - photos.length;
    const list = [...files].slice(0, room);
    if (files.length > room) toast.error(`Up to ${FEEDBACK_PHOTO_MAX_COUNT} photos — extras skipped`);
    setUploading(true);
    try {
      const supabase = getBrowserClient();
      const uploaded: PhotoDraft[] = [];
      for (const file of list) {
        if (!(FEEDBACK_PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
          toast.error(`${file.name}: photos must be PNG, JPEG or WebP`);
          continue;
        }
        if (file.size > FEEDBACK_PHOTO_MAX_BYTES) {
          toast.error(`${file.name}: too large (max 5 MB)`);
          continue;
        }
        const path = `${session.id}/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-60)}`;
        const { error } = await supabase.storage
          .from("feedback")
          .upload(path, file, { contentType: file.type });
        if (error) {
          toast.error(`${file.name}: ${error.message}`);
          continue;
        }
        uploaded.push({
          path,
          name: file.name,
          mime: file.type,
          size: file.size,
          preview: URL.createObjectURL(file),
        });
      }
      if (uploaded.length > 0) setPhotos((prev) => [...prev, ...uploaded]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removePhoto(path: string) {
    setPhotos((prev) => {
      const hit = prev.find((p) => p.path === path);
      if (hit) URL.revokeObjectURL(hit.preview);
      return prev.filter((p) => p.path !== path);
    });
  }

  async function save() {
    if (rating === 0) {
      toast.error("Pick a star rating");
      return;
    }
    setSaving(true);
    try {
      const res = await createFeedbackAction({
        customerId: customer?.id ?? null,
        fallbackName: customer ? "" : fallbackName.trim(),
        fallbackPhone: customer ? "" : fallbackPhone.trim(),
        orderId: order?.id ?? null,
        rating,
        comments: comments.trim(),
        category,
        sourceChannel: channel,
        severity,
        attachments: photos.map((p) => ({ path: p.path, name: p.name, mime: p.mime, size: p.size })),
      });
      if (res.ok) {
        toast.success(`Feedback ${res.data.code} logged`);
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Log customer feedback</DialogTitle>
          <DialogDescription>
            Saved as a permanent record and tracked through review → resolved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Rating — tappable animated stars */}
          <div className="space-y-1.5">
            <Label>Rating</Label>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <motion.button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  onClick={() => setRating(n)}
                  whileTap={reduce ? undefined : { scale: 1.25 }}
                  transition={{ type: "spring", bounce: 0.5, duration: 0.3 }}
                  className="rounded p-0.5 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Star
                    className={cn(
                      "size-7 transition-colors",
                      n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
                    )}
                    aria-hidden
                  />
                </motion.button>
              ))}
              {rating > 0 ? (
                <span className="ml-1 text-sm tabular-nums text-muted-foreground">{rating}/5</span>
              ) : null}
            </div>
          </div>

          {/* Customer lookup with walk-in fallback */}
          <div className="space-y-1.5">
            <Label htmlFor="fb-customer">Customer</Label>
            {customer ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-sm">
                  {customer.name}
                  {customer.phone ? (
                    <span className="text-xs text-muted-foreground">{customer.phone}</span>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Clear customer"
                    onClick={() => setCustomer(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              </div>
            ) : (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="fb-customer"
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  placeholder="Search name, phone or email…"
                  className="pl-8"
                />
                {hits.length > 0 ? (
                  <ul className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover p-1 shadow-md">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setCustomer(h);
                            setHits([]);
                          }}
                          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
                          {h.name}
                          {h.phone ? (
                            <span className="text-xs text-muted-foreground">{h.phone}</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
            {!customer ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={fallbackName}
                  maxLength={200}
                  onChange={(e) => setFallbackName(e.target.value)}
                  placeholder="…or walk-in name"
                  aria-label="Walk-in customer name"
                />
                <Input
                  value={fallbackPhone}
                  maxLength={50}
                  onChange={(e) => setFallbackPhone(e.target.value)}
                  placeholder="Walk-in phone (optional)"
                  aria-label="Walk-in customer phone"
                />
              </div>
            ) : null}
          </div>

          {/* Related order */}
          <div className="space-y-1.5">
            <Label htmlFor="fb-order">Related order (optional)</Label>
            {order ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-sm">
                {order.order_code}
                <button
                  type="button"
                  aria-label="Clear order"
                  onClick={() => setOrder(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ) : (
              <div className="relative">
                <Input
                  id="fb-order"
                  value={orderQuery}
                  onChange={(e) => setOrderQuery(e.target.value)}
                  placeholder="Order code, e.g. FZ-2026-000128"
                />
                {orderHits.length > 0 ? (
                  <ul className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover p-1 shadow-md">
                    {orderHits.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setOrder(h);
                            setOrderHits([]);
                            if (!customer && h.customers)
                              setCustomer({ id: h.customers.id, name: h.customers.name, phone: null });
                          }}
                          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                        >
                          {h.order_code}
                          {h.customers ? (
                            <span className="text-xs text-muted-foreground">{h.customers.name}</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </div>

          {/* Comments */}
          <div className="space-y-1.5">
            <Label htmlFor="fb-comments">Comments</Label>
            <Textarea
              id="fb-comments"
              value={comments}
              maxLength={5000}
              rows={3}
              onChange={(e) => setComments(e.target.value)}
              placeholder="What did the customer say?"
            />
          </div>

          {/* Category / channel / severity */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="fb-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="fb-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {config.categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb-channel">Source channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger id="fb-channel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {config.channels.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb-severity">Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as FeedbackSeverity)}>
                <SelectTrigger id="fb-severity" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {config.severities.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      <span className="flex items-center gap-2">
                        <span
                          className={cn("size-2 rounded-full ring-1 ring-inset", badgeClass(s.color))}
                          aria-hidden
                        />
                        {s.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {severityMeta ? <span className="sr-only">{severityMeta.label}</span> : null}
            </div>
          </div>

          {/* Photos */}
          <div className="space-y-1.5">
            <Label>
              Photos ({photos.length}/{FEEDBACK_PHOTO_MAX_COUNT})
            </Label>
            <div className="flex flex-wrap gap-2">
              {photos.map((p) => (
                <div key={p.path} className="group relative size-16 overflow-hidden rounded-md border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt={p.name} className="size-full object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => removePhoto(p.path)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {photos.length < FEEDBACK_PHOTO_MAX_COUNT ? (
                <label
                  className={cn(
                    "flex size-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:bg-muted",
                    uploading && "pointer-events-none opacity-60",
                  )}
                >
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                  <input
                    ref={fileRef}
                    type="file"
                    accept={FEEDBACK_PHOTO_MIME_TYPES.join(",")}
                    multiple
                    className="sr-only"
                    onChange={(e) => void uploadPhotos(e.target.files)}
                  />
                </label>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              saving ||
              uploading ||
              rating === 0 ||
              !comments.trim() ||
              (!customer && !fallbackName.trim())
            }
            onClick={() => void save()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
