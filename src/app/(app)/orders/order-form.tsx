"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Check,
  ChevronsUpDown,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getBrowserClient } from "@/lib/supabase/client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePermissions, useSession } from "@/lib/rbac/context";
import { createOrderAction, updateOrderAction } from "@/lib/orders/actions";
import { orderFormSchema, PAYMENT_METHODS, PAYMENT_STATUSES, type OrderFormInput } from "@/lib/orders/schemas";
import { formatMoney } from "@/lib/format";
import type {
  MaterialTypeDef,
  OrderPriorityDef,
  OrderStatusDef,
  PrinterDef,
} from "@/lib/orders/config";
import type { StaffOption } from "@/app/api/staff/route";
import type { LookupCustomerHit } from "@/app/api/orders/lookup/route";
import { HoursMinutesInput, ModelFilesField, ProductLinePicker } from "./order-form-parts";

const RECEIPT_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

/** Today as YYYY-MM-DD in the user's LOCAL timezone (toISOString is UTC). */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface OrderFormProps {
  mode: "create" | "edit";
  orderId?: string;
  statuses: OrderStatusDef[];
  priorities: OrderPriorityDef[];
  printers: PrinterDef[];
  materials: MaterialTypeDef[];
  staff: StaffOption[];
  currency: string;
  taxRatePercent: number;
  /** Prefill for edit mode (server-loaded). */
  initial?: Partial<OrderFormInput> & { customerName?: string; receiptFileName?: string };
}

/**
 * Create/edit order form: customer picker (existing via debounced search, or
 * new inline), auto/manual order code, line items with live totals, payment,
 * assignment (orders.assign only) and a validated receipt upload straight to
 * the private receipts bucket.
 */
