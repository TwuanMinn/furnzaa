import "server-only";

import { rpcParams } from "./types";
import type { createClient } from "./server";
import type { createAdminClient } from "./admin";

/**
 * Either app client: the RLS-scoped `@supabase/ssr` server client or the
 * service-role `@supabase/supabase-js` admin client. The two libraries produce
 * structurally different `SupabaseClient` types, so accept their actual return
 * types rather than a hand-written `SupabaseClient<Database>` (which only
 * matches the admin client).
 */
type DbClient =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createAdminClient>;

/**
 * Allocate the next sequential document number for a prefix (e.g. "SKU", "PO",
 * "PRD") via the `next_document_number` RPC. Throws on error so the caller's
 * try/catch maps it through the shared `fail()`. Pass either the RLS-scoped
 * server client or the admin client.
 */
export async function nextDocumentNumber(client: DbClient, prefix: string): Promise<string> {
  // The two client types collapse postgrest's `.rpc` overloads differently
  // under TS6; cast to the admin client's shape to make the call (the args are
  // validated by `rpcParams`).
  const { data, error } = await (client as ReturnType<typeof createAdminClient>).rpc(
    "next_document_number",
    rpcParams("next_document_number", { p_prefix: prefix }),
  );
  if (error) throw new Error(error.message);
  return data as string;
}
