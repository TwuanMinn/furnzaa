import { z } from "zod";
import { PHONE_RE } from "@/lib/users/schemas";

/** Shared validation for the Settings forms (client) and actions (server). */

export const BADGE_COLORS = ["slate", "blue", "indigo", "green", "amber", "red", "violet"] as const;
const badgeColor = z.enum(BADGE_COLORS);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Stable machine keys for statuses/priorities/materials/custom fields. */
const KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;

// ── My Profile ────────────────────────────────────────────────────────────────

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters").max(200),
  phone: z
    .string()
    .trim()
    .regex(PHONE_RE, "Enter a valid phone number")
    .max(25)
    .optional()
    .or(z.literal("")),
  department: z.string().trim().max(120).optional().or(z.literal("")),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional().or(z.literal("")),
  gender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"]).optional().or(z.literal("")),
  avatarUrl: z.string().url().max(1000).nullable().optional(),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    password: z.string().min(1, "Enter a new password").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ── Preferences ───────────────────────────────────────────────────────────────

export const LANDING_PAGES = [
  { value: "/dashboard", label: "Dashboard" },
  { value: "/orders", label: "Customer Orders Hub" },
  { value: "/products", label: "Products & Inventory" },
  { value: "/profit", label: "Profit & Cost Analysis" },
  { value: "/crm", label: "CRM & Loyalty" },
  { value: "/messages", label: "Messages" },
  { value: "/analytics", label: "Analytics" },
] as const;

export const DATE_FORMATS = ["MMM d, yyyy", "d/M/yyyy", "M/d/yyyy", "yyyy-MM-dd"] as const;
export const TIME_FORMATS = ["h:mm a", "HH:mm", "HH:mm:ss"] as const;

export const preferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  language: z.enum(["en", "vi"]),
  defaultLandingPage: z.enum(
    LANDING_PAGES.map((p) => p.value) as [string, ...string[]],
  ),
  sidebarDefaultState: z.enum(["expanded", "collapsed"]),
  dateFormat: z.enum(DATE_FORMATS),
  timeFormat: z.enum(TIME_FORMATS),
  timezone: z.string().trim().min(1).max(64),
});
export type PreferencesInput = z.infer<typeof preferencesSchema>;

export const notificationPrefsSchema = z.object({
  events: z.record(z.string(), z.boolean()),
  channel: z.enum(["in_app", "in_app_email"]),
  quietHours: z.object({
    enabled: z.boolean(),
    start: z.string().regex(TIME_RE, "Use HH:mm"),
    end: z.string().regex(TIME_RE, "Use HH:mm"),
  }),
});
export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;

// ── Company / Organization ────────────────────────────────────────────────────

export const CURRENCIES = ["VND", "USD", "EUR", "JPY", "KRW", "GBP"] as const;

export const companySchema = z.object({
  companyName: z.string().trim().min(2, "Company name is required").max(200),
  logoUrl: z.string().url().max(1000).nullable(),
  addressLine: z.string().trim().max(400).optional().or(z.literal("")),
  contactEmail: z.string().trim().email("Enter a valid email").max(320).optional().or(z.literal("")),
  contactPhone: z
    .string()
    .trim()
    .regex(PHONE_RE, "Enter a valid phone number")
    .max(25)
    .optional()
    .or(z.literal("")),
  currency: z.enum(CURRENCIES),
  defaultTaxRate: z.number().min(0, "Cannot be negative").max(100, "Max 100%"),
});
export type CompanyInput = z.infer<typeof companySchema>;

// ── Order configuration ───────────────────────────────────────────────────────

const statusDef = z.object({
  key: z.string().regex(KEY_RE, "Lowercase key, e.g. awaiting_pickup"),
  label: z.string().trim().min(1).max(40),
  color: badgeColor,
  isFinal: z.boolean(),
});
const priorityDef = z.object({
  key: z.string().regex(KEY_RE, "Lowercase key, e.g. urgent"),
  label: z.string().trim().min(1).max(40),
  color: badgeColor,
});
const customFieldDef = z.object({
  key: z.string().regex(KEY_RE, "Lowercase key, e.g. engraving_text"),
  label: z.string().trim().min(1).max(60),
  type: z.enum(["text", "number", "date"]),
});

function uniqueKeys(items: { key: string }[]) {
  return new Set(items.map((i) => i.key)).size === items.length;
}

