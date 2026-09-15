/**
 * One Stripe Customer per contact, created on demand and remembered forever.
 *
 * This exists for one reason: on a bank transfer the IBAN belongs to the
 * CUSTOMER, not to the payment. Reuse the same Customer and the same person
 * sees the same account number on every booking, which is the whole point —
 * they recognise it, their bank remembers it, and a transfer sent from memory
 * still lands somewhere that reconciles.
 *
 * THE IDEMPOTENCY KEY IS THE MOST IMPORTANT LINE IN THIS FILE. Two Pay presses
 * a second apart, or a double-submit, otherwise create two Customers for one
 * human and therefore two IBANs; a transfer sent to the loser then reconciles
 * against nothing and sits in a cash balance nobody is watching. Keying on the
 * contact id makes Stripe hand back the first Customer instead of minting a
 * second.
 *
 * SEARCHING STRIPE BY EMAIL IS FORBIDDEN HERE, tempting as it looks. Stripe
 * permits duplicate emails, so `GET /v1/customers?email=` can return several
 * rows, and search-then-create is a race that can hand one human two IBANs
 * anyway. The stored id is the only lookup.
 *
 * AND THERE IS NO BACKFILL for the two guests who already paid by card. They
 * paid as Stripe guest charges, so there is no Customer to attach, and their
 * old PaymentIntents stay unattached. That changes no number anywhere: every
 * report and every dedupe in this codebase keys on the PaymentIntent id. They
 * get a Customer on demand like everybody else.
 *
 * (/api/reserve/route.ts holds its own inline copy of this logic and should
 * eventually call this instead. It is a register route another workflow owns
 * today, so it is flagged rather than touched.)
 */
import { stripeConfigured, stripePost } from "@/lib/stripe";

export async function ensureStripeCustomer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  who: { contactId: string; email?: string | null; name?: string | null },
): Promise<string | null> {
  if (!who.contactId || !stripeConfigured()) return null;

  const read = async (): Promise<string | null> => {
    const { data } = await db.from("contacts").select("stripe_customer_id").eq("id", who.contactId).maybeSingle();
    const id = (data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
    return typeof id === "string" && id.startsWith("cus_") ? id : null;
  };

  const stored = await read();
  if (stored) return stored;

  const params: Record<string, string> = { "metadata[contact_id]": who.contactId };
  if (who.email) params["email"] = who.email;
  if (who.name) params["name"] = who.name;

  const { ok, json } = await stripePost("/customers", params, `np7-customer:${who.contactId}`);
  const created = ok && typeof json.id === "string" ? (json.id as string) : null;
  if (!created) {
    console.error("[stripe-customer] create failed for contact", who.contactId, (json.error as { message?: string })?.message);
    return null;
  }

  /*
   * Claim it only if nobody else has. A concurrent writer that got there first
   * holds a DIFFERENT Customer id, and overwriting theirs would strand the IBAN
   * a guest may already be looking at. Zero rows affected means we lost, so we
   * read theirs back and use it; ours is left unused at Stripe, which costs
   * nothing and confuses nobody.
   */
  const { data: claimed } = await db.from("contacts")
    .update({ stripe_customer_id: created })
    .eq("id", who.contactId).is("stripe_customer_id", null)
    .select("id");
  if (((claimed as unknown[] | null) ?? []).length > 0) return created;

  const theirs = await read();
  if (theirs) return theirs;
  // Neither ours nor theirs came back: the update failed for some other reason
  // (a permission, a dropped connection). Returning the id we just made would
  // mean an IBAN we cannot find again later, so refuse instead.
  console.error("[stripe-customer] could not store the Customer for contact", who.contactId);
  return null;
}
