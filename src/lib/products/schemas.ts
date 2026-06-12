import { z } from "zod";

/** Money arrives from forms as decimal strings ("12.99") → integer cents. */
const money = z
  .union([z.string(), z.number()])
  .transform((v) => {
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  })
  .pipe(z.number().int().min(0, "Must be ≥ 0").max(1_000_000_000));

export const productSchema = z.object({
  name: z.string().trim().min(2, "Product name is required").max(200),
  categoryId: z.string().uuid().nullable().optional(),
  barcode: z.string().trim().max(64).optional().or(z.literal("")),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  costPriceCents: money,
  sellingPriceCents: money,
  laborCostCents: money.optional().default(0),
  packagingCostCents: money.optional().default(0),
  overheadCostCents: money.optional().default(0),
  minimumStock: z.coerce.number().int().min(0).max(1_000_000).default(0),
  status: z.enum(["active", "inactive", "discontinued"]).default("active"),
  imageUrl: z.string().max(1000).nullable().optional(),
});
export type ProductInput = z.infer<typeof productSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Category name is required").max(120),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const adjustStockSchema = z.object({
  productId: z.string().uuid(),
  movementType: z.enum(["purchase", "adjustment", "transfer", "return"]),
  /** Signed quantity: positive = stock in, negative = stock out. */
  quantity: z.coerce.number().int().refine((n) => n !== 0, "Quantity cannot be zero"),
  warehouseId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export const supplierSchema = z.object({
  companyName: z.string().trim().min(2, "Company name is required").max(200),
  contactName: z.string().trim().max(200).optional().or(z.literal("")),
  email: z.string().trim().email("Invalid email").max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const purchaseOrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1, "Qty must be ≥ 1").max(1_000_000),
  unitCostCents: money,
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string().uuid({ message: "Pick a supplier" }),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  items: z.array(purchaseOrderItemSchema).min(1, "Add at least one line item"),
});
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;

export const productionOrderSchema = z.object({
  productId: z.string().uuid({ message: "Pick a finished product" }),
  quantity: z.coerce.number().int().min(1, "Qty must be ≥ 1").max(1_000_000),
  laborCostCents: money.optional().default(0),
  packagingCostCents: money.optional().default(0),
  overheadCostCents: money.optional().default(0),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type ProductionOrderInput = z.infer<typeof productionOrderSchema>;

export const bomLineSchema = z.object({
  finishedProductId: z.string().uuid(),
  componentProductId: z.string().uuid(),
  quantityPerUnit: z.coerce.number().positive("Must be > 0").max(100_000),
});
export type BomLineInput = z.infer<typeof bomLineSchema>;
