/**
 * Tiny Stripe REST helper — no `stripe` npm package (keeps the bundle lean and
 * matches the existing /api/reserve + webhook pattern). Every call degrades
 * gracefully when STRIPE_SECRET_KEY is unset so nothing breaks pre-config.
 */

const STRIPE = "https://api.stripe.com/v1";

export function stripeKey(): string | null {
  return process.env.STRIPE_SECRET_KEY || null;
}
export function stripeConfigured(): boolean {
  return !!stripeKey();
}

/**
 * `idempotencyKey` makes Stripe return the FIRST response for a repeated call
 * rather than doing the thing twice. It matters wherever a second press would
 * create a second object with a life of its own — a Customer above all, because
 * a Customer is an IBAN and one human must never have two.
 */
export async function stripePost(path: string, params: Record<string, string>, idempotencyKey?: string): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const key = stripeKey();
  if (!key) return { ok: false, json: { error: { message: "STRIPE_SECRET_KEY not set" } } };
  const res = await fetch(`${STRIPE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: new URLSearchParams(params).toString(),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

export type CheckoutLine = { name: string; description?: string; amountCents: number };

/**
 * Create a Checkout Session (mode=payment). Returns the hosted-page url + id,
 * or null when Stripe isn't configured / the call fails (caller degrades).
 */
export async function createCheckoutSession(opts: {
  line?: CheckoutLine;
  /** Several lines, e.g. the payment plus a card fee. Wins over `line`. */
  lines?: CheckoutLine[];
  currency?: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  /** An existing Customer id. Sent INSTEAD of customerEmail, never beside it:
   *  Stripe errors on both at once. Required for a bank transfer, where the
   *  IBAN is issued against that Customer's cash balance. */
  customer?: string;
  metadata: Record<string, string>;
  /** Copied onto the PaymentIntent's own metadata. Session metadata does NOT
   *  propagate to the intent, and a PI-level event (a partial funding, say)
   *  carries no session at all, so without this such an event has no way back
   *  to the link row it belongs to. */
  paymentIntentMetadata?: Record<string, string>;
  /** Raw Stripe form keys the caller builds itself, e.g. the customer_balance
   *  map from lib/bank-transfer. Applied last so it is the final word. */
  extraParams?: Record<string, string>;
  paymentIntentDescription?: string;
  /** Restrict how it can be paid, e.g. ["card"] when a card fee is on the bill.
   *  Naming types turns OFF Stripe's own country filtering, so prefer the
   *  configuration below and exclude what you do not want. */
  paymentMethodTypes?: string[];
  /** Let Stripe choose from a dashboard configuration and filter by where the
   *  guest actually is. Ignored when paymentMethodTypes is set. */
  paymentMethodConfiguration?: string;
  /** Drop specific methods from that configuration for this one payment.
   *  Cannot remove Apple Pay, Google Pay or Link, which ride with the card. */
  excludedPaymentMethodTypes?: string[];
  /** Unix seconds; Stripe allows 30 min to 24 h from now. */
  expiresAt?: number;
  /**
   * Make Checkout ASK for the billing address and hand it back on the completed
   * session as `customer_details.address`.
   *
   * Stripe's default is "auto", which collects an address only where the
   * payment method itself insists, so almost nobody is asked and almost nobody
   * answers: 49 issued invoices are over the €250 line §14 UStG draws and 2 of
   * them carry an address. "required" asks every guest, on a page they are
   * already standing on, for four fields they can fill from memory.
   *
   * It costs one extra form on the way to paying, which is why it is an option
   * and not a default buried in this helper: every caller says yes on purpose.
   */
  collectBillingAddress?: boolean;
}): Promise<{ url: string; id: string } | null> {
  const lines = opts.lines ?? (opts.line ? [opts.line] : []);
  if (!lines.length) return null;
  const params: Record<string, string> = {
    mode: "payment",
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  };
  lines.forEach((l, i) => {
    params[`line_items[${i}][quantity]`] = "1";
    params[`line_items[${i}][price_data][currency]`] = (opts.currency || "eur").toLowerCase();
    params[`line_items[${i}][price_data][unit_amount]`] = String(Math.round(l.amountCents));
    params[`line_items[${i}][price_data][product_data][name]`] = l.name;
    if (l.description) params[`line_items[${i}][price_data][product_data][description]`] = l.description;
  });
  (opts.paymentMethodTypes ?? []).forEach((t, i) => { params[`payment_method_types[${i}]`] = t; });
  // Stripe refuses both at once: a named list is the opposite of letting it pick.
  if (!opts.paymentMethodTypes?.length && opts.paymentMethodConfiguration) {
    params["payment_method_configuration"] = opts.paymentMethodConfiguration;
  }
  (opts.excludedPaymentMethodTypes ?? []).forEach((t, i) => { params[`excluded_payment_method_types[${i}]`] = t; });
  if (opts.expiresAt) params["expires_at"] = String(Math.round(opts.expiresAt));
  if (opts.collectBillingAddress) params["billing_address_collection"] = "required";
  // A Customer wins over an email: Stripe refuses both, and only the Customer
  // can carry a cash balance, which is what a bank transfer is paid into.
  if (opts.customer) params["customer"] = opts.customer;
  else if (opts.customerEmail) params["customer_email"] = opts.customerEmail;
  if (opts.paymentIntentDescription) params["payment_intent_data[description]"] = opts.paymentIntentDescription;
  for (const [k, v] of Object.entries(opts.metadata)) params[`metadata[${k}]`] = v;
  for (const [k, v] of Object.entries(opts.paymentIntentMetadata ?? {})) params[`payment_intent_data[metadata][${k}]`] = v;
  for (const [k, v] of Object.entries(opts.extraParams ?? {})) params[k] = v;

  const { ok, json } = await stripePost("/checkout/sessions", params);
  if (!ok || typeof json.url !== "string") {
    console.error("stripe checkout error", (json.error as { message?: string })?.message);
    return null;
  }
  return { url: json.url as string, id: json.id as string };
}

/** Expire an open Checkout Session so its link stops working. */
export async function expireCheckoutSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const { ok, json } = await stripePost(`/checkout/sessions/${sessionId}/expire`, {});
  return ok ? { ok: true } : { ok: false, error: (json.error as { message?: string })?.message || "expire failed" };
}

/** Partial (or full) refund on a PaymentIntent. amountCents omitted = full refund. */
export async function refundPaymentIntent(paymentIntent: string, amountCents?: number): Promise<{ ok: boolean; id?: string; error?: string }> {
  const params: Record<string, string> = { payment_intent: paymentIntent };
  if (amountCents != null) params["amount"] = String(Math.round(amountCents));
  const { ok, json } = await stripePost("/refunds", params);
  if (!ok) return { ok: false, error: (json.error as { message?: string })?.message || "refund failed" };
  return { ok: true, id: json.id as string };
}

/**
 * What card actually paid: issuing country, brand, funding. Stripe only knows
 * this once the charge exists, which is precisely why the fee has to be checked
 * after the fact rather than guessed before it.
 */
export async function cardForPaymentIntent(paymentIntent: string): Promise<{ country: string | null; brand: string | null; funding: string | null } | null> {
  const key = stripeKey();
  if (!key) return null;
  const res = await fetch(`${STRIPE}/payment_intents/${paymentIntent}?expand[]=latest_charge`, { headers: { Authorization: `Bearer ${key}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const card = (json as any)?.latest_charge?.payment_method_details?.card;
  if (!card) return null;
  return { country: card.country ?? null, brand: card.brand ?? null, funding: card.funding ?? null };
}

