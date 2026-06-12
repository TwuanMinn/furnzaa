"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PermissionKey, RoleKey } from "./permissions";

/** Serializable session shape passed from the server shell to the client tree. */
export interface SessionUserLite {
  id: string;
  email: string;
  fullName: string;
  roleKey: RoleKey;
  roleName: string;
  avatarUrl: string | null;
  permissions: PermissionKey[];
}

const SessionContext = createContext<SessionUserLite | null>(null);

export function SessionProvider({
  user,
  children,
}: {
  user: SessionUserLite;
  children: ReactNode;
}) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionUserLite {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}

/** Permission checks for conditional rendering on the client. */
export function usePermissions() {
  const user = useSession();
  const set = useMemo(() => new Set(user.permissions), [user.permissions]);
  return useMemo(
    () => ({
      has: (p: PermissionKey) => set.has(p),
      hasAny: (...ps: PermissionKey[]) => ps.some((p) => set.has(p)),
      hasAll: (...ps: PermissionKey[]) => ps.every((p) => set.has(p)),
    }),
    [set],
  );
}

/**
 * Conditionally render children based on permissions. UI gating ONLY — every
 * endpoint is also enforced server-side (requirePermission) and by RLS.
 *
 * <Can permission="users.create">…</Can>
 * <Can any={["orders.view", "orders.view_all"]}>…</Can>
 */
export function Can({
  permission,
  any,
  all,
  fallback = null,
  children,
}: {
  permission?: PermissionKey;
  any?: PermissionKey[];
  all?: PermissionKey[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const perms = usePermissions();
  let ok = true;
  if (permission) ok = ok && perms.has(permission);
  if (any) ok = ok && perms.hasAny(...any);
  if (all) ok = ok && perms.hasAll(...all);
  return <>{ok ? children : fallback}</>;
}
