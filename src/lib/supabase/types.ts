import type { Database } from "./database.types";

/**
 * Convenience aliases derived by INDEXED ACCESS into the generated `Database`
 * type (this always works and stays correct on regeneration).
 *
 * Why we cast query results to these instead of relying on supabase-js's
 * inferred result types: @supabase/postgrest-js's deep conditional types don't
 * yet resolve correctly under TypeScript 6 (it predates the TS6 release), so
 * `.select("col, col")` results can collapse to `never` at the type level even
 * though they're correct at runtime. We therefore type the SELECTED shape via
 * `Pick<Tables<"table">, ...>` and cast the result. Centralized here so the
 * pattern is consistent across every data-access call.
 */
export type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type DbFunctions<T extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][T];

type TableName = keyof PublicSchema["Tables"];

/**
 * TS6 write helpers. `@supabase/postgrest-js` types `.insert()/.update()/.upsert()`
 * args as `never` under TS6, so these validate the payload against the REAL
 * Insert/Update shape (full type-checking) and then cast to satisfy the param.
 *   .update(dbUpdate("users", { last_login_at }))
 *   .insert(dbInsert("orders", row))
 */
export function dbInsert<T extends TableName>(
  _table: T,
  payload: TablesInsert<T> | TablesInsert<T>[],
) {
  return payload as never;
}
export function dbUpdate<T extends TableName>(_table: T, payload: TablesUpdate<T>) {
  return payload as never;
}

/** TS6 read helpers: cast a (possibly `never`-typed) result to a known shape. */
export function asRow<T>(data: unknown): T | null {
  return (data ?? null) as T | null;
}
export function asRows<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}

type FunctionName = keyof PublicSchema["Functions"];

/**
 * TS6 RPC-args helper: validates the args object against the generated
 * function signature, then casts to satisfy supabase-js's collapsed param type.
 *   .rpc("next_document_number", rpcParams("next_document_number", { p_prefix: "PO" }))
 */
export function rpcParams<F extends FunctionName>(
  _fn: F,
  args: PublicSchema["Functions"][F]["Args"],
) {
  return args as never;
}

// Frequently-used row aliases.
export type UserRow = Tables<"users">;
export type CustomerRow = Tables<"customers">;
export type OrderRow = Tables<"orders">;
export type OrderItemRow = Tables<"order_items">;
export type OrderStatusHistoryRow = Tables<"order_status_history">;
export type NotificationRow = Tables<"notifications">;
export type MessageRow = Tables<"messages">;
export type MessageGroupRow = Tables<"message_groups">;
export type ActivityLogRow = Tables<"activity_logs">;
export type RoleRow = Tables<"roles">;
export type OrganizationSettingsRow = Tables<"organization_settings">;
