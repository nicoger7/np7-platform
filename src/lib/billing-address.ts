/**
 * The address that belongs on an invoice, and the rules for filling it in.
 *
 * A German invoice above 250 euro must carry the recipient's full name and
 * address (§14 UStG). Measured against production on 15 Sep 2026: 49 issued
 * invoices are over that line and exactly 2 carry an address. The rest print
 * "Bill to:" with a name and an email, which is a formally defective invoice,
 * and the guest only finds out when their accountant refuses it.
 *
 * Nobody was ever asked. The profile page has had the four fields for months
 * and a member has to go looking for them. So the address is now collected
 * where the guest already is: on Stripe's own Checkout page, which they pass
 * through for a card, an instant rail AND a bank transfer, since Stripe issues
 * the IBAN only after that page is submitted.
 *
 * THE ONE RULE THAT MATTERS HERE IS fillGaps. What comes back from a payment
 * page is worth having and is never worth more than what is already on the
 * contact: somebody in admin may have typed a correct address by hand, or the
 * guest may have given us their company's, and a half-filled form at a payment
 * page must not be allowed to wipe either. So an incoming value only ever
 * lands in a column that is empty. Nothing here overwrites, and nothing here
 * deletes.
 *
 * The second use is quieter and was the other half of the reason to build it:
 * guestCountry() in lib/payment-methods decides which payment methods a guest
 * is offered, today by inferring from a phone dial code and a free-text country
 * field, and 21 of 110 bookers cannot be resolved at all, so they get no Pay
 * button. A billing country is a fact rather than an inference, and Stripe
 * hands it over as an ISO two-letter code, which is precisely what
 * guestCountry already reads. No translation, and none wanted: "DE" is the
 * answer, "Germany" is a spelling of it.
 */

/** The four columns on `contacts` that make up a billing address. */
export type BillingAddress = {
  billing_address: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
};

/**
 * What Stripe puts on a completed Checkout Session's `customer_details.address`
 * once `billing_address_collection` is "required". Every field is optional
 * because the shape is Stripe's, not ours, and a missing one is a normal answer
 * rather than a fault: an address form filled in for a country with no postcode
 * comes back without one.
 */
export type StripeAddress = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  state?: string | null;
  country?: string | null;
};

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Present means "has something in it". A column holding "" or "   " is empty
 *  as far as an invoice is concerned, and treating it as filled is how a gap
 *  survives being filled. */
export const filled = (v: unknown): boolean => clean(v).length > 0;

/**
 * Stripe's address, in NP7's four columns.
 *
 * Only keys with something in them come back, so the result can be handed
 * straight to fillGaps without a blank from Stripe counting as an answer.
 *
 * `line1` and `line2` are joined into the single street line the invoice
 * prints: line2 is the flat or c/o, and it belongs with the street rather than
 * on a line of its own that nothing renders.
 *
 * `state` is DELIBERATELY DROPPED, and named here so it reads as a decision
 * rather than an oversight: there is no column for it, adding one is a
 * migration, and this change does not write DDL. It costs a US guest the state
 * line on their invoice. Everything §14 UStG is actually about is European,
 * where the postcode carries the region, so the gap is real and small; the day
 * a US-facing invoice needs to be right, that is the migration to write.
 */
export function addressFromStripe(address: StripeAddress | null | undefined): Partial<BillingAddress> {
  if (!address) return {};
  const street = [clean(address.line1), clean(address.line2)].filter(Boolean).join(", ");
  const out: Partial<BillingAddress> = {};
  if (street) out.billing_address = street;
  if (filled(address.postal_code)) out.billing_postal_code = clean(address.postal_code);
  if (filled(address.city)) out.billing_city = clean(address.city);
  // Upper-cased because it is an ISO code and guestCountry compares it as one.
  if (filled(address.country)) out.billing_country = clean(address.country).toUpperCase();
  return out;
}

/**
 * The columns this incoming address may fill, which are only the empty ones.
 *
 * Returns {} when there is nothing to do, so a caller can skip the write
 * entirely rather than touch a row to change nothing.
 */
/*
 * ALL FOUR OR NONE, and the reason is that a merged address is a fiction.
 *
 * Filling column by column looked careful and was not: an admin who typed a
 * Hamburg street with no postcode, and a guest who later checked out from their
 * new Berlin flat, produced a Hamburg street with a Berlin postcode. An address
 * that exists nowhere, printed on an invoice, and worse, now "complete", so
 * neither the ask nor any later checkout would ever correct it.
 *
 * So: a complete address already on file is never touched, because someone
 * meant it. An incomplete one is REPLACED outright by a complete one the guest
 * has just typed at a payment page, which is the most authoritative source we
 * will ever get. An incomplete incoming address is ignored altogether rather
 * than used to patch holes.
 */
export function fillGaps(
  current: Partial<BillingAddress> | null | undefined,
  incoming: Partial<BillingAddress>,
): Partial<BillingAddress> {
  const keys = ["billing_address", "billing_postal_code", "billing_city", "billing_country"] as const;
  const complete = (a: Partial<BillingAddress> | null | undefined) => keys.every((k) => filled(a?.[k]));
  if (complete(current)) return {};
  if (!complete(incoming)) return {};
  const patch: Partial<BillingAddress> = {};
  for (const k of keys) patch[k] = incoming[k] as string;
  return patch;
}


/**
 * Whether this contact's invoice would go out formally defective.
 *
 * All four are required rather than just the street: a street with no city is
 * not an address, and a guest half-way through is exactly the one worth asking.
 * The name is on the contact already and is checked nowhere here, because a
 * contact without a name cannot have booked.
 */
export function billingAddressIncomplete(current: Partial<BillingAddress> | null | undefined): boolean {
  return !filled(current?.billing_address)
    || !filled(current?.billing_postal_code)
    || !filled(current?.billing_city)
    || !filled(current?.billing_country);
}