/**
 * What a PaymentIntent actually received, and when.
 *
 * `amount_received` is the only honest figure on a bank transfer: Stripe cannot
 * control what the guest types into their banking app, so what was asked for
 * and what arrived are two different numbers. `chargeCreated` is the day the
 * money landed, which is not the day this webhook runs — a retry after an
 * outage can be hours or a day late, and settleInvoices() settles oldest-first
 * on the real payment date, so a drifting date mis-settles invoices.
 */
export async function paymentIntentDetails(paymentIntent: string): Promise<{ amountReceived: number | null; status: string | null; chargeCreated: number | null } | null> {
  const key = stripeKey();
  if (!key) return null;
  try {
    const res = await fetch(`${STRIPE}/payment_intents/${paymentIntent}?expand[]=latest_charge`, { headers: { Authorization: `Bearer ${key}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pi = json as any;
    const created = pi?.latest_charge?.created;
    return {
      amountReceived: typeof pi?.amount_received === "number" ? pi.amount_received : null,
      status: typeof pi?.status === "string" ? pi.status : null,
      chargeCreated: typeof created === "number" ? created : null,
    };
  } catch {
    return null;
  }
}

/**
 * The bank details Stripe is showing this guest: the hosted instructions page,
 * the reference they must quote, and the account the money goes to.
 *
 * None of this is on the Checkout Session. It lives on the PaymentIntent's
 * `next_action`, which is why the completed-and-unpaid branch has to fetch the
 * intent: the instructions URL is the whole promise this feature makes, and a
 * guest who closed the tab has nothing else.
 *
 * Optional-chains everything and returns null rather than throwing. The exact
 * shape of next_action is the one thing in this build that cannot be verified
 * from this machine, and making Stripe retry an event that carries no money
 * helps nobody.
 */
export async function transferInstructions(paymentIntent: string): Promise<{
  hostedInstructionsUrl: string | null; reference: string | null;
  iban: string | null; bic: string | null; accountHolder: string | null; amountRemaining: number | null;
} | null> {
  const key = stripeKey();
  if (!key) return null;
  try {
    const res = await fetch(`${STRIPE}/payment_intents/${paymentIntent}`, { headers: { Authorization: `Bearer ${key}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n = (json as any)?.next_action?.display_bank_transfer_instructions;
    if (!n) return null;
    // Stripe returns the addresses as a list because an account can have more
    // than one; the IBAN one is what a SEPA guest needs.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acct = (n.financial_addresses ?? []).find((a: any) => a?.type === "iban") ?? n.financial_addresses?.[0] ?? null;
    return {
      hostedInstructionsUrl: n.hosted_instructions_url ?? null,
      reference: n.reference ?? null,
      iban: acct?.iban?.iban ?? null,
      bic: acct?.iban?.bic ?? null,
      accountHolder: acct?.iban?.account_holder_name ?? null,
      amountRemaining: typeof n.amount_remaining === "number" ? n.amount_remaining : null,
    };
  } catch {
    return null;
  }
}

/** Look up the PaymentIntent id for a completed Checkout Session. */
export async function paymentIntentForSession(sessionId: string): Promise<string | null> {
  const key = stripeKey();
  if (!key) return null;
  const res = await fetch(`${STRIPE}/checkout/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${key}` } });
  const json = await res.json().catch(() => ({}));
  const pi = json.payment_intent;
  return typeof pi === "string" ? pi : null;
}

/** €-format minor helper for descriptions/emails. */
export function eur(amount: number, currency = "EUR"): string {
  const symbol = currency === "EUR" ? "€" : `${currency} `;
  return `${symbol}${amount.toLocaleString("en-US")}`;
}