export const orderConfigSchema = z
  .object({
    statuses: z.array(statusDef).min(2, "Keep at least two statuses").max(20),
    priorities: z.array(priorityDef).min(2, "Keep at least two priorities").max(10),
    codePrefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, "1-8 uppercase letters/digits"),
    codeFormat: z
      .string()
      .trim()
      .max(60)
      .refine((f) => f.includes("{seq}"), "Format must include {seq}"),
    customFields: z.array(customFieldDef).max(12),
  })
  .refine((v) => uniqueKeys(v.statuses), { message: "Status keys must be unique", path: ["statuses"] })
  .refine((v) => uniqueKeys(v.priorities), {
    message: "Priority keys must be unique",
    path: ["priorities"],
  })
  .refine((v) => uniqueKeys(v.customFields), {
    message: "Field keys must be unique",
    path: ["customFields"],
  })
  // Orders already in the DB keep their status/priority keys; deleting a key in
  // use would orphan rows, so the engine-critical keys must survive edits.
  .refine((v) => ["delivered", "returned", "shipped", "cancelled"].every((k) => v.statuses.some((s) => s.key === k)), {
    message: "delivered, shipped, returned and cancelled are required by the inventory/CRM hooks",
    path: ["statuses"],
  });
export type OrderConfigInput = z.infer<typeof orderConfigSchema>;

export const materialsSchema = z
  .object({
    materials: z
      .array(
        z.object({
          key: z.string().regex(KEY_RE, "Lowercase key, e.g. pla_matte"),
          label: z.string().trim().min(1).max(40),
          color: badgeColor,
          /** Minor units (cents) of the org currency per gram. */
          costPerGramCents: z.number().int().min(0).max(100_000_000),
          isActive: z.boolean(),
        }),
      )
      .min(1, "Keep at least one material")
      .max(40),
  })
  .refine((v) => uniqueKeys(v.materials), {
    message: "Material keys must be unique",
    path: ["materials"],
  });
export type MaterialsInput = z.infer<typeof materialsSchema>;

export const printerSchema = z.object({
  id: z.string().uuid().optional(),
  brand: z.string().trim().min(2, "Brand is required").max(60),
  model: z.string().trim().min(1, "Model is required").max(60),
  badgeColor: badgeColor,
});
export type PrinterInput = z.infer<typeof printerSchema>;

// ── Schedule configuration ────────────────────────────────────────────────────

export const scheduleConfigSchema = z.object({
  completedRetentionHours: z.number().int().min(1, "Min 1 hour").max(720, "Max 30 days"),
  overdueAlertPct: z.number().int().min(0, "Cannot be negative").max(500, "Max 500%"),
});
export type ScheduleConfigInput = z.infer<typeof scheduleConfigSchema>;

// ── Trending configuration ────────────────────────────────────────────────────

export const trendingConfigSchema = z
  .object({
    platforms: z
      .array(z.string().trim().min(1).max(60))
      .min(1, "Keep at least one platform")
      .max(30),
    statuses: z
      .array(
        z.object({
          key: z.string().regex(KEY_RE, "Lowercase key, e.g. researching"),
          label: z.string().trim().min(1).max(40),
          color: badgeColor,
        }),
      )
      .min(2, "Keep at least two statuses")
      .max(15),
    targetMarginPct: z.number().min(0, "Cannot be negative").max(95, "Max 95%"),
  })
  .refine((v) => uniqueKeys(v.statuses), {
    message: "Status keys must be unique",
    path: ["statuses"],
  })
  // promote-to-product auto-moves entries here; the key must survive edits.
  .refine((v) => v.statuses.some((s) => s.key === "in_production"), {
    message: "in_production is required by promote-to-product",
    path: ["statuses"],
  });
export type TrendingConfigInput = z.infer<typeof trendingConfigSchema>;

// ── Feedback configuration ────────────────────────────────────────────────────

export const feedbackConfigSchema = z
  .object({
    categories: z
      .array(z.string().trim().min(1).max(60))
      .min(1, "Keep at least one category")
      .max(20),
    severities: z
      .array(
        z.object({
          key: z.enum(["low", "medium", "high"]),
          label: z.string().trim().min(1).max(30),
          color: badgeColor,
        }),
      )
      .length(3, "Exactly three severity levels"),
    channels: z
      .array(z.string().trim().min(1).max(60))
      .min(1, "Keep at least one channel")
      .max(20),
    agingSlaDays: z.number().int().min(1, "Min 1 day").max(90, "Max 90 days"),
    negativeAlertEnabled: z.boolean(),
  })
  // The feedback table CHECKs severity IN (low, medium, high); the keys are fixed.
  .refine(
    (v) => (["low", "medium", "high"] as const).every((k) => v.severities.some((s) => s.key === k)),
    { message: "low, medium and high severities are all required", path: ["severities"] },
  );
export type FeedbackConfigInput = z.infer<typeof feedbackConfigSchema>;

