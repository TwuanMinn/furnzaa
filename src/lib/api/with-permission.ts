import {
  ForbiddenError,
  UnauthorizedError,
  requirePermission,
  requireUser,
  type SessionUser,
} from "@/lib/rbac/guards";
import type { PermissionKey } from "@/lib/rbac/permissions";
import { jsonError } from "./response";

type RouteCtx = { params?: Promise<Record<string, string>> };
type Handler = (req: Request, ctx: RouteCtx & { user: SessionUser }) => Promise<Response> | Response;

/**
 * Wrap a route handler so it runs only for users holding `permission`.
 * This is the SERVER-SIDE enforcement layer; RLS is the second. Returns
 * 401 (no session) / 403 (insufficient permission) as JSON.
 */
export function withPermission(permission: PermissionKey, handler: Handler) {
  return async (req: Request, ctx: RouteCtx): Promise<Response> => {
    let user: SessionUser;
    try {
      user = await requirePermission(permission);
    } catch (e) {
      if (e instanceof UnauthorizedError) return jsonError("Unauthorized", 401, "unauthorized");
      if (e instanceof ForbiddenError) return jsonError(e.message, 403, "forbidden");
      throw e;
    }
    return handler(req, { ...ctx, user });
  };
}

/** Wrap a route handler so it runs only for any authenticated, active user. */
export function withAuth(handler: Handler) {
  return async (req: Request, ctx: RouteCtx): Promise<Response> => {
    let user: SessionUser;
    try {
      user = await requireUser();
    } catch (e) {
      if (e instanceof UnauthorizedError) return jsonError("Unauthorized", 401, "unauthorized");
      throw e;
    }
    return handler(req, { ...ctx, user });
  };
}
