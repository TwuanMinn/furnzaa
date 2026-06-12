import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, UserRound } from "lucide-react";

import { getSessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { asRow, asRows } from "@/lib/supabase/types";
import { getOrderConfig } from "@/lib/orders/config";
import { StatusBadge, PriorityBadge, PaymentBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { badgeClass } from "@/lib/badges";
import { formatDate, formatDateTime, formatMinutes, formatMoney } from "@/lib/format";
import { PrintChip } from "@/components/print/print-chip";
import { OrderDetailActions } from "./order-detail-actions";
import { PrintControls } from "./print-controls";
import { StatusTimeline } from "./status-timeline";
import { ModelFileList } from "./model-file-list";

export const metadata = { title: "Order details" };

type OrderDetail = {
  id: string;
  order_code: string;
  buying_date: string;
  priority: string;
  status: string;
  phone: string | null;
  email: string | null;
  shipping_address: string | null;
  delivery_date: string | null;
  payment_method: string | null;
  payment_status: string;
  notes: string | null;
  receipt_url: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  discount_cents: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  printer_id: string | null;
  print_state: string;
  print_started_at: string | null;
  estimated_print_minutes: number | null;
  actual_print_minutes: number | null;
  material_type: string | null;
  material_color: string | null;
  filament_used_grams: number | null;
  material_cost_cents: number;
  nozzle_size_mm: number | null;
  layer_height_mm: number | null;
  infill_percent: number | null;
  post_processing: string | null;
  model_files: { name: string; path: string; size_bytes: number; mime: string }[];
  printers: { brand: string; model: string; badge_color: string } | null;
  customers: { id: string; name: string; email: string | null; phone: string | null } | null;
  assigned: { id: string; full_name: string } | null;
  updated_by_user: { full_name: string } | null;
  voucher: { code: string } | null;
};

type ItemRow = {
  id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
};

export type HistoryRow = {
  id: string;
  from_status: string | null;
  to_status: string;
  comment: string | null;
  created_at: string;
  changed_by_user: { full_name: string } | null;
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("orders.view")) redirect("/dashboard");

  const supabase = await createClient();
  const [orderRes, itemsRes, historyRes, config] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `id, order_code, buying_date, priority, status, phone, email, shipping_address,
         delivery_date, payment_method, payment_status, notes, receipt_url,
         subtotal_cents, tax_cents, total_cents, discount_cents, currency, is_active, created_at, updated_at,
         printer_id, print_state, print_started_at,
         estimated_print_minutes, actual_print_minutes, material_type, material_color,
         filament_used_grams, material_cost_cents, nozzle_size_mm, layer_height_mm, infill_percent,
         post_processing, model_files,
         printers(brand, model, badge_color),
         customers(id, name, email, phone),
         assigned:users!orders_assigned_staff_id_fkey(id, full_name),
         updated_by_user:users!orders_updated_by_fkey(full_name),
         voucher:vouchers(code)`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("id, name, quantity, unit_price_cents, line_total_cents")
      .eq("order_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("order_status_history")
      .select("id, from_status, to_status, comment, created_at, changed_by_user:users!order_status_history_changed_by_fkey(full_name)")
      .eq("order_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    getOrderConfig(),
  ]);

  const order = asRow<OrderDetail>(orderRes.data);
  if (!order) notFound(); // not found OR hidden by RLS for this user

  const items = asRows<ItemRow>(itemsRes.data);
  const history = asRows<HistoryRow>(historyRes.data);
  const statusDef = config.statuses.find((s) => s.key === order.status);
  const priorityDef = config.priorities.find((p) => p.key === order.priority);
  const materialDef = config.materials.find((m) => m.key === order.material_type);
  const modelFiles = Array.isArray(order.model_files) ? order.model_files : [];
  const isPrintJob =
    !!order.printer_id ||
    !!order.material_type ||
    (order.filament_used_grams ?? 0) > 0 ||
    (order.actual_print_minutes ?? 0) > 0 ||
    modelFiles.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            href="/orders"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> Customer Orders Hub
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight tabular-nums">{order.order_code}</h1>
            <StatusBadge status={order.status} color={statusDef?.color} label={statusDef?.label} />
            <PriorityBadge priority={order.priority} color={priorityDef?.color} label={priorityDef?.label} />
            <PaymentBadge status={order.payment_status} />
            {!order.is_active ? (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive ring-1 ring-destructive/30 ring-inset">
                Deleted
              </span>
            ) : null}
          </div>
          {order.customers ? (
            <Link
              href={`/orders/customers/${order.customers.id}`}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <UserRound className="size-4" aria-hidden />
              {order.customers.name} — view all their orders
            </Link>
          ) : null}
        </div>

        <OrderDetailActions
          orderId={order.id}
          orderCode={order.order_code}
          currentStatus={order.status}
          statuses={config.statuses}
          hasReceipt={!!order.receipt_url}
          isActive={order.is_active}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Products</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Item</th>
                    <th className="pb-2 text-right font-medium">Qty</th>
                    <th className="pb-2 text-right font-medium">Unit price</th>
                    <th className="pb-2 text-right font-medium">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-2.5">{item.name}</td>
                      <td className="py-2.5 text-right tabular-nums">{item.quantity}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        {formatMoney(item.unit_price_cents, order.currency)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {formatMoney(item.line_total_cents, order.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Separator className="my-3" />
              <dl className="ml-auto max-w-64 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">{formatMoney(order.subtotal_cents, order.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tax</dt>
                  <dd className="tabular-nums">{formatMoney(order.tax_cents, order.currency)}</dd>
                </div>
                {order.discount_cents > 0 ? (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <dt>Voucher{order.voucher ? ` (${order.voucher.code})` : ""}</dt>
                    <dd className="tabular-nums">
                      −{formatMoney(order.discount_cents, order.currency)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatMoney(order.total_cents, order.currency)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {isPrintJob ? (
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Print job</CardTitle>
                <PrintChip
                  state={order.print_state}
                  startedAt={order.print_started_at}
                  estimatedMinutes={order.estimated_print_minutes}
                  actualMinutes={order.actual_print_minutes}
                />
              </CardHeader>
              <CardContent className="space-y-4">
                <PrintControls orderId={order.id} printState={order.print_state} />
                <div className="flex flex-wrap items-center gap-2">
                  {order.printers ? (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeClass(order.printers.badge_color)}`}
                    >
                      {order.printers.brand} {order.printers.model}
                    </span>
                  ) : null}
                  {materialDef || order.material_type ? (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeClass(materialDef?.color)}`}
                    >
                      {materialDef?.label ?? order.material_type}
                      {order.material_color ? ` · ${order.material_color}` : ""}
                    </span>
                  ) : null}
                </div>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Estimated time</dt>
                    <dd className="tabular-nums">{formatMinutes(order.estimated_print_minutes)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Actual time</dt>
                    <dd className="tabular-nums">{formatMinutes(order.actual_print_minutes)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Filament used</dt>
                    <dd className="tabular-nums">
                      {Number(order.filament_used_grams ?? 0) > 0
                        ? `${Number(order.filament_used_grams).toLocaleString()} g`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Material cost</dt>
                    <dd className="tabular-nums">
                      {order.material_cost_cents > 0
                        ? formatMoney(order.material_cost_cents, order.currency)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Nozzle / layer</dt>
                    <dd className="tabular-nums">
                      {order.nozzle_size_mm ? `${Number(order.nozzle_size_mm)} mm` : "—"}
                      {order.layer_height_mm ? ` / ${Number(order.layer_height_mm)} mm` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Infill</dt>
                    <dd className="tabular-nums">
                      {order.infill_percent != null ? `${order.infill_percent}%` : "—"}
                    </dd>
                  </div>
                </dl>

                {order.post_processing ? (
                  <div className="text-sm">
                    <p className="text-muted-foreground">Post-processing</p>
                    <p className="whitespace-pre-wrap">{order.post_processing}</p>
                  </div>
                ) : null}

                {modelFiles.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-sm text-muted-foreground">Model files</p>
                    <ModelFileList orderId={order.id} files={modelFiles} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status history</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusTimeline history={history} statuses={config.statuses} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2.5 text-sm">
                <DetailRow label="Buying date" value={formatDate(order.buying_date)} />
                <DetailRow
                  label="Delivery date"
                  value={order.delivery_date ? formatDate(order.delivery_date) : "—"}
                />
                <DetailRow label="Phone" value={order.phone ?? order.customers?.phone ?? "—"} />
                <DetailRow label="Email" value={order.email ?? order.customers?.email ?? "—"} />
                <DetailRow label="Payment method" value={order.payment_method ?? "—"} />
                <DetailRow label="Assigned to" value={order.assigned?.full_name ?? "Unassigned"} />
                <DetailRow label="Shipping address" value={order.shipping_address ?? "—"} multiline />
                {order.notes ? <DetailRow label="Notes" value={order.notes} multiline /> : null}
                <Separator />
                <DetailRow label="Created" value={formatDateTime(order.created_at)} />
                <DetailRow
                  label="Last updated"
                  value={`${formatDateTime(order.updated_at)}${order.updated_by_user ? ` by ${order.updated_by_user.full_name}` : ""}`}
                />
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className={multiline ? "space-y-0.5" : "flex items-baseline justify-between gap-3"}>
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={multiline ? "whitespace-pre-wrap" : "text-right"}>{value}</dd>
    </div>
  );
}
