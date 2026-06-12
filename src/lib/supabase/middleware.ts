import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Routes reachable without a session. Everything else requires login.
 * /api/cron authenticates itself with CRON_SECRET (machine caller, no cookies).
 * /api/track is hit from campaign emails/links — public by design; it only
 * records events for (campaign, recipient) pairs that actually exist.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/api/cron",
  "/api/track",
];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Sliding idle-timeout marker. httpOnly so client JS can't fake activity. */
const LAST_SEEN_COOKIE = "fz_last_seen";

// Settings → Security → session timeout, cached per worker for 60s so the
// gate doesn't add a DB read to every request.
let timeoutCache: { at: number; minutes: number } | null = null;

async function getSessionTimeoutMin(
  supabase: ReturnType<typeof createServerClient<Database>>,
): Promise<number> {
  if (timeoutCache && Date.now() - timeoutCache.at < 60_000) return timeoutCache.minutes;
  const { data } = await supabase
    .from("organization_settings")
    .select("session_timeout_min")
    .eq("id", "org")
    .maybeSingle();
  const minutes = (data as { session_timeout_min: number } | null)?.session_timeout_min ?? 60;
  timeoutCache = { at: Date.now(), minutes };
  return minutes;
}

/**
 * Refreshes the Supabase session on every request (rotates the auth cookie) and
 * gatekeeps protected routes. Wired up in src/middleware.ts.
 *
 * IMPORTANT: always return the `supabaseResponse` (or a redirect that copies its
 * cookies) so refreshed tokens are persisted.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getUser() — it must run first.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Unauthenticated → bounce to /login (preserving intended destination).
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated user hitting an auth page → send to the app.
  if (user && (pathname === "/login" || pathname === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Idle-session timeout (Settings → Security). When the last-seen marker is
  // older than the configured window, hand off to /auth/timeout, which logs
  // the event and signs the user out through the normal server path. Never
  // let this bookkeeping break a request.
  if (user && !isPublic(pathname)) {
    try {
      const minutes = await getSessionTimeoutMin(supabase);
      const last = Number(request.cookies.get(LAST_SEEN_COOKIE)?.value ?? 0);
      const now = Date.now();
      if (minutes > 0 && Number.isFinite(last) && last > 0 && now - last > minutes * 60_000) {
        const url = request.nextUrl.clone();
        url.pathname = "/auth/timeout";
        url.search = "";
        url.searchParams.set("next", pathname);
        const redirect = NextResponse.redirect(url);
        supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c));
        return redirect;
      }
      supabaseResponse.cookies.set(LAST_SEEN_COOKIE, String(now), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
      });
    } catch (e) {
      console.error("[middleware] session-timeout check failed:", e);
    }
  }

  return supabaseResponse;
}
