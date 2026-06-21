import { createAdminClient } from "@/lib/supabase";

/**
 * Legal-entity data for the Impressum / privacy / terms pages — pulled from the
 * Experience division's company_settings row (migration 021), so the published
 * legal pages always reflect the real, single source of truth. Falls back to
 * sensible labels when a field hasn't been filled in yet.
 */
export type LegalEntity = {
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  vatId: string;
  taxNumber: string;
  registerInfo: string;
  managingDirector: string;
};

export async function getLegalEntity(): Promise<LegalEntity> {
  let data: Record<string, unknown> | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const res = await db.from("company_settings").select("*").eq("division", "experience").maybeSingle();
    data = res.data ?? null;
  } catch {
    data = null;
  }
  const g = (k: string) => (data && typeof data[k] === "string" ? (data[k] as string) : "");
  return {
    legalName: g("legal_name") || "NP7 GmbH",
    addressLine1: g("address_line1"),
    addressLine2: g("address_line2"),
    postalCode: g("postal_code"),
    city: g("city"),
    country: g("country") || "Germany",
    email: g("email"),
    phone: g("phone"),
    website: g("website") || "www.np-seven.com",
    vatId: g("vat_id"),
    taxNumber: g("tax_number"),
    registerInfo: g("register_info"),
    managingDirector: g("managing_director"),
  };
}

/** Single-line postal address. */
export function addressLine(e: LegalEntity): string {
  return [e.addressLine1, e.addressLine2, [e.postalCode, e.city].filter(Boolean).join(" "), e.country].filter(Boolean).join(", ");
}
