import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac/guards";
import { JoinClient } from "./join-client";

export const metadata = { title: "Join group" };

/**
 * Landing page for group invite links (/messages/join/<token>). Internal
 * only: middleware bounces logged-out visitors to /login?next=… first, and
 * joinViaInviteAction re-checks permission + consumes the link atomically.
 * Joining requires an explicit click so GETs (e.g. link prefetch) never
 * consume a one-time link.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const [user, { token }] = await Promise.all([getSessionUser(), params]);
  if (!user) redirect("/login");
  if (!user.permissions.has("messages.view")) redirect("/dashboard");

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] items-center justify-center p-4">
      <JoinClient token={token} />
    </div>
  );
}
