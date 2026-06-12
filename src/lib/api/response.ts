import { NextResponse } from "next/server";

/** Standard JSON envelope returned by every API route handler. */
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data } satisfies ApiResponse<T>, init);
}

export function jsonError(error: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, error, code } satisfies ApiResponse<never>, { status });
}
