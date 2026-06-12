import "server-only";

import { createClient } from "@/lib/supabase/server";
import { asRow } from "@/lib/supabase/types";

export interface OrgBranding {
  companyName: string;
  logoUrl: string | null;
  addressLine: string | null;
  contactEmail: string | null;
  currency: string;
}

/**
 * Company branding from Settings — stamped onto PDF exports, the print view
 * and the login screen. Single tiny row; cached per-worker for 60s.
 */
let cache: { at: number; value: OrgBranding } | null = null;

export async function getOrgBranding(): Promise<OrgBranding> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;

  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_settings")
    .select("company_name, logo_url, address_line, contact_email, currency")
    .eq("id", "org")
    .maybeSingle();

  const row = asRow<{
    company_name: string;
    logo_url: string | null;
    address_line: string | null;
    contact_email: string | null;
    currency: string;
  }>(data);

  const value: OrgBranding = {
    companyName: row?.company_name ?? "Furnza",
    logoUrl: row?.logo_url ?? null,
    addressLine: row?.address_line ?? null,
    contactEmail: row?.contact_email ?? null,
    currency: row?.currency ?? "USD",
  };
  cache = { at: Date.now(), value };
  return value;
}

/** Invalidate after Settings updates so new branding applies immediately. */
export function invalidateBrandingCache(): void {
  cache = null;
}