export function OrderForm({
  mode,
  orderId,
  statuses,
  priorities,
  printers,
  materials,
  staff,
  currency,
  taxRatePercent,
  initial,
}: OrderFormProps) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const session = useSession();
  const { has } = usePermissions();
  const canAssign = has("orders.assign");
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<OrderFormInput>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      customer: initial?.customer ?? { mode: "new", name: "" },
      orderCode: initial?.orderCode ?? "",
      buyingDate: initial?.buyingDate ?? localToday(),
      priority: initial?.priority ?? "medium",
      status: initial?.status ?? "pending",
      phone: initial?.phone ?? "",
      email: initial?.email ?? "",
      items: initial?.items ?? [{ name: "", quantity: 1, unitPrice: 0 }],
      deliveryDate: initial?.deliveryDate ?? "",
      shippingAddress: initial?.shippingAddress ?? "",
      paymentMethod: initial?.paymentMethod ?? "",
      paymentStatus: initial?.paymentStatus ?? "unpaid",
      assignedStaffId: initial?.assignedStaffId ?? "",
      notes: initial?.notes ?? "",
      receiptPath: initial?.receiptPath ?? "",
      printerId: initial?.printerId ?? "",
      estimatedPrintMinutes: initial?.estimatedPrintMinutes ?? 0,
      actualPrintMinutes: initial?.actualPrintMinutes ?? 0,
      materialType: initial?.materialType ?? "",
      materialColor: initial?.materialColor ?? "",
      filamentUsedGrams: initial?.filamentUsedGrams ?? 0,
      nozzleSizeMm: initial?.nozzleSizeMm ?? "",
      layerHeightMm: initial?.layerHeightMm ?? "",
      infillPercent: initial?.infillPercent ?? "",
      postProcessing: initial?.postProcessing ?? "",
      modelFiles: initial?.modelFiles ?? [],
      voucherCode: "",
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  // ── Customer picker state ──────────────────────────────────────────────────
  const customer = watch("customer");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerLabel, setCustomerLabel] = useState(initial?.customerName ?? "");
  const debouncedCustomerQuery = useDebouncedValue(customerQuery.trim(), 300);
  const [customerHits, setCustomerHits] = useState<LookupCustomerHit[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debouncedCustomerQuery.length < 2) {
      setCustomerHits([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/orders/lookup?q=${encodeURIComponent(debouncedCustomerQuery)}`, {
      signal: controller.signal,
    })
      .then(async (res) => (await res.json()) as { ok: boolean; data?: { customers: LookupCustomerHit[] } })
      .then((body) => {
        if (body.ok && body.data) {
          setCustomerHits(body.data.customers);
          setPickerOpen(true);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [debouncedCustomerQuery]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // ── Totals (live) ──────────────────────────────────────────────────────────
  // react-hook-form mutates the items array IN PLACE, so identity-based
  // memoization (incl. the React Compiler) would never see changes. Subscribe
  // explicitly and copy into state so every keystroke recomputes.
  const [liveItems, setLiveItems] = useState<OrderFormInput["items"]>(
    () => initial?.items ?? [{ name: "", quantity: 1, unitPrice: 0 }],
  );
  useEffect(() => {
    setLiveItems(getValues("items").map((item) => ({ ...item })));
    const subscription = watch((values, { name }) => {
      if (!name || name.startsWith("items")) {
        setLiveItems(((values.items ?? []) as OrderFormInput["items"]).map((item) => ({ ...item })));
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, getValues]);

  const totals = useMemo(() => {
    const subtotal = liveItems.reduce(
      (acc, item) => acc + Math.round((Number(item.unitPrice) || 0) * 100) * (Number(item.quantity) || 0),
      0,
    );
    const tax = Math.round((subtotal * taxRatePercent) / 100);
    return { subtotal, tax, total: subtotal + tax };
  }, [liveItems, taxRatePercent]);

  // Live material-cost preview (server recomputes authoritatively on save).
  const materialTypeValue = watch("materialType");
  const filamentGramsValue = watch("filamentUsedGrams");
  const liveMaterialCost = useMemo(() => {
    const def = materials.find((m) => m.key === materialTypeValue);
    const grams = Number(filamentGramsValue) || 0;
    return def && grams > 0 ? Math.round(grams * def.cost_per_gram_cents) : 0;
  }, [materials, materialTypeValue, filamentGramsValue]);

  // ── Receipt upload ─────────────────────────────────────────────────────────
  const receiptPath = watch("receiptPath");
  const [receiptName, setReceiptName] = useState(initial?.receiptFileName ?? "");
  const [uploading, setUploading] = useState(false);

  async function handleReceipt(file: File | null) {
    if (!file) return;
    if (!RECEIPT_TYPES.includes(file.type)) {
      toast.error("Receipts must be PNG, JPEG, WebP or PDF");
      return;
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      toast.error("Receipt is too large (max 10 MB)");
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
      const path = `${session.id}/${crypto.randomUUID()}-${safeName}`;
      const supabase = getBrowserClient();
      const { error } = await supabase.storage.from("receipts").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw new Error(error.message);
      setValue("receiptPath", path, { shouldDirty: true });
      setReceiptName(file.name);
      toast.success("Receipt attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function onSubmit(values: OrderFormInput) {
    setSubmitting(true);
    try {
      const result =
        mode === "create"
          ? await createOrderAction(values)
          : await updateOrderAction(orderId!, values);
      if (result.ok) {
        toast.success(mode === "create" ? `Order ${result.orderCode} created` : "Order updated");
        router.push(`/orders/${result.orderId}`);
      } else {
        toast.error(result.error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const fieldError = (message?: string) =>
    message ? <p className="text-xs text-destructive">{message}</p> : null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {/* ── Customer ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {customer.mode === "existing" ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <UserRound className="size-4 text-muted-foreground" aria-hidden />
                  {customerLabel || "Selected customer"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setValue("customer", { mode: "new", name: "" });
                    setCustomerLabel("");
                  }}
                >
                  <X /> Change
                </Button>
              </div>
            ) : (
              <div ref={pickerRef} className="relative space-y-1.5">
                <Label htmlFor="of-customer">Customer name</Label>
                <Input
                  id="of-customer"
                  autoComplete="off"
                  placeholder="Type to search existing customers or enter a new name…"
                  value={customer.mode === "new" ? customer.name : ""}
                  onChange={(e) => {
                    setValue("customer", { mode: "new", name: e.target.value });
                    setCustomerQuery(e.target.value);
                  }}
                  onFocus={() => customerHits.length > 0 && setPickerOpen(true)}
                  aria-invalid={!!errors.customer}
                />
                {fieldError(
                  errors.customer && "name" in (errors.customer as Record<string, unknown>)
                    ? ((errors.customer as { name?: { message?: string } }).name?.message ?? undefined)
                    : undefined,
                )}
                <AnimatePresence>
                  {pickerOpen && customerHits.length > 0 ? (
                    <motion.ul
                      initial={reduce ? false : { opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md"
                    >
                      {customerHits.map((hit) => (
                        <li key={hit.id}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                            onClick={() => {
                              setValue("customer", { mode: "existing", id: hit.id });
                              setCustomerLabel(hit.name);
                              setPickerOpen(false);
                            }}
                          >
                            <UserRound className="size-4 text-muted-foreground" aria-hidden />
                            <span className="font-medium">{hit.name}</span>
                            <span className="truncate text-muted-foreground">
                              {[hit.email, hit.phone].filter(Boolean).join(" · ")}
                            </span>
                          </button>
                        </li>
                      ))}
                      <li className="border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
                        …or keep typing to create “{customer.mode === "new" ? customer.name : ""}” as a
                        new customer
                      </li>
                    </motion.ul>
                  ) : null}
                </AnimatePresence>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="of-phone">Phone</Label>
                <Input id="of-phone" autoComplete="off" placeholder="+1 555 010 2030" {...register("phone")} aria-invalid={!!errors.phone} />
                {fieldError(errors.phone?.message)}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="of-email">Email</Label>
                <Input id="of-email" type="email" autoComplete="off" placeholder="customer@example.com" {...register("email")} aria-invalid={!!errors.email} />
                {fieldError(errors.email?.message)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Order details ────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="of-code">Order code</Label>
              <Input
                id="of-code"
                autoComplete="off"
                placeholder={mode === "create" ? "Auto-generated when left blank" : ""}
                {...register("orderCode")}
                aria-invalid={!!errors.orderCode}
              />
              {fieldError(errors.orderCode?.message)}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="of-buying">Buying date</Label>
              <Input id="of-buying" type="date" {...register("buyingDate")} aria-invalid={!!errors.buyingDate} />
              {fieldError(errors.buyingDate?.message)}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="of-status">Status</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="of-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="of-priority">Priority</Label>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="of-priority" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {priorities.map((p) => (
                        <SelectItem key={p.key} value={p.key}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="of-delivery">Delivery date</Label>
              <Input id="of-delivery" type="date" {...register("deliveryDate")} />
            </div>
            {canAssign ? (
              <div className="space-y-1.5">
                <Label htmlFor="of-assigned">Assigned staff</Label>
                <Controller
                  control={control}
                  name="assignedStaffId"
                  render={({ field }) => (
                    <Select
                      value={field.value || "__none__"}
                      onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger id="of-assigned" className="w-full">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {staff.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            ) : null}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="of-address">Shipping address</Label>
              <Textarea id="of-address" rows={2} {...register("shippingAddress")} />
            </div>
          </CardContent>
        </Card>

        {/* ── Print job ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Print job</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="of-printer">Printer</Label>
                <Controller
                  control={control}
                  name="printerId"
                  render={({ field }) => (
                    <PrinterCombobox
                      printers={printers}
                      value={field.value || ""}
                      onChange={field.onChange}
                    />
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="of-material">Filament / material</Label>
                <Controller
                  control={control}
                  name="materialType"
                  render={({ field }) => (
                    <Select
                      value={field.value || "__none__"}
                      onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger id="of-material" className="w-full">
                        <SelectValue placeholder="Select material…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not set</SelectItem>
                        {materials.map((m) => (
                          <SelectItem key={m.key} value={m.key}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="of-mat-color">Material color</Label>
                <Input id="of-mat-color" placeholder="e.g. Matte Black" {...register("materialColor")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="of-grams">Filament used (grams)</Label>
                <Input
                  id="of-grams"
                  type="number"
                  min={0}
                  step="0.1"
                  {...register("filamentUsedGrams")}
                />
                <p className="text-xs text-muted-foreground">
                  Material cost:{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {formatMoney(liveMaterialCost, currency)}
                  </span>{" "}
                  (auto from Settings per-gram cost — feeds Profit & Cost)
                </p>
              </div>

              <Controller
                control={control}
                name="estimatedPrintMinutes"
                render={({ field }) => (
                  <HoursMinutesInput
                    id="of-est-time"
                    label="Estimated printing time"
                    totalMinutes={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                control={control}
                name="actualPrintMinutes"
                render={({ field }) => (
                  <HoursMinutesInput
                    id="of-act-time"
                    label="Actual printing time"
                    totalMinutes={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="of-nozzle">Nozzle (mm)</Label>
                <Input id="of-nozzle" type="number" min={0} step="0.05" placeholder="0.4" {...register("nozzleSizeMm")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="of-layer">Layer height (mm)</Label>
                <Input id="of-layer" type="number" min={0} step="0.04" placeholder="0.2" {...register("layerHeightMm")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="of-infill">Infill %</Label>
                <Input id="of-infill" type="number" min={0} max={100} placeholder="15" {...register("infillPercent")} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="of-postproc">Post-processing requirements</Label>
              <Textarea
                id="of-postproc"
                rows={2}
                placeholder="e.g. support removal, sanding, painting, assembly"
                {...register("postProcessing")}
              />
            </div>

            <Controller
              control={control}
              name="modelFiles"
              render={({ field }) => (
                <ModelFilesField files={field.value} onChange={field.onChange} />
              )}
            />
          </CardContent>
        </Card>

        {/* ── Line items ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Products</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ name: "", quantity: 1, unitPrice: 0 })}
            >
              <Plus /> Add item
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {fieldError(errors.items?.message ?? errors.items?.root?.message)}
            <AnimatePresence initial={false}>
              {fields.map((field, index) => {
                const qty = Number(liveItems[index]?.quantity) || 0;
                const unit = Number(liveItems[index]?.unitPrice) || 0;
                const lineTotal = Math.round(unit * 100) * qty;
                return (
                  <motion.div
                    key={field.id}
                    layout={reduce ? false : "position"}
                    initial={reduce ? false : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="grid grid-cols-[1fr_32px_72px_110px_90px_36px] items-start gap-2"
                  >
                    <div>
                      <Input
                        placeholder="Item name (or pick from catalog →)"
                        aria-label={`Item ${index + 1} name`}
                        {...register(`items.${index}.name`)}
                        aria-invalid={!!errors.items?.[index]?.name}
                      />
                      {fieldError(errors.items?.[index]?.name?.message)}
                    </div>
                    <div className="flex h-9 items-center">
                      <ProductLinePicker
                        linked={!!liveItems[index]?.productId}
                        onPick={(p) => {
                          setValue(`items.${index}.name`, p.name, { shouldDirty: true });
                          setValue(`items.${index}.unitPrice`, p.selling_price_cents / 100, {
                            shouldDirty: true,
                          });
                          setValue(`items.${index}.productId`, p.id, { shouldDirty: true });
                          setValue(`items.${index}.variantId`, null);
                        }}
                        onUnlink={() => {
                          setValue(`items.${index}.productId`, null, { shouldDirty: true });
                          setValue(`items.${index}.variantId`, null);
                        }}
                      />
                    </div>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      aria-label={`Item ${index + 1} quantity`}
                      {...register(`items.${index}.quantity`)}
                      aria-invalid={!!errors.items?.[index]?.quantity}
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      aria-label={`Item ${index + 1} unit price`}
                      {...register(`items.${index}.unitPrice`)}
                      aria-invalid={!!errors.items?.[index]?.unitPrice}
                    />
                    <div className="flex h-9 items-center justify-end text-sm tabular-nums text-muted-foreground">
                      {formatMoney(lineTotal, currency)}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove item ${index + 1}`}
                      disabled={fields.length === 1}
                      onClick={() => remove(index)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>

      {/* ── Summary sidebar ─────────────────────────────────────────────── */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="of-pay-method">Method</Label>
              <Controller
                control={control}
                name="paymentMethod"
                render={({ field }) => (
                  <Select
                    value={field.value || "__none__"}
                    onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger id="of-pay-method" className="w-full">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not set</SelectItem>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="of-pay-status">Payment status</Label>
              <Controller
                control={control}
                name="paymentStatus"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="of-pay-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_STATUSES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {mode === "create" ? (
              <div className="space-y-1.5">
                <Label htmlFor="of-voucher">Voucher code (optional)</Label>
                <Input
                  id="of-voucher"
                  autoComplete="off"
                  placeholder="e.g. RANK-GOLD-1A2B3C"
                  {...register("voucherCode")}
                />
                <p className="text-xs text-muted-foreground">
                  Validated and redeemed by the voucher engine when the order is created.
                </p>
              </div>
            ) : null}

            <Separator />

            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatMoney(totals.subtotal, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax ({taxRatePercent}%)</dt>
                <dd className="tabular-nums">{formatMoney(totals.tax, currency)}</dd>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(totals.total, currency)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receipt & notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="of-receipt">Receipt (image or PDF)</Label>
              {receiptPath ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{receiptName || "Attached receipt"}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Remove receipt"
                    onClick={() => {
                      setValue("receiptPath", "");
                      setReceiptName("");
                    }}
                  >
                    <X />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    id="of-receipt"
                    type="file"
                    accept={RECEIPT_TYPES.join(",")}
                    disabled={uploading}
                    onChange={(e) => void handleReceipt(e.target.files?.[0] ?? null)}
                  />
                  {uploading ? (
                    <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" aria-hidden />
                  ) : (
                    <Paperclip className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="of-notes">Notes</Label>
              <Textarea id="of-notes" rows={3} {...register("notes")} />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={submitting}
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={submitting || uploading}>
            {submitting ? <Loader2 className="animate-spin" /> : null}
            {mode === "create" ? "Create order" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * Cascading printer picker over the Admin-managed brand + model catalog.
 * One searchable list grouped by brand: typing a brand (e.g. "Flashforge")
 * narrows to that brand's models; typing a model finds it directly.
 */
function PrinterCombobox({
  printers,
  value,
  onChange,
}: {
  printers: PrinterDef[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = printers.find((p) => p.id === value) ?? null;

  const brands = useMemo(() => {
    const map = new Map<string, PrinterDef[]>();
    for (const p of printers) {
      const list = map.get(p.brand) ?? [];
      list.push(p);
      map.set(p.brand, list);
    }
    return [...map.entries()];
  }, [printers]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id="of-printer"
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">
              {selected.brand} <span className="font-medium">{selected.model}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Not a print job</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search brand or model…" />
          <CommandList>
            <CommandEmpty>No printer found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__ not a print job"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <Check className={cn("size-4", value === "" ? "opacity-100" : "opacity-0")} />
                Not a print job
              </CommandItem>
            </CommandGroup>
            {brands.map(([brand, models]) => (
              <CommandGroup key={brand} heading={brand}>
                {models.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${p.brand} ${p.model}`}
                    onSelect={() => {
                      onChange(p.id === value ? "" : p.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("size-4", value === p.id ? "opacity-100" : "opacity-0")}
                    />
                    {p.model}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
