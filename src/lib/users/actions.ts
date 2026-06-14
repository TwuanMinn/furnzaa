"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { asRow, dbInsert, dbUpdate, type Tables } from "@/lib/supabase/types";
import { requirePermission } from "@/lib/rbac/guards";
import { logActivity } from "@/lib/activity/log";
import { fail, type ActionResult } from "@/lib/actions/result";
import {
  bulkUserActionSchema,
  inviteUserSchema,
  updateUserSchema,
  type BulkUserActionInput,
  type InviteUserInput,
  type UpdateUserInput,
} from "./schemas";

/**
 * User Management server actions. Every action: permission guard →
 * validation → privileged write (Supabase Auth admin API where needed) →
 * activity log. RLS + the protect_user_fields trigger back these up.
 */

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

type ProfileSnapshot = Pick<
  Tables<"users">,
  "id" | "full_name" | "email" | "phone" | "department" | "is_active" | "role_id" | "status"
>;

async function getProfile(id: string): Promise<ProfileSnapshot | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("id, full_name, email, phone, department, is_active, role_id, status")
    .eq("id", id)
    .maybeSingle();
  return asRow<ProfileSnapshot>(data);
}

/**
 * Guardrail: the LAST ACTIVE ADMIN can never be demoted, deactivated, banned
 * or deleted. Returns true when `userId` is that last admin.
 */
async function isLastActiveAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: role } = await admin.from("roles").select("id").eq("key", "admin").maybeSingle();
  const adminRoleId = asRow<{ id: string }>(role)?.id;
  if (!adminRoleId) return false;

  const { data: target } = await admin
    .from("users")
    .select("role_id, status")
    .eq("id", userId)
    .maybeSingle();
  const targetRow = asRow<{ role_id: string; status: string }>(target);
  if (!targetRow || targetRow.role_id !== adminRoleId || targetRow.status !== "active") {
    return false; // not an active admin → the guard doesn't apply
  }

  const { count } = await admin
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role_id", adminRoleId)
    .eq("status", "active");
  return (count ?? 0) <= 1;
}

async function getRoleId(roleKey: "admin" | "staff"): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("roles").select("id").eq("key", roleKey).maybeSingle();
  const row = asRow<{ id: string }>(data);
  if (!row) throw new Error(`Unknown role: ${roleKey}`);
  return row.id;
}