// ── ROI / Investment configuration ─────────────────────────────────────────────

export const roiConfigSchema = z.object({
  targetRoiPct: z.number().min(0, "Cannot be negative").max(1000, "Max 1000%"),
  defaultPaybackMonths: z.number().int().min(0).max(600),
  trailingWindowMonths: z.number().int().min(1, "Min 1 month").max(60, "Max 60 months"),
  autoAttributionEnabled: z.boolean(),
});
export type RoiConfigInput = z.infer<typeof roiConfigSchema>;

/** A shared investment_categories / investment_projects row edit. Color is a
 *  display-only badge token (the picker only emits valid ones). */
export const investmentRefSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name is required").max(80),
  color: z.string().trim().min(1).max(20),
});
export type InvestmentRefInput = z.infer<typeof investmentRefSchema>;

// ── Messaging configuration ───────────────────────────────────────────────────

export const messagingConfigSchema = z.object({
  reactionEmojis: z
    .array(z.string().trim().min(1).max(16))
    .min(1, "Keep at least one emoji")
    .max(12, "Max 12 quick reactions"),
  inviteExpiryHours: z.number().int().min(1, "Min 1 hour").max(8760, "Max 1 year"),
  inviteMaxUses: z.number().int().min(1).max(10_000),
  allMentionPolicy: z.enum(["creator_admin", "members"]),
});
export type MessagingConfigInput = z.infer<typeof messagingConfigSchema>;

// ── Inventory configuration ───────────────────────────────────────────────────

export const inventoryConfigSchema = z.object({
  skuPrefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, "1-8 uppercase letters/digits"),
  skuFormat: z
    .string()
    .trim()
    .max(60)
    .refine((f) => f.includes("{seq}"), "Format must include {seq}"),
  barcodeFormat: z.enum(["EAN13", "EAN8", "UPC", "CODE128"]),
  defaultWarehouseId: z.string().uuid().nullable(),
  lowStockAlertsEnabled: z.boolean(),
});
export type InventoryConfigInput = z.infer<typeof inventoryConfigSchema>;

// ── Loyalty configuration ─────────────────────────────────────────────────────

export const loyaltyConfigSchema = z.object({
  voucherType: z.enum(["fixed", "percentage", "free_shipping"]),
  /** Minor units when fixed; whole percent when percentage. */
  voucherValue: z.number().int().min(0).max(1_000_000_000),
  voucherValidDays: z.number().int().min(1).max(730),
  pointsPerOrder: z.number().min(0).max(1000),
  pointsPer100Currency: z.number().min(0).max(1000),
});
export type LoyaltyConfigInput = z.infer<typeof loyaltyConfigSchema>;

// ── Marketing configuration ───────────────────────────────────────────────────

export const marketingConfigSchema = z.object({
  senderName: z.string().trim().min(1, "Sender name is required").max(120),
  senderEmail: z.string().trim().email("Enter a valid email").max(320),
  trackingEnabled: z.boolean(),
  quietEnabled: z.boolean(),
  quietStart: z.string().regex(TIME_RE, "Use HH:mm"),
  quietEnd: z.string().regex(TIME_RE, "Use HH:mm"),
});
export type MarketingConfigInput = z.infer<typeof marketingConfigSchema>;

// ── Data management ───────────────────────────────────────────────────────────

export const dataConfigSchema = z.object({
  logRetentionDays: z.number().int().min(7, "Min 7 days").max(3650, "Max 10 years"),
  logPurgeArchive: z.boolean(),
});
export type DataConfigInput = z.infer<typeof dataConfigSchema>;

// ── Security ──────────────────────────────────────────────────────────────────

export const securityConfigSchema = z.object({
  minLength: z.number().int().min(6, "Min 6").max(64),
  requireUpper: z.boolean(),
  requireNumber: z.boolean(),
  requireSymbol: z.boolean(),
  sessionTimeoutMin: z.number().int().min(5, "Min 5 minutes").max(10_080, "Max 7 days"),
  twoFactorRequired: z.boolean(),
  loginAttemptLimit: z.number().int().min(3, "Min 3").max(20),
  lockoutMinutes: z.number().int().min(1).max(1440),
});
export type SecurityConfigInput = z.infer<typeof securityConfigSchema>;

// ── Roles & permissions ───────────────────────────────────────────────────────

export const rolePermissionsSchema = z.object({
  /** Only the staff role is editable; admin always holds every permission. */
  roleKey: z.literal("staff"),
  permissionKeys: z.array(z.string().min(1).max(60)).max(200),
});
export type RolePermissionsInput = z.infer<typeof rolePermissionsSchema>;
