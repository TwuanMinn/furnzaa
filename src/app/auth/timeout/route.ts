import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity/log";

/**
 * Idle-session timeout handoff (redirected here by middleware so the logout
 * is logged through the standard logActivity path). Public route: hitting it
 * directly just signs the caller out, which is harmless.
 */
export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await logActivity({
      actor: { id: user.id, email: user.email ?? "" },
      action: "auth.session_timeout",
      module: "auth",
      targetType: "user",
      targetId: user.id,
      summary: `${user.email ?? "User"} was signed out after inactivity`,
    });
    await supabase.auth.signOut();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", next);
  url.searchParams.set("reason", "timeout");
  const res = NextResponse.redirect(url);
  res.cookies.delete("fz_last_seen");
  return res;
}
