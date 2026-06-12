"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Browser Supabase client. Used in Client Components for queries and Realtime
 * subscriptions. Runs as the signed-in user, so RLS applies automatically.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// Reuse a single browser client across the app.
let browserClient: ReturnType<typeof createClient> | undefined;
export function getBrowserClient() {
  browserClient ??= createClient();
  return browserClient;
}
