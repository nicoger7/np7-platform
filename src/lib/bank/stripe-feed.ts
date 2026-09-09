/**
 * Stripe as a second money source, beside the bank.
 *
 * We import CHARGES, not payouts and not balance transactions. A charge is the
 * moment a guest paid, it carries their name, their email and the metadata our
 * own checkout stamped on it; the payout that lands in Qonto days later is one
 * lump of several charges minus fees and can never be matched to a person.
 * Qonto's importer marks that payout `kind: 'payout'` for exactly this reason,
 * so the same money is represented once, here, per guest.
 *
 * The external id is the PAYMENT INTENT (`pi_…`), not the charge id, because
 * that is the string the existing exp_payments rows already carry in
 * `reference` — 13 of them at the time of writing. Keying on it means importing
 * Stripe history reconciles those rows instead of duplicating them.
 */
import { stripeConfigured, stripeKey } from "@/lib/stripe";
import type { NormalisedTransaction } from "./types";

const STRIPE = "https://api.stripe.com/v1";

export { stripeConfigured };

async function stripeGet(path: string, params: Record<string, string>): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const key = stripeKey();
  if (!key) return { ok: false, status: 0, json: { error: "STRIPE_SECRET_KEY not set" } };
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${STRIPE}${path}?${qs}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

type StripeCharge = {
  id: string;
  amount: number;
  amount_refunded?: number;
  currency: string;
  created: number;
  description?: string | null;
  paid: boolean;
  refunded?: boolean;
  status: string;
  payment_intent?: string | null;
  receipt_email?: string | null;
  billing_details?: { name?: string | null; email?: string | null };
  metadata?: Record<string, string>;
  balance_transaction?: string | null;
};

function normalise(c: StripeCharge): NormalisedTransaction | null {
  // Only money that actually arrived. A failed or uncaptured charge is not a
  // movement, and putting it in the ledger would make someone chase a payment
  // that never happened.
  if (!c.paid || c.status !== "succeeded") return null;

  const externalId = c.payment_intent || c.id;
  const gross = c.amount / 100;

  return {
    source: "stripe",
    externalId,
    accountRef: "stripe",
    bookedOn: new Date(c.created * 1000).toISOString().slice(0, 10),
    executedAt: new Date(c.created * 1000).toISOString(),
    amount: Math.round(gross * 100) / 100,
    currency: String(c.currency || "eur").toUpperCase(),
    counterparty: c.billing_details?.name ?? null,
    counterpartyIban: null,
    /* Everything the matcher might read, in one string: our own checkout
       metadata first (booking_id / contact_id are exact), then the description
       and the payer's email. */
    reference: [
      c.metadata?.booking_id ? `booking:${c.metadata.booking_id}` : "",
      c.metadata?.contact_id ? `contact:${c.metadata.contact_id}` : "",
      c.metadata?.invoice_number ?? "",
      c.description ?? "",
      c.billing_details?.email ?? c.receipt_email ?? "",
    ]
      .filter(Boolean)
      .join(" · ") || null,
    label: c.description ?? "Stripe payment",
    status: "completed",
    kind: "income",
    raw: c as unknown as Record<string, unknown>,
  };
}

/** Succeeded charges created on or after `since`, paged out. */
export async function stripeCharges(since: string, maxPages = 20): Promise<{ ok: boolean; transactions: NormalisedTransaction[]; error?: string }> {
  if (!stripeConfigured()) return { ok: false, transactions: [], error: "Stripe is not configured" };

  const out: NormalisedTransaction[] = [];
  const createdGte = Math.floor(new Date(since).getTime() / 1000);
  let startingAfter: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, string> = {
      limit: "100",
      "created[gte]": String(createdGte),
    };
    if (startingAfter) params.starting_after = startingAfter;

    const { ok, status, json } = await stripeGet("/charges", params);
    if (!ok) return { ok: false, transactions: out, error: `Stripe /charges returned ${status}` };

    const rows = (json.data as StripeCharge[]) ?? [];
    for (const c of rows) {
      const n = normalise(c);
      if (n) out.push(n);
    }
    if (!json.has_more || !rows.length) break;
    startingAfter = rows[rows.length - 1]?.id;
  }
  return { ok: true, transactions: out };
}
