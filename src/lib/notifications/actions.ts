"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { dbUpdate } from "@/lib/supabase/types";
import { requirePermission, requireUser, ForbiddenError, UnauthorizedError } from "@/lib/rbac/guards";
import { logActivity } from "@/lib/activity/log";
import { sendNotification } from "./service";

export type NotifActionResult = { ok: true } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof UnauthorizedError) return { ok: false, error: "You are not signed in." };
  if (e instanceof ForbiddenError) return { ok: false, error: "You don't have permission to do that." };
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
}

const composeSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(300),
  body: z.string().trim().max(4000).optional().or(z.literal("")),
  audience: z.discriminatedUnion("type", [
    z.object({ type: z.literal("all") }),
    z.object({ type: z.literal("role"), role: z.enum(["admin", "staff"]) }),
    z.object({ type: z.literal("users"), userIds: z.array(z.string().uuid()).min(1, "Pick at least one user") }),
  ]),
});
export type ComposeNotificationInput = z.infer<typeof composeSchema>;

/** Admin compose & send — to everyone, a role, or specific users. */
export async function composeNotificationAction(
  input: ComposeNotificationInput,
): Promise<{ ok: true; recipients: number } | { ok: false; error: string }> {
  try {
    const actor = await requirePermission("notifications.create");
    const parsed = composeSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { title, body, audience } = parsed.data;

    const { recipients } = await sendNotification({
      type: "manual",
      category: "manual",
      title,
      body: body || "",
      audience,
      senderId: actor.id,
    });

    const audienceLabel =
      audience.type === "all"
        ? "all users"
        : audience.type === "role"
          ? `all ${audience.role} users`
          : `${audience.userIds.length} selected user(s)`;
    void logActivity({
      actor,
      action: "notification.send",
      module: "notifications",
      summary: `Sent “${title}” to ${audienceLabel} (${recipients} recipient(s))`,
      after: { title, audience: audienceLabel, recipients },
    });

    return { ok: true, recipients };
  } catch (e) {
    return fail(e);
  }
}

/** Mark one of MY notifications read (RLS restricts to own rows). */
export async function markNotificationReadAction(notificationId: string): Promise<NotifActionResult> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase
      .from("notification_reads")
      .update(dbUpdate("notification_reads", { read_at: new Date().toISOString() }))
      .eq("notification_id", notificationId)
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Mark ALL my notifications read (single UPDATE via RPC). */
export async function markAllNotificationsReadAction(): Promise<NotifActionResult> {
  try {
    await requireUser();
    const supabase = await createClient();
    const { error } = await supabase.rpc("mark_all_notifications_read");
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