/** Invite a new user: Supabase Auth sends the email; they set a password via the link. */
export async function inviteUserAction(input: InviteUserInput): Promise<ActionResult> {
  try {
    const actor = await requirePermission("users.create");
    const parsed = inviteUserSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { fullName, email, role, phone, department, birthday, gender } = parsed.data;

    const admin = createAdminClient();
    // The handle_new_user trigger reads these to build the profile row.
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName,
        role,
        phone: phone || null,
        department: department || null,
      },
      redirectTo: `${appUrl()}/auth/callback?next=/reset-password`,
    });
    // birthday/gender aren't part of the auth trigger — set them right after.
    if (!error && data.user && (birthday || gender)) {
      await admin
        .from("users")
        .update(
          dbUpdate("users", {
            birthday: birthday || null,
            gender: gender || null,
          }),
        )
        .eq("id", data.user.id);
    }
    if (error) {
      if (error.code === "email_exists" || /already/i.test(error.message)) {
        return { ok: false, error: "A user with that email already exists." };
      }
      return { ok: false, error: error.message };
    }

    void logActivity({
      actor,
      action: "user.create",
      module: "users",
      targetType: "user",
      targetId: data.user?.id,
      summary: `Invited ${fullName} <${email}> as ${role}`,
      after: { fullName, email, role, phone: phone || null, department: department || null },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Edit profile fields / role. A user can never change their own role. */
export async function updateUserAction(input: UpdateUserInput): Promise<ActionResult> {
  try {
    const actor = await requirePermission("users.edit");
    const parsed = updateUserSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { id, fullName, role, phone, department, birthday, gender } = parsed.data;

    const before = await getProfile(id);
    if (!before) return { ok: false, error: "User not found." };

    const roleId = await getRoleId(role);
    if (id === actor.id && roleId !== before.role_id) {
      return { ok: false, error: "You cannot change your own role." };
    }
    if (roleId !== before.role_id && (await isLastActiveAdmin(id))) {
      return { ok: false, error: "This is the last active Admin — they can't be demoted." };
    }

    // Admin-API write (role/profile changes are privileged); server guard above
    // is the gate, and the protect_user_fields trigger guards direct paths.
    const admin = createAdminClient();
    const { error } = await admin
      .from("users")
      .update(
        dbUpdate("users", {
          full_name: fullName,
          role_id: roleId,
          phone: phone || null,
          department: department || null,
          birthday: birthday || null,
          gender: gender || null,
        }),
      )
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "user.update",
      module: "users",
      targetType: "user",
      targetId: id,
      summary: `Updated user ${fullName} <${before.email}>`,
      before: {
        full_name: before.full_name,
        role_id: before.role_id,
        phone: before.phone,
        department: before.department,
      },
      after: { full_name: fullName, role_id: roleId, phone: phone || null, department: department || null },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Soft-delete: blocks sign-in, keeps the row for history. */
export async function deactivateUserAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("users.deactivate");
    if (id === actor.id) return { ok: false, error: "You cannot deactivate your own account." };

    const before = await getProfile(id);
    if (!before) return { ok: false, error: "User not found." };
    if (!before.is_active) return { ok: false, error: "User is already deactivated." };
    if (await isLastActiveAdmin(id)) {
      return { ok: false, error: "This is the last active Admin — they can't be deactivated." };
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("users")
      .update(dbUpdate("users", { is_active: false, deleted_at: new Date().toISOString() }))
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "user.deactivate",
      module: "users",
      targetType: "user",
      targetId: id,
      summary: `Deactivated ${before.full_name} <${before.email}>`,
      before: { is_active: true },
      after: { is_active: false },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function reactivateUserAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("users.deactivate");
    const before = await getProfile(id);
    if (!before) return { ok: false, error: "User not found." };
    if (before.is_active) return { ok: false, error: "User is already active." };

    const admin = createAdminClient();
    const { error } = await admin
      .from("users")
      .update(dbUpdate("users", { is_active: true, deleted_at: null }))
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "user.reactivate",
      module: "users",
      targetType: "user",
      targetId: id,
      summary: `Reactivated ${before.full_name} <${before.email}>`,
      before: { is_active: false },
      after: { is_active: true },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Ban: blocks login like deactivation, plus records reason/by/at. */
export async function banUserAction(id: string, reason: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("users.deactivate");
    if (id === actor.id) return { ok: false, error: "You cannot ban your own account." };
    const trimmed = reason.trim();
    if (trimmed.length < 3) return { ok: false, error: "A ban needs a reason." };

    const before = await getProfile(id);
    if (!before) return { ok: false, error: "User not found." };
    if (before.status === "banned") return { ok: false, error: "User is already banned." };
    if (await isLastActiveAdmin(id)) {
      return { ok: false, error: "This is the last active Admin — they can't be banned." };
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("users")
      .update(
        dbUpdate("users", {
          status: "banned",
          ban_reason: trimmed.slice(0, 500),
          banned_by: actor.id,
          banned_at: new Date().toISOString(),
        }),
      )
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "user.ban",
      module: "users",
      targetType: "user",
      targetId: id,
      summary: `Banned ${before.full_name} <${before.email}> — ${trimmed.slice(0, 120)}`,
      before: { status: before.status },
      after: { status: "banned", ban_reason: trimmed },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Lift a ban (back to Active; the sync trigger clears reason/by/at). */
export async function unbanUserAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("users.deactivate");
    const before = await getProfile(id);
    if (!before) return { ok: false, error: "User not found." };
    if (before.status !== "banned") return { ok: false, error: "User is not banned." };

    const admin = createAdminClient();
    const { error } = await admin
      .from("users")
      .update(dbUpdate("users", { status: "active" }))
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "user.unban",
      module: "users",
      targetType: "user",
      targetId: id,
      summary: `Lifted the ban on ${before.full_name} <${before.email}>`,
      before: { status: "banned" },
      after: { status: "active" },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Bulk actions with guardrails (Module 1): the ACTOR is always excluded from
 * their own selection; the last active Admin is protected; every affected
 * user gets ONE activity-log entry. Returns per-outcome counts.
 */
export async function bulkUserActionsAction(
  input: BulkUserActionInput,
): Promise<{ ok: true; affected: number; skipped: string[] } | { ok: false; error: string }> {
  try {
    const parsed = bulkUserActionSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    const v = parsed.data;

    const permission =
      v.action === "assign_role" ? "users.edit" : v.action === "soft_delete" ? "users.delete" : "users.deactivate";
    const actor = await requirePermission(permission);

    // Guardrail 1: self-exclusion — silently drop the actor from the selection.
    const targetIds = [...new Set(v.userIds)].filter((id) => id !== actor.id);
    if (targetIds.length === 0) {
      return { ok: false, error: "Only your own account was selected — bulk actions never apply to yourself." };
    }

    const roleId = v.role ? await getRoleId(v.role) : null;
    const admin = createAdminClient();
    const skipped: string[] = [];
    let affected = 0;

    for (const id of targetIds) {
      const before = await getProfile(id);
      if (!before) {
        skipped.push("unknown user");
        continue;
      }

      // Guardrail 2: last-active-admin protection for every destructive variant.
      if (await isLastActiveAdmin(id)) {
        const demoting = v.action === "assign_role" && roleId !== before.role_id;
        if (demoting || v.action !== "assign_role") {
          skipped.push(`${before.full_name} (last active Admin)`);
          continue;
        }
      }

      let error: string | null = null;
      if (v.action === "deactivate") {
        if (!before.is_active) {
          skipped.push(`${before.full_name} (already inactive)`);
          continue;
        }
        const res = await admin
          .from("users")
          .update(dbUpdate("users", { status: "deactivated" }))
          .eq("id", id);
        error = res.error?.message ?? null;
      } else if (v.action === "ban") {
        if (before.status === "banned") {
          skipped.push(`${before.full_name} (already banned)`);
          continue;
        }
        const res = await admin
          .from("users")
          .update(
            dbUpdate("users", {
              status: "banned",
              ban_reason: (v.banReason ?? "").trim().slice(0, 500),
              banned_by: actor.id,
              banned_at: new Date().toISOString(),
            }),
          )
          .eq("id", id);
        error = res.error?.message ?? null;
      } else if (v.action === "assign_role") {
        if (roleId === before.role_id) {
          skipped.push(`${before.full_name} (already ${v.role})`);
          continue;
        }
        const res = await admin.from("users").update(dbUpdate("users", { role_id: roleId! })).eq("id", id);
        error = res.error?.message ?? null;
      } else {
        // soft_delete — bulk Delete is soft by default per the spec.
        if (!before.is_active) {
          skipped.push(`${before.full_name} (already inactive)`);
          continue;
        }
        const res = await admin
          .from("users")
          .update(dbUpdate("users", { status: "deactivated" }))
          .eq("id", id);
        error = res.error?.message ?? null;
      }

      if (error) {
        skipped.push(`${before.full_name} (${error})`);
        continue;
      }
      affected += 1;

      // One activity entry PER affected user (spec).
      void logActivity({
        actor,
        action: `user.bulk_${v.action}`,
        module: "users",
        targetType: "user",
        targetId: id,
        summary:
          v.action === "deactivate"
            ? `Bulk: deactivated ${before.full_name} <${before.email}>`
            : v.action === "ban"
              ? `Bulk: banned ${before.full_name} <${before.email}> — ${(v.banReason ?? "").slice(0, 100)}`
              : v.action === "assign_role"
                ? `Bulk: set ${before.full_name} <${before.email}> to ${v.role}`
                : `Bulk: soft-deleted ${before.full_name} <${before.email}>`,
        before: { status: before.status, role_id: before.role_id },
        after:
          v.action === "assign_role"
            ? { role_id: roleId }
            : { status: v.action === "ban" ? "banned" : "deactivated" },
      });
    }

    return { ok: true, affected, skipped };
  } catch (e) {
    return fail(e);
  }
}

/** Personal pin toggle — per-admin favorite, stored per viewer (RLS-own rows). */
export async function togglePinUserAction(pinnedUserId: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("users.view");
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("user_pins")
      .select("id")
      .eq("pinned_by", actor.id)
      .eq("pinned_user_id", pinnedUserId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("user_pins")
        .delete()
        .eq("id", (existing as { id: string }).id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("user_pins")
        .insert(dbInsert("user_pins", { pinned_by: actor.id, pinned_user_id: pinnedUserId }));
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Hard delete (Admin only): removes the auth user; profile cascades. */
export async function deleteUserAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("users.delete");
    if (id === actor.id) return { ok: false, error: "You cannot delete your own account." };

    const before = await getProfile(id);
    if (!before) return { ok: false, error: "User not found." };
    if (await isLastActiveAdmin(id)) {
      return { ok: false, error: "This is the last active Admin — they can't be deleted." };
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "user.delete",
      module: "users",
      targetType: "user",
      targetId: id,
      summary: `Permanently deleted ${before.full_name} <${before.email}>`,
      before: {
        full_name: before.full_name,
        email: before.email,
        phone: before.phone,
        department: before.department,
        is_active: before.is_active,
      },
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Send a password-reset email to a user (admin convenience). */
export async function sendPasswordResetAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requirePermission("users.edit");
    const profile = await getProfile(id);
    if (!profile) return { ok: false, error: "User not found." };

    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: `${appUrl()}/auth/callback?next=/reset-password`,
    });
    if (error) return { ok: false, error: error.message };

    void logActivity({
      actor,
      action: "user.password_reset_sent",
      module: "users",
      targetType: "user",
      targetId: id,
      summary: `Sent a password-reset email to ${profile.email}`,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
