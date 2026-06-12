import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { asRow, asRows } from "@/lib/supabase/types";
import { getOrgSettings } from "@/lib/settings/config";
import { parseNotificationPrefs } from "@/lib/settings/notification-prefs";
import { PageHeader } from "@/components/states";
import { SettingsClient } from "./settings-client";
import { getOrderConfigRaw } from "./sections/server-helpers";
import type { SettingsBundle } from "./sections/types";

export const metadata = { title: "Settings" };

/**
 * Settings (Module 11). Profile / Preferences / Notifications are available
 * to every signed-in user; organization sections appear with settings.view
 * and unlock with their section-specific settings.edit_* permission.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [user, sp] = await Promise.all([getSessionUser(), searchParams]);
  if (!user) redirect("/login");

  const supabase = await createClient();
  const canView = user.permissions.has("settings.view");
  const editable = (key: Parameters<typeof user.permissions.has>[0]) =>
    user.permissions.has(key);
  const showOrg = (key: Parameters<typeof user.permissions.has>[0]) =>
    canView || user.permissions.has(key);

  const needsOrg =
    showOrg("settings.edit_company") ||
    showOrg("settings.edit_order_config") ||
    showOrg("settings.edit_trending") ||
    showOrg("settings.edit_feedback") ||
    showOrg("settings.edit_messaging") ||
    showOrg("settings.edit_inventory") ||
    showOrg("settings.edit_loyalty") ||
    showOrg("settings.edit_marketing") ||
    showOrg("settings.edit_data") ||
    showOrg("settings.edit_security");

  const [profileRes, prefsRes, org, printersRes, warehousesRes, staffPermsRes] =
    await Promise.all([
      supabase
        .from("users")
        .select("full_name, email, phone, department, birthday, gender, avatar_url")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("user_preferences")
        .select(
          "theme, language, default_landing_page, sidebar_default_state, date_format, time_format, timezone, notification_prefs",
        )
        .eq("user_id", user.id)
        .maybeSingle(),
      needsOrg ? getOrgSettings() : Promise.resolve(null),
      showOrg("settings.edit_order_config")
        ? supabase
            .from("printers")
            .select("id, brand, model, badge_color, is_active")
            .is("deleted_at", null)
            .order("brand", { ascending: true })
            .order("model", { ascending: true })
            .limit(200)
        : Promise.resolve({ data: null }),
      showOrg("settings.edit_inventory")
        ? supabase.from("warehouses").select("id, name").order("name").limit(100)
        : Promise.resolve({ data: null }),
      showOrg("settings.edit_roles")
        ? supabase
            .from("role_permissions")
            .select("roles!inner(key), permissions(key)")
            .eq("roles.key", "staff")
            .limit(500)
        : Promise.resolve({ data: null }),
    ]);

  const profile = asRow<{
    full_name: string;
    email: string;
    phone: string | null;
    department: string | null;
    birthday: string | null;
    gender: string | null;
    avatar_url: string | null;
  }>(profileRes.data);
  const prefs = asRow<{
    theme: string;
    language: string;
    default_landing_page: string;
    sidebar_default_state: string;
    date_format: string;
    time_format: string;
    timezone: string;
    notification_prefs: unknown;
  }>(prefsRes.data);

  const bundle: SettingsBundle = {
    profile: {
      id: user.id,
      fullName: profile?.full_name ?? user.fullName,
      email: profile?.email ?? user.email,
      phone: profile?.phone ?? "",
      department: profile?.department ?? "",
      birthday: profile?.birthday ?? "",
      gender: profile?.gender ?? "",
      avatarUrl: profile?.avatar_url ?? null,
      roleName: user.roleName,
    },
    preferences: {
      theme: (prefs?.theme as "light" | "dark" | "system") ?? "system",
      language: (prefs?.language as "en" | "vi") ?? "en",
      defaultLandingPage: prefs?.default_landing_page ?? "/dashboard",
      sidebarDefaultState:
        (prefs?.sidebar_default_state as "expanded" | "collapsed") ?? "expanded",
      dateFormat:
        (prefs?.date_format as "MMM d, yyyy" | "d/M/yyyy" | "M/d/yyyy" | "yyyy-MM-dd") ??
        "MMM d, yyyy",
      timeFormat: (prefs?.time_format as "h:mm a" | "HH:mm" | "HH:mm:ss") ?? "h:mm a",
      timezone: prefs?.timezone ?? "UTC",
    },
    notifications: parseNotificationPrefs(prefs?.notification_prefs),
  };

  if (org) {
    if (showOrg("settings.edit_company")) {
      bundle.company = {
        canEdit: editable("settings.edit_company"),
        data: {
          companyName: org.companyName,
          logoUrl: org.logoUrl,
          addressLine: org.addressLine ?? "",
          contactEmail: org.contactEmail ?? "",
          contactPhone: org.contactPhone ?? "",
          currency: org.currency,
          defaultTaxRate: org.defaultTaxRate,
        },
      };
    }
    if (showOrg("settings.edit_roles")) {
      const staffKeys = asRows<{ permissions: { key: string } | null }>(staffPermsRes.data)
        .map((r) => r.permissions?.key)
        .filter((k): k is string => !!k)
        .sort();
      bundle.roles = { canEdit: editable("settings.edit_roles"), data: { staffKeys } };
    }
    if (showOrg("settings.edit_order_config")) {
      // Statuses/priorities/materials come straight from the org row so the
      // editor sees exactly what is stored (incl. inactive materials).
      const printers = asRows<{
        id: string;
        brand: string;
        model: string;
        badge_color: string;
        is_active: boolean;
      }>(printersRes.data);
      const raw = await getOrderConfigRaw();
      bundle.orders = {
        canEdit: editable("settings.edit_order_config"),
        data: {
          statuses: raw.statuses,
          priorities: raw.priorities,
          codePrefix: org.orderCodePrefix,
          codeFormat: org.orderCodeFormat,
          customFields: raw.customFields,
          materials: raw.materials,
          printers: printers.map((p) => ({
            id: p.id,
            brand: p.brand,
            model: p.model,
            badgeColor: p.badge_color,
            isActive: p.is_active,
          })),
          currency: org.currency,
        },
      };
    }
    if (showOrg("settings.edit_order_config")) {
      // Schedule config shares the orders-config audience: both are print ops.
      bundle.schedule = {
        canEdit: editable("settings.edit_order_config"),
        data: {
          completedRetentionHours: org.schedule.completed_retention_hours,
          overdueAlertPct: org.schedule.overdue_alert_pct,
        },
      };
    }
    if (showOrg("settings.edit_trending")) {
      bundle.trending = {
        canEdit: editable("settings.edit_trending"),
        data: {
          platforms: org.trending.platforms,
          statuses: org.trending.statuses,
          targetMarginPct: org.trending.target_margin_pct,
        },
      };
    }
    if (showOrg("settings.edit_feedback")) {
      bundle.feedback = {
        canEdit: editable("settings.edit_feedback"),
        data: {
          categories: org.feedback.categories,
          severities: org.feedback.severities,
          channels: org.feedback.channels,
          agingSlaDays: org.feedback.aging_sla_days,
          negativeAlertEnabled: org.feedback.negative_alert_enabled,
        },
      };
    }
    if (showOrg("settings.edit_messaging")) {
      bundle.messaging = {
        canEdit: editable("settings.edit_messaging"),
        data: {
          reactionEmojis: org.messaging.reaction_emojis,
          inviteExpiryHours: org.messaging.invite_link_defaults.expiry_hours,
          inviteMaxUses: org.messaging.invite_link_defaults.max_uses,
          allMentionPolicy: org.messaging.all_mention_policy,
        },
      };
    }
    if (showOrg("settings.edit_inventory")) {
      bundle.inventory = {
        canEdit: editable("settings.edit_inventory"),
        data: {
          skuPrefix: org.skuPrefix,
          skuFormat: org.skuFormat,
          barcodeFormat: org.barcodeFormat,
          defaultWarehouseId: org.defaultWarehouseId,
          lowStockAlertsEnabled: org.lowStockAlertsEnabled,
          warehouses: asRows<{ id: string; name: string }>(warehousesRes.data),
        },
      };
    }
    if (showOrg("settings.edit_loyalty")) {
      bundle.loyalty = {
        canEdit: editable("settings.edit_loyalty"),
        data: {
          voucherType: org.voucherDefaults.type,
          voucherValue: org.voucherDefaults.value_cents,
          voucherValidDays: org.voucherDefaults.valid_days,
          pointsPerOrder: org.customerScoreRules.points_per_order,
          pointsPer100Currency: org.customerScoreRules.points_per_100_currency,
          currency: org.currency,
        },
      };
    }
    if (showOrg("settings.edit_marketing")) {
      bundle.marketing = {
        canEdit: editable("settings.edit_marketing"),
        data: {
          senderName: org.marketing.sender_name,
          senderEmail: org.marketing.sender_email,
          trackingEnabled: org.marketing.tracking_enabled,
          quietEnabled: org.marketing.quiet_hours !== null,
          quietStart: org.marketing.quiet_hours?.start ?? "21:00",
          quietEnd: org.marketing.quiet_hours?.end ?? "08:00",
        },
      };
    }
    if (showOrg("settings.edit_data")) {
      bundle.data = {
        canEdit: editable("settings.edit_data"),
        data: {
          logRetentionDays: org.logRetentionDays,
          logPurgeArchive: org.logPurgeArchive,
          canPurge: user.permissions.has("logs.purge"),
        },
      };
    }
    if (showOrg("settings.edit_security")) {
      bundle.security = {
        canEdit: editable("settings.edit_security"),
        data: {
          minLength: org.passwordPolicy.minLength,
          requireUpper: org.passwordPolicy.requireUpper,
          requireNumber: org.passwordPolicy.requireNumber,
          requireSymbol: org.passwordPolicy.requireSymbol,
          sessionTimeoutMin: org.sessionTimeoutMin,
          twoFactorRequired: org.twoFactorRequired,
          loginAttemptLimit: org.loginAttemptLimit,
          lockoutMinutes: org.lockoutMinutes,
        },
      };
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        title="Settings"
        description="Profile, preferences and organization configuration."
      />
      <div className="mt-6">
        <SettingsClient bundle={bundle} initialTab={sp.tab ?? null} />
      </div>
    </div>
  );
}
