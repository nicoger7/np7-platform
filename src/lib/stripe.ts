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

async function stripePost(path: string, params: Record<string, string>): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const key = stripeKey();
  if (!key) return { ok: false, json: { error: { message: "STRIPE_SECRET_KEY not set" } } };
  const res = await fetch(`${STRIPE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
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
  metadata: Record<string, string>;
  paymentIntentDescription?: string;
  /** Restrict how it can be paid, e.g. ["card"] when a card fee is on the bill. */
  paymentMethodTypes?: string[];
  /** Unix seconds; Stripe allows 30 min to 24 h from now. */
  expiresAt?: number;
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
  if (opts.expiresAt) params["expires_at"] = String(Math.round(opts.expiresAt));
  if (opts.customerEmail) params["customer_email"] = opts.customerEmail;
  if (opts.paymentIntentDescription) params["payment_intent_data[description]"] = opts.paymentIntentDescription;
  for (const [k, v] of Object.entries(opts.metadata)) params[`metadata[${k}]`] = v;

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
