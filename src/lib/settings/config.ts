import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRow } from "@/lib/supabase/types";

/**
 * Typed, cached reader for the organization_settings singleton (id = 'org').
 * Same per-worker 60s cache pattern as lib/orders/config.ts and
 * lib/export/branding.ts — mutations in lib/settings/actions.ts must call
 * invalidateOrgSettingsCache(); other workers self-heal within a minute.
 */

export interface PasswordPolicy {
  minLength: number;
  requireUpper: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

export interface MessagingConfig {
  reaction_emojis: string[];
  invite_link_defaults: { expiry_hours: number; max_uses: number };
  /** Who may @all a group: its creator + Admins, or every member. */
  all_mention_policy: "creator_admin" | "members";
}

export interface MarketingConfig {
  sender_name: string;
  sender_email: string;
  tracking_enabled: boolean;
  /** Local times "HH:mm"; campaign sends pause inside this window. */
  quiet_hours: { start: string; end: string } | null;
}

export interface VoucherDefaults {
  type: "fixed" | "percentage" | "free_shipping";
  value_cents: number;
  valid_days: number;
}

export interface CustomerScoreRules {
  points_per_order: number;
  points_per_100_currency: number;
}

export interface ScheduleConfig {
  completed_retention_hours: number;
  overdue_alert_pct: number;
}

export interface BadgeListEntry {
  key: string;
  label: string;
  color: string;
}

export interface TrendingConfig {
  platforms: string[];
  statuses: BadgeListEntry[];
  target_margin_pct: number;
}

export interface FeedbackConfig {
  categories: string[];
  severities: BadgeListEntry[];
  channels: string[];
  aging_sla_days: number;
  negative_alert_enabled: boolean;
}

export interface RoiConfig {
  target_roi_pct: number;
  default_payback_months: number;
  trailing_window_months: number;
  auto_attribution_enabled: boolean;
}

export interface OrgSettings {
  companyName: string;
  logoUrl: string | null;
  addressLine: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  currency: string;
  defaultTaxRate: number;
  orderCodePrefix: string;
  orderCodeFormat: string;
  skuPrefix: string;
  skuFormat: string;
  barcodeFormat: string;
  defaultWarehouseId: string | null;
  lowStockAlertsEnabled: boolean;
  voucherDefaults: VoucherDefaults;
  customerScoreRules: CustomerScoreRules;
  marketing: MarketingConfig;
  messaging: MessagingConfig;
  schedule: ScheduleConfig;
  trending: TrendingConfig;
  feedback: FeedbackConfig;
  roi: RoiConfig;
  passwordPolicy: PasswordPolicy;
  sessionTimeoutMin: number;
  twoFactorRequired: boolean;
  loginAttemptLimit: number;
  lockoutMinutes: number;
  logRetentionDays: number;
  logPurgeArchive: boolean;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUpper: true,
  requireNumber: true,
  requireSymbol: false,
};

export const DEFAULT_MESSAGING_CONFIG: MessagingConfig = {
  reaction_emojis: ["❤️", "😆", "😮", "😢", "👍", "👎"],
  invite_link_defaults: { expiry_hours: 168, max_uses: 25 },
  all_mention_policy: "creator_admin",
};

const num = (v: unknown, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);

function parsePolicy(raw: unknown): PasswordPolicy {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    minLength: Math.max(6, num(o.minLength, DEFAULT_PASSWORD_POLICY.minLength)),
    requireUpper: bool(o.requireUpper, DEFAULT_PASSWORD_POLICY.requireUpper),
    requireNumber: bool(o.requireNumber, DEFAULT_PASSWORD_POLICY.requireNumber),
    requireSymbol: bool(o.requireSymbol, DEFAULT_PASSWORD_POLICY.requireSymbol),
  };
}

function parseMessaging(raw: unknown): MessagingConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  const link = (o.invite_link_defaults ?? {}) as Record<string, unknown>;
  const emojis = Array.isArray(o.reaction_emojis)
    ? o.reaction_emojis.filter((e): e is string => typeof e === "string" && e.length > 0)
    : [];
  return {
    reaction_emojis: emojis.length > 0 ? emojis : DEFAULT_MESSAGING_CONFIG.reaction_emojis,
    invite_link_defaults: {
      expiry_hours: num(link.expiry_hours, 168),
      max_uses: num(link.max_uses, 25),
    },
    all_mention_policy: o.all_mention_policy === "members" ? "members" : "creator_admin",
  };
}

