import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { asRow, asRows } from "@/lib/supabase/types";
import { MessagesClient } from "./messages-client";

export const metadata = { title: "Messages" };

/** Fallback if organization_settings.messaging_config is missing/malformed. */
const DEFAULT_REACTION_EMOJIS = ["❤️", "😆", "😮", "😢", "👍", "👎"];

/**
 * Messages (Module 4): admin-created groups + direct conversations, live via
 * Supabase Realtime, attachments via Storage. Staff only ever see groups
 * they belong to (RLS).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const [user, sp] = await Promise.all([getSessionUser(), searchParams]);
  if (!user) redirect("/login");
  if (!user.permissions.has("messages.view")) redirect("/dashboard");

  // People picker for new direct messages / group creation + reaction palette.
  const supabase = await createClient();
  const [{ data }, { data: settingsRaw }] = await Promise.all([
    supabase
      .from("users")
      .select("id, full_name, avatar_url")
      .eq("is_active", true)
      .neq("id", user.id)
      .order("full_name", { ascending: true })
      .limit(100),
    supabase
      .from("organization_settings")
      .select("messaging_config")
      .eq("id", "org")
      .maybeSingle(),
  ]);
  const people = asRows<{ id: string; full_name: string; avatar_url: string | null }>(data);

  const config = asRow<{ messaging_config: { reaction_emojis?: unknown } | null }>(
    settingsRaw,
  )?.messaging_config;
  const configured = Array.isArray(config?.reaction_emojis)
    ? config.reaction_emojis.filter((e): e is string => typeof e === "string")
    : [];
  const reactionEmojis = configured.length > 0 ? configured : DEFAULT_REACTION_EMOJIS;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <MessagesClient
        people={people}
        initialGroupId={sp.group ?? null}
        reactionEmojis={reactionEmojis}
      />
    </div>
  );
}
