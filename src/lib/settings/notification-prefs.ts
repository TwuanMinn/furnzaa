/**
 * Per-user notification preferences (user_preferences.notification_prefs).
 * Shared between the Settings UI (client) and the notification fan-out
 * (server) — no server-only imports here.
 *
 * Unknown/missing keys default to ENABLED, so new event types are delivered
 * until a user opts out. "manual" (admin broadcasts, incl. security alerts)
 * is always delivered and intentionally has no toggle.
 */

export const NOTIFIABLE_EVENTS = [
  { key: "order_assigned", label: "Order assigned to me" },
  { key: "order_delivered", label: "Order delivered" },
  { key: "print_countdown", label: "Print countdown finished" },
  { key: "printer_freed", label: "Printer freed — my job is next" },
  { key: "print_overdue", label: "Print running past its estimate" },
  { key: "feedback_assigned", label: "Feedback assigned to me" },
  { key: "feedback_resolved", label: "My submitted feedback resolved" },
  { key: "feedback_aging", label: "Feedback aging past the SLA" },
  { key: "new_message", label: "New message in my groups" },
  { key: "mention", label: "I am @mentioned" },
  { key: "reminder", label: "Chat reminders" },
  { key: "low_stock", label: "Low-stock alerts" },
  { key: "tier_upgraded", label: "Customer tier upgrades" },
  { key: "voucher_issued", label: "Vouchers issued" },
  { key: "campaign_completed", label: "Campaign completed" },
] as const;

export type NotifiableEventKey = (typeof NOTIFIABLE_EVENTS)[number]["key"];

export interface NotificationPrefs {
  /** Missing key = enabled. */
  events: Partial<Record<NotifiableEventKey, boolean>>;
  /** In-app is always on; email is reserved for a future provider hookup. */
  channel: "in_app" | "in_app_email";
  /** Local times "HH:mm". While enabled+inside, clients soften delivery (no toast). */
  quiet_hours: { enabled: boolean; start: string; end: string };
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  events: {},
  channel: "in_app",
  quiet_hours: { enabled: false, start: "21:00", end: "08:00" },
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseNotificationPrefs(raw: unknown): NotificationPrefs {
  const o = (raw ?? {}) as Record<string, unknown>;
  const events: NotificationPrefs["events"] = {};
  const rawEvents = (o.events ?? {}) as Record<string, unknown>;
  for (const { key } of NOTIFIABLE_EVENTS) {
    if (typeof rawEvents[key] === "boolean") events[key] = rawEvents[key] as boolean;
  }
  const q = (o.quiet_hours ?? {}) as Record<string, unknown>;
  return {
    events,
    channel: o.channel === "in_app_email" ? "in_app_email" : "in_app",
    quiet_hours: {
      enabled: q.enabled === true,
      start: typeof q.start === "string" && TIME_RE.test(q.start) ? q.start : "21:00",
      end: typeof q.end === "string" && TIME_RE.test(q.end) ? q.end : "08:00",
    },
  };
}

/** Whether this user receives the given event category (default: yes). */
export function eventEnabled(prefs: NotificationPrefs, category: string): boolean {
  const known = NOTIFIABLE_EVENTS.some((e) => e.key === category);
  if (!known) return true; // "manual" and future categories are always delivered
  return prefs.events[category as NotifiableEventKey] !== false;
}
