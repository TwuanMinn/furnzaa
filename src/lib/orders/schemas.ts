import { z } from "zod";

/** Shared validation for the order form (client) and actions (server). */

export const ORDER_PHONE_RE = /^[+\d][\d\s\-().]{5,24}$/;

export const orderItemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required").max(300),
  quantity: z.coerce.number().int("Whole numbers only").min(0).max(1_000_000),
  /** Decimal string/number in major units; converted to cents server-side. */
  unitPrice: z.coerce.number().min(0, "Price can’t be negative").max(100_000_000),
  /** Catalog link — null/absent = legacy free-text line (no stock movement). */
  productId: z.string().uuid().nullable().optional(),
  variantId: z.string().uuid().nullable().optional(),
});

/** Manifest entry for an uploaded 3D model file (binary in 'models' bucket). */
export const modelFileSchema = z.object({
  name: z.string().trim().min(1).max(300),
  path: z.string().trim().min(1).max(500),
  size_bytes: z.number().int().min(0),
  mime: z.string().max(150),
});
export type ModelFile = z.infer<typeof modelFileSchema>;

export const MODEL_FILE_EXTENSIONS = [".stl", ".3mf", ".step", ".stp", ".obj"] as const;
export const MODEL_FILE_MAX_BYTES = 100 * 1024 * 1024; // matches the bucket limit

export const customerRefSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), id: z.string().uuid() }),
  z.object({
    mode: z.literal("new"),
    name: z.string().trim().min(2, "Customer name is required").max(200),
  }),
]);

export const orderFormSchema = z.object({
  customer: customerRefSchema,
  /** Blank → server generates one atomically via next_order_code(). */
  orderCode: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9_-]*$/, "Letters, numbers, dashes and underscores only")
    .optional()
    .or(z.literal("")),
  buyingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Buying date is required"),
  priority: z.string().trim().min(1, "Choose a priority").max(40),
  status: z.string().trim().min(1, "Choose a status").max(40),
  phone: z
    .string()
    .trim()
    .regex(ORDER_PHONE_RE, "Enter a valid phone number")
    .max(25)
    .optional()
    .or(z.literal("")),
  email: z.string().trim().email("Enter a valid email").max(320).optional().or(z.literal("")),
  items: z.array(orderItemSchema).min(1, "Add at least one line item").max(200),
  deliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  shippingAddress: z.string().trim().max(1000).optional().or(z.literal("")),
  paymentMethod: z.string().trim().max(80).optional().or(z.literal("")),
  paymentStatus: z.enum(["paid", "unpaid", "refunded"]),
  assignedStaffId: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
  /** Storage path within the receipts bucket (uploaded client-side). */
  receiptPath: z.string().trim().max(500).optional().or(z.literal("")),

  // ── Print job (printer = catalog FK; material keys validated server-side) ──
  printerId: z.string().uuid().optional().or(z.literal("")),
  /** Hours + minutes from the form, already combined into total minutes. */
  estimatedPrintMinutes: z.coerce.number().int().min(0).max(60 * 24 * 365).default(0),
  actualPrintMinutes: z.coerce.number().int().min(0).max(60 * 24 * 365).default(0),
  materialType: z.string().trim().max(60).optional().or(z.literal("")),
  materialColor: z.string().trim().max(60).optional().or(z.literal("")),
  filamentUsedGrams: z.coerce.number().min(0).max(1_000_000).default(0),
  nozzleSizeMm: z.coerce.number().min(0).max(10).optional().or(z.literal("")),
  layerHeightMm: z.coerce.number().min(0).max(10).optional().or(z.literal("")),
  infillPercent: z.coerce.number().int().min(0).max(100).optional().or(z.literal("")),
  postProcessing: z.string().trim().max(1000).optional().or(z.literal("")),
  modelFiles: z.array(modelFileSchema).max(10).default([]),
  /** Validated + redeemed server-side via the voucher engine on create. */
  voucherCode: z.string().trim().max(60).optional().or(z.literal("")),
});

export type OrderFormInput = z.infer<typeof orderFormSchema>;

export const orderStatusChangeSchema = z.object({
  orderId: z.string().uuid(),
  status: z.string().trim().min(1).max(40),
  comment: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type OrderStatusChangeInput = z.infer<typeof orderStatusChangeSchema>;

/** Bulk actions over a checkbox selection in the Orders list. */
export const BULK_ORDER_ACTIONS = ["delete", "restore", "assign"] as const;
export type BulkOrderAction = (typeof BULK_ORDER_ACTIONS)[number];

export const bulkOrderActionSchema = z.object({
  action: z.enum(BULK_ORDER_ACTIONS),
  orderIds: z
    .array(z.string().uuid())
    .min(1, "Select at least one order")
    .max(500, "Select up to 500 orders at once"),
  /** assign only: a staff user id, or null to unassign. */
  assignedStaffId: z.string().uuid().nullable().optional(),
});
export type BulkOrderActionInput = z.infer<typeof bulkOrderActionSchema>;

export const PAYMENT_STATUSES = [
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "refunded", label: "Refunded" },
] as const;

export const PAYMENT_METHODS = [
  "Card",
  "Cash",
  "Bank transfer",
  "PayPal",
  "Financing",
  "Other",
] as const;
