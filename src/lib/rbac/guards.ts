import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import {
  isRoleKey,
  permissionsForRole,
  type PermissionKey,
  type RoleKey,
} from "./permissions";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  roleKey: RoleKey;
  roleName: string;
  isActive: boolean;
  avatarUrl: string | null;
  permissions: Set<PermissionKey>;
}

/** Thrown by `requirePermission` when the caller lacks a permission. */
export class ForbiddenError extends Error {
  constructor(public readonly permission?: string) {
    super(permission ? `Missing permission: ${permission}` : "Forbidden");
    this.name = "ForbiddenError";
  }
}

/** Thrown when there is no authenticated, active user. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

// Tiny (2-row) roles table — cache id→{key,name} for 60s to avoid a per-request
// join. Per-worker in-memory cache; safe because role definitions rarely change.
let rolesCache: { at: number; map: Map<string, { key: string; name: string }> } | null = null;

async function getRolesMap(supabase: ServerClient) {
  if (rolesCache && Date.now() - rolesCache.at < 60_000) return rolesCache.map;
  const { data } = await supabase.from("roles").select("id, key, name");
  const rows = (data ?? []) as Pick<Tables<"roles">, "id" | "key" | "name">[];
  const map = new Map<string, { key: string; name: string }>();
  for (const r of rows) map.set(r.id, { key: r.key, name: r.name });
  rolesCache = { at: Date.now(), map };
  return map;
}

// Effective permissions come from the DB matrix (roles ⨯ role_permissions ⨯
// permissions) so edits in Settings → Roles & Permissions take effect at
// runtime. Cached per worker for 60s; the editor calls
// invalidateRolePermissionsCache() after every save. Falls back to the static
// matrix in permissions.ts if the DB read fails.
let rolePermsCache: { at: number; map: Map<string, Set<PermissionKey>> } | null = null;

async function getRolePermissionsMap(supabase: ServerClient) {
  if (rolePermsCache && Date.now() - rolePermsCache.at < 60_000) return rolePermsCache.map;
  const { data } = await supabase
    .from("role_permissions")
    .select("role_id, permissions(key)")
    .limit(10_000);
  const rows = (data ?? []) as unknown as { role_id: string; permissions: { key: string } | null }[];
  const map = new Map<string, Set<PermissionKey>>();
  for (const r of rows) {
    if (!r.permissions?.key) continue;
    const set = map.get(r.role_id) ?? new Set<PermissionKey>();
    set.add(r.permissions.key as PermissionKey);
    map.set(r.role_id, set);
  }
  if (map.size > 0) rolePermsCache = { at: Date.now(), map };
  return map;
}

/** Drop the cached matrix after Settings → Roles & Permissions saves. */
export function invalidateRolePermissionsCache(): void {
  rolePermsCache = null;
}

/**
 * Load the current user's profile + effective permissions. Returns null when
 * there is no session or the account is deactivated (deactivated users can't use
 * the app but remain in history).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profileRaw } = await supabase
    .from("users")
    .select("id, email, full_name, is_active, avatar_url, role_id")
    .eq("id", user.id)
    .maybeSingle();

  const profile = profileRaw as Pick<
    Tables<"users">,
    "id" | "email" | "full_name" | "is_active" | "avatar_url" | "role_id"
  > | null;

  if (!profile || profile.is_active === false) return null;

  const [roles, rolePerms] = await Promise.all([
    getRolesMap(supabase),
    getRolePermissionsMap(supabase),
  ]);
  const role = roles.get(profile.role_id);
  const rawRoleKey = role?.key ?? "staff";
  const roleKey: RoleKey = isRoleKey(rawRoleKey) ? rawRoleKey : "staff";

  // DB matrix first (Settings-editable); static matrix as the fallback.
  const dbPerms = rolePerms.get(profile.role_id);
  const permissions =
    dbPerms && dbPerms.size > 0 ? new Set(dbPerms) : new Set(permissionsForRole(roleKey));

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    roleKey,
    roleName: role?.name ?? roleKey,
    isActive: profile.is_active,
    avatarUrl: profile.avatar_url ?? null,
    permissions,
  };
}

/** True if the user holds the permission. */
export function can(user: SessionUser | null, permission: PermissionKey): boolean {
  return !!user && user.permissions.has(permission);
}

/** Returns the session user or throws UnauthorizedError. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/**
 * Returns the session user or throws (Unauthorized / Forbidden). Use in every
 * mutating endpoint as the server-side enforcement layer (RLS is the second).
 */
export async function requirePermission(permission: PermissionKey): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.permissions.has(permission)) throw new ForbiddenError(permission);
  return user;
}

/** Whether the user can see all rows (admin / `*_all`) vs only their own. */
export function hasAnyScope(user: SessionUser, all: PermissionKey, own: PermissionKey) {
  return { canSeeAll: user.permissions.has(all), canSeeOwn: user.permissions.has(own) };
}
