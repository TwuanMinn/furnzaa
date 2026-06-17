import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { dbInsert } from "@/lib/supabase/types";
import { chunk } from "@/lib/import/server";
import { parseNotificationPrefs, eventEnabled } from "@/lib/settings/notification-prefs";

/**
 * Notification fan-out (Module 3). Inserts ONE notifications row plus a
 * notification_reads row per recipient (batched 1,000 at a time — an
 * all-users blast at scale stays bounded per statement). Uses the admin
 * client: callers are responsible for the permission guard (manual sends are
 * Admin-gated; system sends originate from server actions).
 */

export type NotificationAudience =
  | { type: "all" }
  | { type: "role"; role: "admin" | "staff" }
  | { type: "users"; userIds: string[] };

export type NotificationCategory =
  | "order_assigned"
  | "order_delivered"
  | "print_countdown"
  | "printer_freed"
  | "print_overdue"
  | "feedback_assigned"
  | "feedback_resolved"
  | "feedback_negative"
  | "feedback_aging"
  | "roi_break_even"
  | "roi_underperforming"
  | "new_message"
  | "mention"
  | "reminder"
  | "low_stock"
  | "tier_upgraded"
  | "voucher_issued"
  | "campaign_completed"
  | "security_alert"
  | "manual";

export interface SendNotificationInput {
  type: "manual" | "system";
  category: NotificationCategory;
  title: string;
  body?: string;
  audience: NotificationAudience;
  senderId?: string | null;
  linkUrl?: string | null;
}

async function resolveRecipients(audience: NotificationAudience): Promise<string[]> {
  const admin = createAdminClient();
  if (audience.type === "users") {
    return [...new Set(audience.userIds)];
  }
  if (audience.type === "role") {
    const { data: role } = await admin.from("roles").select("id").eq("key", audience.role).maybeSingle();
    const roleId = (role as { id: string } | null)?.id;
    if (!roleId) return [];
    const { data } = await admin
      .from("users")
      .select("id")
      .eq("is_active", true)
      .eq("role_id", roleId)
      .limit(100_000);
    return ((data ?? []) as { id: string }[]).map((u) => u.id);
  }
  const { data } = await admin.from("users").select("id").eq("is_active", true).limit(100_000);
  return ((data ?? []) as { id: string }[]).map((u) => u.id);
}

