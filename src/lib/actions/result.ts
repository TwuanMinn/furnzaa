import { ForbiddenError, UnauthorizedError } from "@/lib/rbac/guards";

/**
 * The standard server-action result shape, extracted from ~15 identical copies
 * across lib/*\/actions.ts. Bare `{ ok: true }` for actions with no payload,
 * `{ ok: true; data: T }` when a payload type is given, or `{ ok: false; error }`.
 *
 *   async function foo(): Promise<ActionResult> { ... }            // no payload
 *   async function bar(): Promise<ActionResult<{ id: string }>> { ... }
 */
export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

/**
 * Maps a thrown error to the standard failure result. Auth/permission guard
 * errors get friendly copy; everything else surfaces its message.
 */
export function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof UnauthorizedError) return { ok: false, error: "You are not signed in." };
  if (e instanceof ForbiddenError) return { ok: false, error: "You don't have permission to do that." };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}
