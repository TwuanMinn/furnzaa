"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows, dbInsert, dbUpdate } from "@/lib/supabase/types";
import {
  requirePermission,
  requireUser,
  invalidateRolePermissionsCache,
} from "@/lib/rbac/guards";
import { fail, type ActionResult } from "@/lib/actions/result";
import { ALL_PERMISSION_KEYS, type PermissionKey } from "@/lib/rbac/permissions";
import { logActivity } from "@/lib/activity/log";
import { invalidateBrandingCache } from "@/lib/export/branding";
import { invalidateOrderConfigCache } from "@/lib/orders/config";
import { getOrgSettings, invalidateOrgSettingsCache, passwordPolicyError } from "./config";
import {
  changePasswordSchema,
  companySchema,
  dataConfigSchema,
  feedbackConfigSchema,
  inventoryConfigSchema,
  loyaltyConfigSchema,
  marketingConfigSchema,
  materialsSchema,
  messagingConfigSchema,
  notificationPrefsSchema,
  orderConfigSchema,
  preferencesSchema,
  printerSchema,
  profileSchema,
  rolePermissionsSchema,
  scheduleConfigSchema,
  securityConfigSchema,
  trendingConfigSchema,
  type ChangePasswordInput,
  type CompanyInput,
  type DataConfigInput,
  type FeedbackConfigInput,
  type InventoryConfigInput,
  type LoyaltyConfigInput,
  type MarketingConfigInput,
  type MaterialsInput,
  type MessagingConfigInput,
  type NotificationPrefsInput,
  type OrderConfigInput,
  type PreferencesInput,
  type PrinterInput,
  type ProfileInput,
  type RolePermissionsInput,
  type ScheduleConfigInput,
  type TrendingConfigInput,
} from "./schemas";

/** Settings server actions (Module 11). Every mutation: requirePermission →
 * zod → write → logActivity → invalidate the relevant per-worker caches. */

export type SettingsResult<T = undefined> = ActionResult<T>;

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Invalid input";
}

/** Read selected org columns for before/after audit diffs. */
async function orgBefore(columns: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organization_settings")
    .select(columns)
    .eq("id", "org")
    .maybeSingle();
  return (data ?? null) as Record<string, unknown> | null;
}

async function updateOrg(
  patch: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("organization_settings")
    .update(dbUpdate("organization_settings", patch))
    .eq("id", "org");
  return { error: error?.message ?? null };
}

function invalidateAll() {
  invalidateOrgSettingsCache();
  invalidateBrandingCache();
  invalidateOrderConfigCache();
}

// ── My Profile ────────────────────────────────────────────────────────────────