function parseMarketing(raw: unknown): MarketingConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  const q = o.quiet_hours as Record<string, unknown> | null | undefined;
  return {
    sender_name: str(o.sender_name, "Furnza"),
    sender_email: str(o.sender_email, "no-reply@furnza.local"),
    tracking_enabled: bool(o.tracking_enabled, true),
    quiet_hours:
      q && typeof q.start === "string" && typeof q.end === "string"
        ? { start: q.start, end: q.end }
        : null,
  };
}

function parseBadgeList(raw: unknown, fallback: BadgeListEntry[]): BadgeListEntry[] {
  if (!Array.isArray(raw)) return fallback;
  const list = raw
    .map((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      return { key: str(o.key, ""), label: str(o.label, ""), color: str(o.color, "slate") };
    })
    .filter((e) => e.key && e.label);
  return list.length > 0 ? list : fallback;
}

function parseStringList(raw: unknown, fallback: string[]): string[] {
  const list = Array.isArray(raw)
    ? raw.filter((e): e is string => typeof e === "string" && e.length > 0)
    : [];
  return list.length > 0 ? list : fallback;
}

export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  completed_retention_hours: 24,
  overdue_alert_pct: 20,
};

export const DEFAULT_TRENDING_CONFIG: TrendingConfig = {
  platforms: ["MakerWorld", "Printables", "Thingiverse", "Cults3D", "Etsy", "TikTok", "Facebook", "Shopee", "Other"],
  statuses: [
    { key: "researching", label: "Researching", color: "blue" },
    { key: "approved", label: "Approved", color: "green" },
    { key: "in_production", label: "In Production", color: "indigo" },
    { key: "selling", label: "Selling", color: "violet" },
    { key: "rejected", label: "Rejected", color: "red" },
    { key: "archived", label: "Archived", color: "slate" },
  ],
  target_margin_pct: 20,
};

export const DEFAULT_FEEDBACK_CONFIG: FeedbackConfig = {
  categories: ["Product Quality", "Print Defect", "Shipping/Delivery", "Customer Service", "Pricing", "Other"],
  severities: [
    { key: "low", label: "Low", color: "slate" },
    { key: "medium", label: "Medium", color: "amber" },
    { key: "high", label: "High", color: "red" },
  ],
  channels: ["In person", "Phone", "Facebook", "Zalo", "TikTok", "Email", "Other"],
  aging_sla_days: 7,
  negative_alert_enabled: true,
};

/** Exported: the cron runner parses schedule_config it reads via the admin client. */
export function parseScheduleConfig(raw: unknown): ScheduleConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    completed_retention_hours: Math.max(1, num(o.completed_retention_hours, 24)),
    overdue_alert_pct: Math.max(0, num(o.overdue_alert_pct, 20)),
  };
}

function parseTrending(raw: unknown): TrendingConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    platforms: parseStringList(o.platforms, DEFAULT_TRENDING_CONFIG.platforms),
    statuses: parseBadgeList(o.statuses, DEFAULT_TRENDING_CONFIG.statuses),
    target_margin_pct: num(o.target_margin_pct, 20),
  };
}

/** Exported: the cron runner parses feedback_config it reads via the admin client. */
export function parseFeedbackConfig(raw: unknown): FeedbackConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    categories: parseStringList(o.categories, DEFAULT_FEEDBACK_CONFIG.categories),
    severities: parseBadgeList(o.severities, DEFAULT_FEEDBACK_CONFIG.severities),
    channels: parseStringList(o.channels, DEFAULT_FEEDBACK_CONFIG.channels),
    aging_sla_days: Math.max(1, num(o.aging_sla_days, 7)),
    negative_alert_enabled: bool(o.negative_alert_enabled, true),
  };
}

export const DEFAULT_ROI_CONFIG: RoiConfig = {
  target_roi_pct: 20,
  default_payback_months: 12,
  trailing_window_months: 6,
  auto_attribution_enabled: false,
};

/** Exported: cron auto-attribution reads roi_config via the admin client. */
export function parseRoiConfig(raw: unknown): RoiConfig {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    target_roi_pct: num(o.target_roi_pct, 20),
    default_payback_months: Math.max(0, num(o.default_payback_months, 12)),
    trailing_window_months: Math.max(1, num(o.trailing_window_months, 6)),
    auto_attribution_enabled: bool(o.auto_attribution_enabled, false),
  };
}

function parseVoucherDefaults(raw: unknown): VoucherDefaults {
  const o = (raw ?? {}) as Record<string, unknown>;
  const type = o.type === "percentage" || o.type === "free_shipping" ? o.type : "fixed";
  return { type, value_cents: num(o.value_cents, 1000), valid_days: num(o.valid_days, 30) };
}