export async function sendNotification(
  input: SendNotificationInput,
): Promise<{ notificationId: string; recipients: number }> {
  const admin = createAdminClient();
  const resolved = await resolveRecipients(input.audience);

  // Enforce per-user prefs at fan-out: drop opted-out recipients. No prefs row
  // = receive everything; "manual" is never filtered (eventEnabled handles it).
  let recipients = resolved;
  if (resolved.length > 0) {
    const { data: prefRows } = await admin
      .from("user_preferences")
      .select("user_id, notification_prefs")
      .in("user_id", resolved);
    const optedOut = new Set(
      ((prefRows ?? []) as { user_id: string; notification_prefs: unknown }[])
        .filter((row) => !eventEnabled(parseNotificationPrefs(row.notification_prefs), input.category))
        .map((row) => row.user_id),
    );
    recipients = resolved.filter((id: string) => !optedOut.has(id));
    if (recipients.length === 0) return { notificationId: "", recipients: 0 };
  }

  const { data, error } = await admin
    .from("notifications")
    .insert(
      dbInsert("notifications", {
        type: input.type,
        category: input.category,
        title: input.title.slice(0, 300),
        body: (input.body ?? "").slice(0, 4000),
        audience_type: input.audience.type,
        audience_value:
          input.audience.type === "role"
            ? (input.audience.role as never)
            : input.audience.type === "users"
              ? (input.audience.userIds as never)
              : null,
        link_url: input.linkUrl ?? null,
        sender_id: input.senderId ?? null,
      }),
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create notification");
  const notificationId = (data as { id: string }).id;

  for (const batch of chunk(recipients, 1_000)) {
    const { error: readsError } = await admin.from("notification_reads").insert(
      dbInsert(
        "notification_reads",
        batch.map((userId) => ({ notification_id: notificationId, user_id: userId })),
      ),
    );
    if (readsError) throw new Error(readsError.message);
  }

  return { notificationId, recipients: recipients.length };
}

/** System: an order was assigned to a staff member. */
export async function notifyOrderAssigned(params: {
  orderId: string;
  orderCode: string;
  assigneeId: string;
  actorId: string;
  actorName: string;
}): Promise<void> {
  if (params.assigneeId === params.actorId) return; // self-assignment isn't news
  try {
    await sendNotification({
      type: "system",
      category: "order_assigned",
      title: `Order ${params.orderCode} assigned to you`,
      body: `${params.actorName} assigned order ${params.orderCode} to you.`,
      audience: { type: "users", userIds: [params.assigneeId] },
      senderId: params.actorId,
      linkUrl: `/orders/${params.orderId}`,
    });
  } catch (e) {
    console.error("[notifications] order-assigned failed:", e);
  }
}

/** System: an order reached Delivered. Tells the assignee + creator (not the actor). */
export async function notifyOrderDelivered(params: {
  orderId: string;
  orderCode: string;
  actorId: string;
  actorName: string;
  assigneeId: string | null;
  creatorId: string | null;
}): Promise<void> {
  const recipients = [...new Set([params.assigneeId, params.creatorId])].filter(
    (id): id is string => !!id && id !== params.actorId,
  );
  if (recipients.length === 0) return;
  try {
    await sendNotification({
      type: "system",
      category: "order_delivered",
      title: `Order ${params.orderCode} was delivered`,
      body: `${params.actorName} marked order ${params.orderCode} as delivered.`,
      audience: { type: "users", userIds: recipients },
      senderId: params.actorId,
      linkUrl: `/orders/${params.orderId}`,
    });
  } catch (e) {
    console.error("[notifications] order-delivered failed:", e);
  }
}

/** System: product stock fell to/below its minimum. Alerts all admins. */
export async function notifyLowStock(params: {
  productId: string;
  productName: string;
  newStock: number;
  minimumStock: number;
}): Promise<void> {
  try {
    await sendNotification({
      type: "system",
      category: "low_stock",
      title: `Low stock: ${params.productName}`,
      body: `${params.productName} is at ${params.newStock} (minimum ${params.minimumStock}). Consider restocking.`,
      audience: { type: "role", role: "admin" },
      linkUrl: `/products?focus=${params.productId}`,
    });
  } catch (e) {
    console.error("[notifications] low-stock failed:", e);
  }
}

/** System: a customer reached a new loyalty tier. Tells admins (CRM signal). */
export async function notifyTierUpgraded(params: {
  customerId: string;
  customerName: string;
  tierName: string;
}): Promise<void> {
  try {
    await sendNotification({
      type: "system",
      category: "tier_upgraded",
      title: `${params.customerName} reached ${params.tierName}`,
      body: `Loyalty engine upgraded ${params.customerName} to ${params.tierName}.`,
      audience: { type: "role", role: "admin" },
      linkUrl: `/crm?customer=${params.customerId}`,
    });
  } catch (e) {
    console.error("[notifications] tier-upgraded failed:", e);
  }
}

/** System: a voucher was issued automatically (rank upgrade / birthday / rule). */
export async function notifyVoucherIssued(params: {
  customerName: string;
  voucherCode: string;
  reason: string;
}): Promise<void> {
  try {
    await sendNotification({
      type: "system",
      category: "voucher_issued",
      title: `Voucher ${params.voucherCode} issued`,
      body: `${params.customerName} received ${params.voucherCode} (${params.reason}).`,
      audience: { type: "role", role: "admin" },
      linkUrl: `/crm/vouchers`,
    });
  } catch (e) {
    console.error("[notifications] voucher-issued failed:", e);
  }
}

/** System: a campaign finished sending. Tells its creator. */
export async function notifyCampaignCompleted(params: {
  campaignId: string;
  campaignName: string;
  creatorId: string | null;
  sent: number;
  failed: number;
}): Promise<void> {
  if (!params.creatorId) return;
  try {
    await sendNotification({
      type: "system",
      category: "campaign_completed",
      title: `Campaign “${params.campaignName}” completed`,
      body: `${params.sent} sent, ${params.failed} failed.`,
      audience: { type: "users", userIds: [params.creatorId] },
      linkUrl: `/marketing/${params.campaignId}`,
    });
  } catch (e) {
    console.error("[notifications] campaign-completed failed:", e);
  }
}

/**
 * System: a suspicious-pattern rule fired (spec Module 9) — repeated failed
 * logins / lockout, role escalation, new-IP login, log purge, or an
 * integrity-check mismatch. Always goes to all Admins.
 */
export async function notifySecurityAlert(params: {
  title: string;
  body: string;
  linkUrl?: string;
}): Promise<void> {
  try {
    await sendNotification({
      type: "system",
      category: "security_alert",
      title: `🛡 ${params.title}`,
      body: params.body,
      audience: { type: "role", role: "admin" },
      linkUrl: params.linkUrl ?? "/activity?preset=security",
    });
  } catch (e) {
    console.error("[notifications] security-alert failed:", e);
  }
}

/** System: a new message landed in a group (Phase 8 wires this up). */
export async function notifyNewGroupMessage(params: {
  groupId: string;
  groupName: string;
  senderId: string;
  senderName: string;
  memberIds: string[];
  preview: string;
}): Promise<void> {
  const recipients = params.memberIds.filter((id) => id !== params.senderId);
  if (recipients.length === 0) return;
  try {
    await sendNotification({
      type: "system",
      category: "new_message",
      title: `New message in ${params.groupName}`,
      body: `${params.senderName}: ${params.preview.slice(0, 140)}`,
      audience: { type: "users", userIds: recipients },
      senderId: params.senderId,
      linkUrl: `/messages?group=${params.groupId}`,
    });
  } catch (e) {
    console.error("[notifications] new-message failed:", e);
  }
}
