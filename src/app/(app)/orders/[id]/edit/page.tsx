import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { asRow, asRows } from "@/lib/supabase/types";
import { getOrderConfig } from "@/lib/orders/config";
import { PageHeader } from "@/components/states";
import { OrderForm } from "../../order-form";
import type { StaffOption } from "@/app/api/staff/route";

export const metadata = { title: "Edit order" };

type EditableOrder = {
  id: string;
  order_code: string;
  customer_id: string;
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
  assigned_staff_id: string | null;
  is_active: boolean;
  printer_id: string | null;
  estimated_print_minutes: number | null;
  actual_print_minutes: number | null;
  material_type: string | null;
  material_color: string | null;
  filament_used_grams: number | null;
  nozzle_size_mm: number | null;
  layer_height_mm: number | null;
  infill_percent: number | null;
  post_processing: string | null;
  model_files: { name: string; path: string; size_bytes: number; mime: string }[];
  customers: { name: string } | null;
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.permissions.has("orders.edit")) redirect(`/orders/${id}`);

  const supabase = await createClient();
  const [orderRes, itemsRes, config, staffRes] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_code, customer_id, buying_date, priority, status, phone, email, shipping_address, delivery_date, payment_method, payment_status, notes, receipt_url, assigned_staff_id, is_active, printer_id, estimated_print_minutes, actual_print_minutes, material_type, material_color, filament_used_grams, nozzle_size_mm, layer_height_mm, infill_percent, post_processing, model_files, customers(name)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("name, quantity, unit_price_cents, product_id, variant_id")
      .eq("order_id", id)
      .order("sort_order", { ascending: true }),
    getOrderConfig(),
    supabase
      .from("users")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name", { ascending: true })
      .limit(100),
  ]);

  const order = asRow<EditableOrder>(orderRes.data);
  if (!order || !order.is_active) notFound();
  const items = asRows<{
    name: string;
    quantity: number;
    unit_price_cents: number;
    product_id: string | null;
    variant_id: string | null;
  }>(itemsRes.data);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <PageHeader
        title={`Edit ${order.order_code}`}
        description="Changes are tracked — status edits land in the order’s history and every save is logged."
      />
      <OrderForm
        mode="edit"
        orderId={order.id}
        statuses={config.statuses}
        priorities={config.priorities}
        printers={config.printers}
        materials={config.materials}
        staff={asRows<StaffOption>(staffRes.data)}
        currency={config.currency}
        taxRatePercent={config.defaultTaxRate}
        initial={{
          customer: { mode: "existing", id: order.customer_id },
          customerName: order.customers?.name ?? "Customer",
          orderCode: order.order_code,
          buyingDate: order.buying_date,
          priority: order.priority,
          status: order.status,
          phone: order.phone ?? "",
          email: order.email ?? "",
          items: items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unit_price_cents / 100,
            productId: item.product_id,
            variantId: item.variant_id,
          })),
          deliveryDate: order.delivery_date ?? "",
          shippingAddress: order.shipping_address ?? "",
          paymentMethod: order.payment_method ?? "",
          paymentStatus: order.payment_status as "paid" | "unpaid" | "refunded",
          assignedStaffId: order.assigned_staff_id ?? "",
          notes: order.notes ?? "",
          receiptPath: order.receipt_url ?? "",
          receiptFileName: order.receipt_url ? order.receipt_url.split("/").pop() : undefined,
          printerId: order.printer_id ?? "",
          estimatedPrintMinutes: order.estimated_print_minutes ?? 0,
          actualPrintMinutes: order.actual_print_minutes ?? 0,
          materialType: order.material_type ?? "",
          materialColor: order.material_color ?? "",
          filamentUsedGrams: Number(order.filament_used_grams ?? 0),
          nozzleSizeMm: order.nozzle_size_mm ? Number(order.nozzle_size_mm) : "",
          layerHeightMm: order.layer_height_mm ? Number(order.layer_height_mm) : "",
          infillPercent: order.infill_percent ?? "",
          postProcessing: order.post_processing ?? "",
          modelFiles: Array.isArray(order.model_files) ? order.model_files : [],
        }}
      />
    </div>
  );
}
