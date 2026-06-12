import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRows } from "@/lib/supabase/types";
import {
  buildPage,
  ilikeAnyExpression,
  keysetOrExpression,
  type ParsedListQuery,
} from "@/lib/datatable/server";

export type SupplierListRow = {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
};

const LIST_COLUMNS = "id, company_name, contact_name, email, phone, address, is_active, created_at";

/** Allow-listed sortable columns (NOT NULL — keyset-safe). */
export const SUPPLIER_SORTABLE: Record<string, string> = {
  created_at: "created_at",
  company_name: "company_name",
};

/** One keyset page of suppliers (company-name trigram search). */
export async function fetchSuppliersPage(parsed: ParsedListQuery) {
  const supabase = await createClient();

  let query = supabase
    .from("suppliers")
    .select(LIST_COLUMNS, parsed.cursor ? {} : { count: "estimated" })
    .is("deleted_at", null);

  if (parsed.q) {
    query = query.or(ilikeAnyExpression(["company_name", "contact_name", "email"], parsed.q));
  }
  if (parsed.cursor) {
    query = query.or(keysetOrExpression(parsed.cursor, parsed.sort, parsed.ascending));
  }

  const { data, error, count } = await query
    .order(parsed.sort, { ascending: parsed.ascending })
    .order("id", { ascending: parsed.ascending })
    .limit(parsed.limit + 1);

  if (error) throw new Error(error.message);
  return buildPage(asRows<SupplierListRow>(data), parsed.limit, parsed.sort, count ?? null);
}
