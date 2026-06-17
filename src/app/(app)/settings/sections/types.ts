import type { NotificationPrefs } from "@/lib/settings/notification-prefs";
import type { PreferencesInput } from "@/lib/settings/schemas";

/**
 * Serializable prop contracts between settings/page.tsx (server) and the
 * section components (client). Every section receives its `data` plus a
 * `canEdit` flag; sections render read-only (disabled inputs) without it.
 */

export type SectionId =
  | "profile"
  | "preferences"
  | "notifications"
  | "company"
  | "roles"
  | "orders"
  | "schedule"
  | "trending"
  | "feedback"
  | "roi"
  | "payroll"
  | "messaging"
  | "inventory"
  | "loyalty"
  | "marketing"
  | "data"
  | "security";

export interface ProfileData {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  birthday: string;
  gender: string;
  avatarUrl: string | null;
  roleName: string;
}

export type PreferencesData = PreferencesInput;

export type NotificationPrefsData = NotificationPrefs;

export interface CompanyData {
  companyName: string;
  logoUrl: string | null;
  addressLine: string;
  contactEmail: string;
  contactPhone: string;
  currency: string;
  defaultTaxRate: number;
}

export interface RolesData {
  /** Current DB grants for the staff role; admin always holds everything. */
  staffKeys: string[];
}

export interface OrdersConfigData {
  statuses: { key: string; label: string; color: string; isFinal: boolean }[];
  priorities: { key: string; label: string; color: string }[];
  codePrefix: string;
  codeFormat: string;
  customFields: { key: string; label: string; type: "text" | "number" | "date" }[];
  materials: {
    key: string;
    label: string;
    color: string;
    costPerGramCents: number;
    isActive: boolean;
  }[];
  printers: { id: string; brand: string; model: string; badgeColor: string; isActive: boolean }[];
  currency: string;
}

export interface ScheduleConfigData {
  completedRetentionHours: number;
  overdueAlertPct: number;
}

export interface TrendingConfigData {
  platforms: string[];
  statuses: { key: string; label: string; color: string }[];
  targetMarginPct: number;
}

export interface FeedbackConfigData {
  categories: string[];
  severities: { key: string; label: string; color: string }[];
  channels: string[];
  agingSlaDays: number;
  negativeAlertEnabled: boolean;
}

export interface RoiConfigData {
  targetRoiPct: number;
  defaultPaybackMonths: number;
  trailingWindowMonths: number;
  autoAttributionEnabled: boolean;
  categories: { id: string; name: string; color: string; isActive: boolean }[];
  projects: { id: string; name: string; color: string; isActive: boolean }[];
}

export interface PayrollHrData {
  currency: string;
  departments: { id: string; name: string; color: string; isActive: boolean }[];
  taxProfiles: {
    id: string;
    name: string;
    kind: "none" | "flat" | "fixed";
    ratePercent: number;
    fixedAmount: number;
    isActive: boolean;
  }[];
  employerProfiles: { id: string; name: string; ratePercent: number; isActive: boolean }[];
}

export interface MessagingData {
  reactionEmojis: string[];
  inviteExpiryHours: number;
  inviteMaxUses: number;
  allMentionPolicy: "creator_admin" | "members";
}

export interface InventoryData {
  skuPrefix: string;
  skuFormat: string;
  barcodeFormat: string;
  defaultWarehouseId: string | null;
  lowStockAlertsEnabled: boolean;
  warehouses: { id: string; name: string }[];
}

export interface LoyaltyData {
  voucherType: "fixed" | "percentage" | "free_shipping";
  voucherValue: number;
  voucherValidDays: number;
  pointsPerOrder: number;
  pointsPer100Currency: number;
  currency: string;
}

export interface MarketingData {
  senderName: string;
  senderEmail: string;
  trackingEnabled: boolean;
  quietEnabled: boolean;
  quietStart: string;
  quietEnd: string;
}

export interface DataMgmtData {
  logRetentionDays: number;
  logPurgeArchive: boolean;
  canPurge: boolean;
}

export interface SecurityData {
  minLength: number;
  requireUpper: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  sessionTimeoutMin: number;
  twoFactorRequired: boolean;
  loginAttemptLimit: number;
  lockoutMinutes: number;
}

/** The full bundle page.tsx assembles; absent key = section hidden. */
export interface SettingsBundle {
  profile: ProfileData;
  preferences: PreferencesData;
  notifications: NotificationPrefsData;
  company?: { data: CompanyData; canEdit: boolean };
  roles?: { data: RolesData; canEdit: boolean };
  orders?: { data: OrdersConfigData; canEdit: boolean };
  schedule?: { data: ScheduleConfigData; canEdit: boolean };
  trending?: { data: TrendingConfigData; canEdit: boolean };
  feedback?: { data: FeedbackConfigData; canEdit: boolean };
  roi?: { data: RoiConfigData; canEdit: boolean };
  payroll?: { data: PayrollHrData; canEdit: boolean };
  messaging?: { data: MessagingData; canEdit: boolean };
  inventory?: { data: InventoryData; canEdit: boolean };
  loyalty?: { data: LoyaltyData; canEdit: boolean };
  marketing?: { data: MarketingData; canEdit: boolean };
  data?: { data: DataMgmtData; canEdit: boolean };
  security?: { data: SecurityData; canEdit: boolean };
}
