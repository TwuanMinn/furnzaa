"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, asRows, dbInsert, dbUpdate } from "@/lib/supabase/types";
import { logActivity } from "@/lib/activity/log";
import { notifySecurityAlert } from "@/lib/notifications/service";
import { getOrgSettings, passwordPolicyError } from "@/lib/settings/config";

export interface AuthFormState {
  error?: string;
  message?: string;
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    return fwd ? (fwd.split(",")[0]?.trim() ?? null) : (h.get("x-real-ip") ?? null);
  } catch {
    return null;
  }
}

/**
 * Security gate around password sign-in (spec Modules 9/11):
 *  • login_attempts (service-role-only table) drives the configurable
 *    login-attempt limit + lockout window,
 *  • failed attempts and lockouts land in the activity log (warning),
 *  • crossing the failure threshold fires a security alert to Admins,
 *  • a successful login from an IP this user has never used alerts Admins.
 */
async function recentFailures(email: string, windowMinutes: number): Promise<number> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { count } = await admin
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("success", false)
    .ilike("email", email)
    .gte("attempted_at", since);
  return count ?? 0;
}

async function recordAttempt(email: string, success: boolean, ip: string | null): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("login_attempts")
    .insert(dbInsert("login_attempts", { email, success, ip_address: ip }));
}

/** Email/password sign-in (useActionState). Records last_login_at on success. */
export async function signInAction(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard") || "/dashboard";

  if (!email || !password) return { error: "Email and password are required." };

  const ip = await clientIp();
  const settings = await getOrgSettings();

  // ── Lockout gate (configurable limit + window, Settings → Security) ───────
  const failures = await recentFailures(email, settings.lockoutMinutes);
  if (failures >= settings.loginAttemptLimit) {
    void logActivity({
      actor: null,
      actorEmailOverride: email,
      action: "auth.lockout",
      module: "auth",
      summary: `Sign-in blocked for ${email} — ${failures} failed attempts within ${settings.lockoutMinutes} min`,
      severity: "warning",
    });
    return {
      error: `Too many failed attempts. Try again in ${settings.lockoutMinutes} minutes.`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await recordAttempt(email, false, ip);
    void logActivity({
      actor: null,
      actorEmailOverride: email,
      action: "auth.login_failed",
      module: "auth",
      summary: `Failed sign-in for ${email}`,
      severity: "warning",
      after: { reason: error.message },
    });
    // Crossing the threshold right now → one alert to Admins.
    if (failures + 1 === settings.loginAttemptLimit) {
      void notifySecurityAlert({
        title: "Repeated failed sign-ins",
        body: `${email} reached ${settings.loginAttemptLimit} failed attempts within ${settings.lockoutMinutes} minutes and is now locked out.`,
      });
    }
    return { error: error.message };
  }
  await recordAttempt(email, true, ip);

  // Deactivated users may still authenticate against Supabase Auth, but the app
  // must reject them. Check the profile and sign them back out if inactive.
  const userId = data.user?.id;
  if (userId) {
    const { data: profileRaw } = await supabase
      .from("users")
      .select("is_active")
      .eq("id", userId)
      .maybeSingle();
    const profile = asRow<{ is_active: boolean }>(profileRaw);
    if (profile && profile.is_active === false) {
      await supabase.auth.signOut();
      return { error: "This account has been deactivated. Contact an administrator." };
    }
    await supabase
      .from("users")
      .update(dbUpdate("users", { last_login_at: new Date().toISOString() }))
      .eq("id", userId);

    // New-IP detection BEFORE writing today's login row: alert Admins when a
    // user with login history signs in from an address they've never used.
    // Rides idx_activity_actor (actor + created_at) over the last 90 days.
    if (ip) {
      try {
        const admin = createAdminClient();
        const since = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
        const { data: priorRaw } = await admin
          .from("activity_logs")
          .select("ip_address")
          .eq("actor_id", userId)
          .eq("action", "auth.login")
          .gte("created_at", since)
          .limit(2000);
        const prior = asRows<{ ip_address: string | null }>(priorRaw);
        const knownIps = new Set(prior.map((r) => r.ip_address).filter(Boolean));
        if (knownIps.size > 0 && !knownIps.has(ip)) {
          void notifySecurityAlert({
            title: "Sign-in from a new IP",
            body: `${email} signed in from ${ip}, an address not seen for this account in the last 90 days.`,
          });
        }
      } catch (e) {
        console.error("[auth] new-IP check failed:", e);
      }
    }

    await logActivity({
      actor: { id: userId, email },
      action: "auth.login",
      module: "auth",
      targetType: "user",
      targetId: userId,
      summary: `${email} signed in`,
    });
  }

  redirect(next);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Send a password-reset email. Always reports success (no account enumeration). */
export async function requestPasswordResetAction(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl()}/auth/callback?next=/reset-password`,
  });
  return { message: "If that email exists, a reset link is on its way." };
}

/** Set a new password (user is authenticated via the reset-link callback). */
export async function updatePasswordAction(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const { passwordPolicy } = await getOrgSettings();
  const policyError = passwordPolicyError(password, passwordPolicy);
  if (policyError) return { error: policyError };
  if (password !== confirm) return { error: "Passwords do not match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await logActivity({
      actor: { id: user.id, email: user.email ?? "" },
      action: "auth.password_change",
      module: "auth",
      targetType: "user",
      targetId: user.id,
      summary: `${user.email ?? "User"} changed their password`,
    });
  }
  redirect("/dashboard");
}

/** Persist the sidebar collapsed state for the current user. */
export async function toggleSidebarAction(collapsed: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("user_preferences")
    .upsert(dbInsert("user_preferences", { user_id: user.id, sidebar_collapsed: collapsed }), {
      onConflict: "user_id",
    });
}
