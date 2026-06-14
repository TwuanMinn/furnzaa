import "server-only";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbInsert } from "@/lib/supabase/types";
import type { SessionUser } from "@/lib/rbac/guards";

export type ActivityModule =
  | "auth"
  | "users"
  | "tasks"
  | "customers"
  | "orders"
  | "schedule"
  | "products"
  | "trends"
  | "inventory"
  | "feedback"
  | "profit"
  | "crm"
  | "marketing"
  | "notifications"
  | "messages"
  | "logs"
  | "analytics"
  | "settings";

export type ActivitySeverity = "info" | "warning" | "critical";

export interface ActivityEntry {
  actor: Pick<SessionUser, "id" | "email"> | null;
  /** Dot-scoped action key, e.g. "order.status_change", "users.import". */
  action: string;
  module: ActivityModule;
  targetType?: string;
  targetId?: string;
  /** Human-readable one-liner shown in the Activity Log feed. */
  summary: string;
  before?: unknown;
  after?: unknown;
  /** info (default) / warning / critical — auto-raised for risky actions. */
  severity?: ActivitySeverity;
  /** Groups the per-row entries of one bulk action / CSV import. */
  batchId?: string;
  /** Snapshot email for system rows where `actor` is null (e.g. failed logins). */
  actorEmailOverride?: string;
}

/** Spec: bulk deletes, role changes, bans and purges render as critical. */
const CRITICAL_ACTIONS = /(\.ban|\.purge|\.hard_delete|bulk_delete|\.update_role|role_change)/;
const WARNING_ACTIONS = /(login_failed|lockout|\.deactivate|\.delete|\.fail)/;

function classify(action: string): ActivitySeverity {
  if (CRITICAL_ACTIONS.test(action)) return "critical";
  if (WARNING_ACTIONS.test(action)) return "warning";
  return "info";
}

/**
 * Redaction at write time (spec): before/after JSON must never carry secrets.
 * Any key smelling like a credential is masked before insert.
 */
const SECRET_KEY_RE = /(password|secret|token|api[_-]?key|private[_-]?key|hash|credential|authorization)/i;

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? "•••" : redactSecrets(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Best-effort client IP + UA from proxy headers (null outside request scope). */
async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ip = forwarded ? (forwarded.split(",")[0]?.trim() ?? null) : (h.get("x-real-ip") ?? null);
    return { ip, userAgent: h.get("user-agent") };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/**
 * THE single insert path into activity_logs (spec Module 9): every
 * data-changing action and security event calls this. The DB layer adds the
 * tamper-evident hash chain; UPDATE/DELETE are revoked at the database, so
 * what this writes is what an investigator reads.
 *
 * Attributed events insert with the caller's RLS-scoped client (policy:
 * actor_id = auth.uid()). System events (actor null — cron, failed logins)
 * go through the service role, which RLS would otherwise reject.
 *
 * Failures are swallowed after a console report: an audit hiccup must never
 * break the action itself.
 */
export async function logActivity(entry: ActivityEntry): Promise<void> {
  try {
    // Same runtime API either way; the cast unifies the two generated client
    // types so .from() stays callable under TS6.
    const supabase = entry.actor
      ? await createClient()
      : (createAdminClient() as unknown as Awaited<ReturnType<typeof createClient>>);
    const { ip, userAgent } = await requestMeta();
    const { error } = await supabase.from("activity_logs").insert(
      dbInsert("activity_logs", {
        actor_id: entry.actor?.id ?? null,
        actor_email: entry.actor?.email ?? entry.actorEmailOverride ?? null,
        action: entry.action,
        module: entry.module,
        target_type: entry.targetType ?? null,
        target_id: entry.targetId ?? null,
        summary: entry.summary,
        before_data: redactSecrets(entry.before ?? null) as never,
        after_data: redactSecrets(entry.after ?? null) as never,
        severity: entry.severity ?? classify(entry.action),
        batch_id: entry.batchId ?? null,
        ip_address: ip,
        user_agent: userAgent,
      }),
    );
    if (error) console.error("[activity] failed to write log:", error.message);
  } catch (e) {
    console.error("[activity] failed to write log:", e);
  }
}

/** Convenience for bulk actions: one batch id shared by every per-user entry. */
export function newBatchId(): string {
  return crypto.randomUUID();
}