export async function updateProfileAction(input: ProfileInput): Promise<SettingsResult> {
  try {
    const actor = await requireUser();
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    // Self-update through the user-scoped client: RLS users_update allows it and
    // the protect_user_fields trigger blocks role/active changes as a backstop.
    const supabase = await createClient();
    const { error } = await supabase
      .from("users")
      .update(
        dbUpdate("users", {
          full_name: v.fullName,
          phone: v.phone || null,
          department: v.department || null,
          birthday: v.birthday || null,
          gender: v.gender || null,
          avatar_url: v.avatarUrl ?? null,
        }),
      )
      .eq("id", actor.id);
    if (error) return { ok: false, error: error.message };

    await logActivity({
      actor,
      action: "user.profile_update",
      module: "settings",
      targetType: "user",
      targetId: actor.id,
      summary: `${actor.email} updated their profile`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function changePasswordAction(
  input: ChangePasswordInput,
): Promise<SettingsResult> {
  try {
    const actor = await requireUser();
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const settings = await getOrgSettings();
    const policyError = passwordPolicyError(v.password, settings.passwordPolicy);
    if (policyError) return { ok: false, error: policyError };

    // Re-authenticate with the CURRENT password before allowing the change.
    // Done on the admin client so the session cookie is never touched.
    const admin = createAdminClient();
    const { error: reauthError } = await admin.auth.signInWithPassword({
      email: actor.email,
      password: v.currentPassword,
    });
    if (reauthError) return { ok: false, error: "Current password is incorrect." };

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: v.password });
    if (error) return { ok: false, error: error.message };

    await logActivity({
      actor,
      action: "auth.password_change",
      module: "auth",
      targetType: "user",
      targetId: actor.id,
      summary: `${actor.email} changed their password`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Preferences ───────────────────────────────────────────────────────────────

export async function updatePreferencesAction(
  input: PreferencesInput,
): Promise<SettingsResult> {
  try {
    const actor = await requireUser();
    const parsed = preferencesSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const supabase = await createClient();
    const { error } = await supabase.from("user_preferences").upsert(
      dbInsert("user_preferences", {
        user_id: actor.id,
        theme: v.theme,
        language: v.language,
        default_landing_page: v.defaultLandingPage,
        sidebar_default_state: v.sidebarDefaultState,
        // Apply the new default immediately so the shell reflects it next load.
        sidebar_collapsed: v.sidebarDefaultState === "collapsed",
        date_format: v.dateFormat,
        time_format: v.timeFormat,
        timezone: v.timezone,
      }),
      { onConflict: "user_id" },
    );
    if (error) return { ok: false, error: error.message };

    await logActivity({
      actor,
      action: "user.preferences_update",
      module: "settings",
      targetType: "user",
      targetId: actor.id,
      summary: `${actor.email} updated their preferences`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateNotificationPrefsAction(
  input: NotificationPrefsInput,
): Promise<SettingsResult> {
  try {
    const actor = await requireUser();
    const parsed = notificationPrefsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const supabase = await createClient();
    const { error } = await supabase.from("user_preferences").upsert(
      dbInsert("user_preferences", {
        user_id: actor.id,
        notification_prefs: {
          events: v.events,
          channel: v.channel,
          quiet_hours: v.quietHours,
        },
      }),
      { onConflict: "user_id" },
    );
    if (error) return { ok: false, error: error.message };

    await logActivity({
      actor,
      action: "user.notification_prefs_update",
      module: "settings",
      targetType: "user",
      targetId: actor.id,
      summary: `${actor.email} updated their notification preferences`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Company / Organization ────────────────────────────────────────────────────

export async function updateCompanyAction(input: CompanyInput): Promise<SettingsResult> {
  try {
    const actor = await requirePermission("settings.edit_company");
    const parsed = companySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const before = await orgBefore(
      "company_name, logo_url, address_line, contact_email, contact_phone, currency, default_tax_rate",
    );
    const { error } = await updateOrg({
      company_name: v.companyName,
      logo_url: v.logoUrl,
      address_line: v.addressLine || null,
      contact_email: v.contactEmail || null,
      contact_phone: v.contactPhone || null,
      currency: v.currency,
      default_tax_rate: v.defaultTaxRate,
    });
    if (error) return { ok: false, error };
    invalidateAll();

    await logActivity({
      actor,
      action: "settings.update_company",
      module: "settings",
      targetType: "organization_settings",
      targetId: "org",
      summary: "Updated company settings",
      before: before ?? undefined,
      after: { company_name: v.companyName, currency: v.currency, default_tax_rate: v.defaultTaxRate },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Order configuration ───────────────────────────────────────────────────────

export async function updateOrderConfigAction(
  input: OrderConfigInput,
): Promise<SettingsResult> {
  try {
    const actor = await requirePermission("settings.edit_order_config");
    const parsed = orderConfigSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const before = await orgBefore(
      "order_statuses, order_priorities, order_code_prefix, order_code_format, custom_order_fields",
    );
    const { error } = await updateOrg({
      order_statuses: v.statuses,
      order_priorities: v.priorities,
      order_code_prefix: v.codePrefix,
      order_code_format: v.codeFormat,
      custom_order_fields: v.customFields,
    });
    if (error) return { ok: false, error };
    invalidateAll();

    await logActivity({
      actor,
      action: "settings.update_order_config",
      module: "settings",
      targetType: "organization_settings",
      targetId: "org",
      summary: `Updated order configuration (${v.statuses.length} statuses, ${v.priorities.length} priorities)`,
      before: before ?? undefined,
      after: { statuses: v.statuses.map((s) => s.key), priorities: v.priorities.map((p) => p.key) },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateMaterialsAction(input: MaterialsInput): Promise<SettingsResult> {
  try {
    const actor = await requirePermission("settings.edit_order_config");
    const parsed = materialsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const materials = parsed.data.materials.map((m) => ({
      key: m.key,
      label: m.label,
      color: m.color,
      cost_per_gram_cents: m.costPerGramCents,
      is_active: m.isActive,
    }));

    const before = await orgBefore("material_types");
    const { error } = await updateOrg({ material_types: materials });
    if (error) return { ok: false, error };
    invalidateAll();

    await logActivity({
      actor,
      action: "settings.update_materials",
      module: "settings",
      targetType: "organization_settings",
      targetId: "org",
      summary: `Updated the material list (${materials.length} materials)`,
      before: before ?? undefined,
      after: { materials: materials.map((m) => m.key) },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Printer catalog ───────────────────────────────────────────────────────────

export async function savePrinterAction(
  input: PrinterInput,
): Promise<SettingsResult<{ id: string }>> {
  try {
    const actor = await requirePermission("settings.edit_order_config");
    const parsed = printerSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const admin = createAdminClient();
    let id = v.id ?? null;
    if (id) {
      const { error } = await admin
        .from("printers")
        .update(dbUpdate("printers", { brand: v.brand, model: v.model, badge_color: v.badgeColor }))
        .eq("id", id);
      if (error) {
        return { ok: false, error: error.code === "23505" ? "That brand + model already exists." : error.message };
      }
    } else {
      const { data, error } = await admin
        .from("printers")
        .insert(dbInsert("printers", { brand: v.brand, model: v.model, badge_color: v.badgeColor }))
        .select("id")
        .single();
      if (error) {
        return { ok: false, error: error.code === "23505" ? "That brand + model already exists." : error.message };
      }
      id = (data as { id: string }).id;
    }
    invalidateOrderConfigCache();

    await logActivity({
      actor,
      action: v.id ? "settings.printer_update" : "settings.printer_create",
      module: "settings",
      targetType: "printer",
      targetId: id,
      summary: `${v.id ? "Updated" : "Added"} printer ${v.brand} ${v.model}`,
    });
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function setPrinterActiveAction(
  printerId: string,
  active: boolean,
): Promise<SettingsResult> {
  try {
    const actor = await requirePermission("settings.edit_order_config");
    if (!printerId) return { ok: false, error: "Missing printer" };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("printers")
      .update(dbUpdate("printers", { is_active: active }))
      .eq("id", printerId)
      .select("brand, model")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    const p = asRow<{ brand: string; model: string }>(data);
    if (!p) return { ok: false, error: "Printer not found" };
    invalidateOrderConfigCache();

    await logActivity({
      actor,
      action: active ? "settings.printer_activate" : "settings.printer_deactivate",
      module: "settings",
      targetType: "printer",
      targetId: printerId,
      summary: `${active ? "Activated" : "Deactivated"} printer ${p.brand} ${p.model}`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Soft delete: existing orders keep their printer reference via FK SET NULL-safe display. */
export async function deletePrinterAction(printerId: string): Promise<SettingsResult> {
  try {
    const actor = await requirePermission("settings.edit_order_config");
    if (!printerId) return { ok: false, error: "Missing printer" };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("printers")
      .update(dbUpdate("printers", { is_active: false, deleted_at: new Date().toISOString() }))
      .eq("id", printerId)
      .select("brand, model")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    const p = asRow<{ brand: string; model: string }>(data);
    if (!p) return { ok: false, error: "Printer not found" };
    invalidateOrderConfigCache();

    await logActivity({
      actor,
      action: "settings.printer_delete",
      module: "settings",
      targetType: "printer",
      targetId: printerId,
      summary: `Removed printer ${p.brand} ${p.model} from the catalog`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Schedule configuration ────────────────────────────────────────────────────

/** Gated by settings.edit_order_config: the schedule board is print-tracking
 * configuration and shares the orders config audience (admin-only either way). */
export async function updateScheduleConfigAction(
  input: ScheduleConfigInput,
): Promise<SettingsResult> {
  try {
    const actor = await requirePermission("settings.edit_order_config");
    const parsed = scheduleConfigSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const before = await orgBefore("schedule_config");
    const { error } = await updateOrg({
      schedule_config: {
        completed_retention_hours: v.completedRetentionHours,
        overdue_alert_pct: v.overdueAlertPct,
      },
    });
    if (error) return { ok: false, error };
    invalidateOrgSettingsCache();

    await logActivity({
      actor,
      action: "settings.update_schedule",
      module: "settings",
      targetType: "organization_settings",
      targetId: "org",
      summary: `Updated schedule configuration (retention ${v.completedRetentionHours}h, overdue alert at +${v.overdueAlertPct}%)`,
      before: before ?? undefined,
      after: { completed_retention_hours: v.completedRetentionHours, overdue_alert_pct: v.overdueAlertPct },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Trending configuration ────────────────────────────────────────────────────

export async function updateTrendingConfigAction(
  input: TrendingConfigInput,
): Promise<SettingsResult> {
  try {
    const actor = await requirePermission("settings.edit_trending");
    const parsed = trendingConfigSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const before = await orgBefore("trending_config");
    const { error } = await updateOrg({
      trending_config: {
        platforms: v.platforms,
        statuses: v.statuses,
        target_margin_pct: v.targetMarginPct,
      },
    });
    if (error) return { ok: false, error };
    invalidateOrgSettingsCache();

    await logActivity({
      actor,
      action: "settings.update_trending",
      module: "settings",
      targetType: "organization_settings",
      targetId: "org",
      summary: `Updated trending configuration (${v.platforms.length} platforms, target margin ${v.targetMarginPct}%)`,
      before: before ?? undefined,
      after: { platforms: v.platforms, statuses: v.statuses.map((s) => s.key), target_margin_pct: v.targetMarginPct },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Feedback configuration ────────────────────────────────────────────────────

export async function updateFeedbackConfigAction(
  input: FeedbackConfigInput,
): Promise<SettingsResult> {
  try {
    const actor = await requirePermission("settings.edit_feedback");
    const parsed = feedbackConfigSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const before = await orgBefore("feedback_config");
    const { error } = await updateOrg({
      feedback_config: {
        categories: v.categories,
        severities: v.severities,
        channels: v.channels,
        aging_sla_days: v.agingSlaDays,
        negative_alert_enabled: v.negativeAlertEnabled,
      },
    });
    if (error) return { ok: false, error };
    invalidateOrgSettingsCache();

    await logActivity({
      actor,
      action: "settings.update_feedback",
      module: "settings",
      targetType: "organization_settings",
      targetId: "org",
      summary: `Updated feedback configuration (${v.categories.length} categories, aging SLA ${v.agingSlaDays}d)`,
      before: before ?? undefined,
      after: {
        categories: v.categories,
        channels: v.channels,
        aging_sla_days: v.agingSlaDays,
        negative_alert_enabled: v.negativeAlertEnabled,
      },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Messaging configuration ───────────────────────────────────────────────────

export async function updateMessagingConfigAction(
  input: MessagingConfigInput,
): Promise<SettingsResult> {
  try {
    const actor = await requirePermission("settings.edit_messaging");
    const parsed = messagingConfigSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const before = await orgBefore("messaging_config");
    const { error } = await updateOrg({
      messaging_config: {
        reaction_emojis: v.reactionEmojis,
        invite_link_defaults: { expiry_hours: v.inviteExpiryHours, max_uses: v.inviteMaxUses },
        all_mention_policy: v.allMentionPolicy,
      },
    });
    if (error) return { ok: false, error };
    invalidateOrgSettingsCache();

    await logActivity({
      actor,
      action: "settings.update_messaging",
      module: "settings",
      targetType: "organization_settings",
      targetId: "org",
      summary: "Updated messaging configuration",
      before: before ?? undefined,
      after: { reaction_emojis: v.reactionEmojis, all_mention_policy: v.allMentionPolicy },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Inventory configuration ───────────────────────────────────────────────────

export async function updateInventoryConfigAction(
  input: InventoryConfigInput,
): Promise<SettingsResult> {
  try {
    const actor = await requirePermission("settings.edit_inventory");
    const parsed = inventoryConfigSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const before = await orgBefore(
      "sku_prefix, sku_format, barcode_format, default_warehouse_id, low_stock_alerts_enabled",
    );
    const { error } = await updateOrg({
      sku_prefix: v.skuPrefix,
      sku_format: v.skuFormat,
      barcode_format: v.barcodeFormat,
      default_warehouse_id: v.defaultWarehouseId,
      low_stock_alerts_enabled: v.lowStockAlertsEnabled,
    });
    if (error) return { ok: false, error };
    invalidateOrgSettingsCache();

    await logActivity({
      actor,
      action: "settings.update_inventory",
      module: "settings",
      targetType: "organization_settings",
      targetId: "org",
      summary: "Updated inventory configuration",
      before: before ?? undefined,
      after: { sku_prefix: v.skuPrefix, low_stock_alerts_enabled: v.lowStockAlertsEnabled },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Loyalty configuration ─────────────────────────────────────────────────────

export async function updateLoyaltyConfigAction(
  input: LoyaltyConfigInput,
): Promise<SettingsResult> {
  try {
    const actor = await requirePermission("settings.edit_loyalty");
    const parsed = loyaltyConfigSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const before = await orgBefore("voucher_defaults, customer_score_rules");
    const { error } = await updateOrg({
      voucher_defaults: {
        type: v.voucherType,
        value_cents: v.voucherValue,
        valid_days: v.voucherValidDays,
      },
      customer_score_rules: {
        points_per_order: v.pointsPerOrder,
        points_per_100_currency: v.pointsPer100Currency,
      },
    });
    if (error) return { ok: false, error };
    invalidateOrgSettingsCache();

    await logActivity({
      actor,
      action: "settings.update_loyalty",
      module: "settings",
      targetType: "organization_settings",
      targetId: "org",
      summary: "Updated loyalty configuration",
      before: before ?? undefined,
      after: { voucher_valid_days: v.voucherValidDays, points_per_order: v.pointsPerOrder },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Marketing configuration ───────────────────────────────────────────────────

export async function updateMarketingConfigAction(
  input: MarketingConfigInput,
): Promise<SettingsResult> {
  try {
    const actor = await requirePermission("settings.edit_marketing");
    const parsed = marketingConfigSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const before = await orgBefore("marketing_config");
    const { error } = await updateOrg({
      marketing_config: {
        sender_name: v.senderName,
        sender_email: v.senderEmail,
        tracking_enabled: v.trackingEnabled,
        quiet_hours: v.quietEnabled ? { start: v.quietStart, end: v.quietEnd } : null,
      },
    });
    if (error) return { ok: false, error };
    invalidateOrgSettingsCache();

    await logActivity({
      actor,
      action: "settings.update_marketing",
      module: "settings",
      targetType: "organization_settings",
      targetId: "org",
      summary: "Updated marketing configuration",
      before: before ?? undefined,
      after: { sender_email: v.senderEmail, tracking_enabled: v.trackingEnabled },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Data management ───────────────────────────────────────────────────────────

export async function updateDataConfigAction(input: DataConfigInput): Promise<SettingsResult> {
  try {
    const actor = await requirePermission("settings.edit_data");
    const parsed = dataConfigSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const before = await orgBefore("log_retention_days, log_purge_archive");
    const { error } = await updateOrg({
      log_retention_days: v.logRetentionDays,
      log_purge_archive: v.logPurgeArchive,
    });
    if (error) return { ok: false, error };
    invalidateOrgSettingsCache();

    await logActivity({
      actor,
      action: "settings.update_data",
      module: "settings",
      targetType: "organization_settings",
      targetId: "org",
      summary: `Set activity-log retention to ${v.logRetentionDays} days (archive ${v.logPurgeArchive ? "on" : "off"})`,
      before: before ?? undefined,
      after: { log_retention_days: v.logRetentionDays, log_purge_archive: v.logPurgeArchive },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Security ──────────────────────────────────────────────────────────────────

export async function updateSecurityConfigAction(
  input: import("./schemas").SecurityConfigInput,
): Promise<SettingsResult> {
  try {
    const actor = await requirePermission("settings.edit_security");
    const parsed = securityConfigSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const before = await orgBefore(
      "password_policy, session_timeout_min, two_factor_required, login_attempt_limit, lockout_minutes",
    );
    const { error } = await updateOrg({
      password_policy: {
        minLength: v.minLength,
        requireUpper: v.requireUpper,
        requireNumber: v.requireNumber,
        requireSymbol: v.requireSymbol,
      },
      session_timeout_min: v.sessionTimeoutMin,
      two_factor_required: v.twoFactorRequired,
      login_attempt_limit: v.loginAttemptLimit,
      lockout_minutes: v.lockoutMinutes,
    });
    if (error) return { ok: false, error };
    invalidateOrgSettingsCache();

    await logActivity({
      actor,
      action: "settings.update_security",
      module: "settings",
      targetType: "organization_settings",
      targetId: "org",
      summary: `Updated security settings (timeout ${v.sessionTimeoutMin}m, lockout after ${v.loginAttemptLimit} attempts)`,
      before: before ?? undefined,
      after: {
        session_timeout_min: v.sessionTimeoutMin,
        login_attempt_limit: v.loginAttemptLimit,
        lockout_minutes: v.lockoutMinutes,
      },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Roles & permissions ───────────────────────────────────────────────────────

/** Current DB permission keys for a role (drives the matrix UI). */
export async function getRolePermissionKeysAction(
  roleKey: "admin" | "staff",
): Promise<SettingsResult<{ keys: string[] }>> {
  try {
    await requirePermission("settings.edit_roles");
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("role_permissions")
      .select("roles!inner(key), permissions(key)")
      .eq("roles.key", roleKey);
    if (error) return { ok: false, error: error.message };
    const keys = asRows<{ permissions: { key: string } | null }>(data)
      .map((r) => r.permissions?.key)
      .filter((k): k is string => !!k);
    return { ok: true, data: { keys } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Replace the staff role's permission set. Admin is never editable (always
 * holds everything), so an admin can't lock themselves out of Settings.
 */
export async function updateRolePermissionsAction(
  input: RolePermissionsInput,
): Promise<SettingsResult> {
  try {
    const actor = await requirePermission("settings.edit_roles");
    const parsed = rolePermissionsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const valid = new Set<string>(ALL_PERMISSION_KEYS);
    const keys = [...new Set(v.permissionKeys)].filter((k): k is PermissionKey => valid.has(k));

    const admin = createAdminClient();
    const { data: roleRaw, error: roleError } = await admin
      .from("roles")
      .select("id")
      .eq("key", v.roleKey)
      .maybeSingle();
    if (roleError || !roleRaw) return { ok: false, error: roleError?.message ?? "Role not found" };
    const roleId = (roleRaw as { id: string }).id;

    const { data: permsRaw, error: permsError } = await admin
      .from("permissions")
      .select("id, key")
      .in("key", keys.length > 0 ? keys : ["__none__"]);
    if (permsError) return { ok: false, error: permsError.message };
    const permRows = asRows<{ id: string; key: string }>(permsRaw);

    const beforeRes = await getRolePermissionKeysAction(v.roleKey);
    const beforeKeys = beforeRes.ok ? beforeRes.data.keys.sort() : [];

    const { error: delError } = await admin
      .from("role_permissions")
      .delete()
      .eq("role_id", roleId);
    if (delError) return { ok: false, error: delError.message };
    if (permRows.length > 0) {
      const { error: insError } = await admin.from("role_permissions").insert(
        permRows.map((p) => dbInsert("role_permissions", { role_id: roleId, permission_id: p.id })),
      );
      if (insError) return { ok: false, error: insError.message };
    }
    invalidateRolePermissionsCache();

    await logActivity({
      actor,
      action: "settings.update_role_permissions",
      module: "settings",
      targetType: "role",
      targetId: roleId,
      summary: `Updated the ${v.roleKey} role's permissions (${permRows.length} granted)`,
      before: { keys: beforeKeys },
      after: { keys: permRows.map((p) => p.key).sort() },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