function parseScoreRules(raw: unknown): CustomerScoreRules {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    points_per_order: num(o.points_per_order, 1),
    points_per_100_currency: num(o.points_per_100_currency, 1),
  };
}

type OrgRow = {
  company_name: string;
  logo_url: string | null;
  address_line: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  currency: string;
  default_tax_rate: number | string;
  order_code_prefix: string;
  order_code_format: string;
  sku_prefix: string;
  sku_format: string;
  barcode_format: string;
  default_warehouse_id: string | null;
  low_stock_alerts_enabled: boolean;
  voucher_defaults: unknown;
  customer_score_rules: unknown;
  marketing_config: unknown;
  messaging_config: unknown;
  schedule_config: unknown;
  trending_config: unknown;
  feedback_config: unknown;
  roi_config: unknown;
  password_policy: unknown;
  session_timeout_min: number;
  two_factor_required: boolean;
  login_attempt_limit: number;
  lockout_minutes: number;
  log_retention_days: number;
  log_purge_archive: boolean;
};

let cache: { at: number; value: OrgSettings } | null = null;

export async function getOrgSettings(): Promise<OrgSettings> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;

  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_settings")
    .select(
      `company_name, logo_url, address_line, contact_email, contact_phone, currency,
       default_tax_rate, order_code_prefix, order_code_format, sku_prefix, sku_format,
       barcode_format, default_warehouse_id, low_stock_alerts_enabled, voucher_defaults,
       customer_score_rules, marketing_config, messaging_config, schedule_config,
       trending_config, feedback_config, roi_config, password_policy,
       session_timeout_min, two_factor_required, login_attempt_limit, lockout_minutes,
       log_retention_days, log_purge_archive`,
    )
    .eq("id", "org")
    .maybeSingle();
  const row = asRow<OrgRow>(data);

  const value: OrgSettings = {
    companyName: row?.company_name ?? "Furnza",
    logoUrl: row?.logo_url ?? null,
    addressLine: row?.address_line ?? null,
    contactEmail: row?.contact_email ?? null,
    contactPhone: row?.contact_phone ?? null,
    currency: row?.currency ?? "USD",
    defaultTaxRate: Number(row?.default_tax_rate ?? 0),
    orderCodePrefix: row?.order_code_prefix ?? "FZ",
    orderCodeFormat: row?.order_code_format ?? "{prefix}-{yyyy}-{seq}",
    skuPrefix: row?.sku_prefix ?? "SKU",
    skuFormat: row?.sku_format ?? "{prefix}-{seq}",
    barcodeFormat: row?.barcode_format ?? "EAN13",
    defaultWarehouseId: row?.default_warehouse_id ?? null,
    lowStockAlertsEnabled: row?.low_stock_alerts_enabled ?? true,
    voucherDefaults: parseVoucherDefaults(row?.voucher_defaults),
    customerScoreRules: parseScoreRules(row?.customer_score_rules),
    marketing: parseMarketing(row?.marketing_config),
    messaging: parseMessaging(row?.messaging_config),
    schedule: parseScheduleConfig(row?.schedule_config),
    trending: parseTrending(row?.trending_config),
    feedback: parseFeedbackConfig(row?.feedback_config),
    roi: parseRoiConfig(row?.roi_config),
    passwordPolicy: parsePolicy(row?.password_policy),
    sessionTimeoutMin: row?.session_timeout_min ?? 60,
    twoFactorRequired: row?.two_factor_required ?? false,
    loginAttemptLimit: row?.login_attempt_limit ?? 5,
    lockoutMinutes: row?.lockout_minutes ?? 15,
    logRetentionDays: row?.log_retention_days ?? 365,
    logPurgeArchive: row?.log_purge_archive ?? true,
  };

  cache = { at: Date.now(), value };
  return value;
}

export function invalidateOrgSettingsCache() {
  cache = null;
}

/** Validate a candidate password against the configured policy. */
export function passwordPolicyError(password: string, policy: PasswordPolicy): string | null {
  if (password.length < policy.minLength)
    return `Password must be at least ${policy.minLength} characters.`;
  if (policy.requireUpper && !/[A-Z]/.test(password))
    return "Password must include an uppercase letter.";
  if (policy.requireNumber && !/[0-9]/.test(password)) return "Password must include a number.";
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password))
    return "Password must include a symbol.";
  return null;
}
