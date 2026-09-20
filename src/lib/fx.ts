import "server-only";

/**
 * Euros into the currency a guest can actually transfer, plus what that costs.
 *
 * A US guest cannot send euros to a SEPA IBAN from their banking app, and
 * Stripe will not issue them a euro account: a SEPA-country Stripe account may
 * take USD from customers in the US and GBP from customers in the UK, and the
 * payment is then created IN THEIR currency (Stripe, cross-border bank
 * transfers). So the euro ask has to be converted before the session is made.
 *
 * TWO COSTS ON TOP, both Stripe's and both real (Nico, 19 Sep 2026: "if we
 * have a conversion fee or something we need to add it on top"):
 *   · the cross-border bank transfer fee, and
 *   · currency conversion back to euros on the way into our balance.
 * They are charged as one line the guest sees before they press, the same way
 * the card fee is, and it may be charged here for the same reason: §270a BGB
 * covers SEPA transfers and EEA consumer cards, neither of which this is, so
 * §312a Abs. 4 BGB applies instead. A free way to pay stays beside it (the
 * IBAN on their invoice), and the fee must not exceed what it costs us.
 *
 * The rate is the ECB reference rate, the same one every German invoice uses,
 * fetched from the ECB's own daily feed through frankfurter.app and cached for
 * the day. NO fallback rate: a stale number here would quietly mis-bill, so a
 * failed fetch means the transfer is not offered and the card stands.
 */

export type ForeignCurrency = "usd" | "gbp";

/** Stripe's cross-border transfer fee plus its conversion spread, as one rate.
 *  Reviewed against the first real payments: the dashboard shows both lines. */
export const CROSS_BORDER_FEE_PCT = 0.02;

type Cached = { rate: number; at: number };
const cache = new Map<ForeignCurrency, Cached>();
const DAY = 24 * 3600 * 1000;

/** EUR → currency, ECB reference rate, cached for a day. Null when unavailable. */
export async function ecbRate(currency: ForeignCurrency, now = Date.now()): Promise<number | null> {
  const hit = cache.get(currency);
  if (hit && now - hit.at < DAY) return hit.rate;
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=EUR&to=${currency.toUpperCase()}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return hit?.rate ?? null;
    const j = (await r.json()) as { rates?: Record<string, number> };
    const rate = j.rates?.[currency.toUpperCase()];
    if (!rate || !(rate > 0)) return hit?.rate ?? null;
    cache.set(currency, { rate, at: now });
    return rate;
  } catch {
    // A rate from earlier today is better than no payment at all; nothing
    // older, and nothing invented.
    return hit && now - hit.at < DAY ? hit.rate : null;
  }
}

export type ForeignAsk = {
  currency: ForeignCurrency;
  /** What the trip is owed, in euros. Unchanged by any of this. */
  eur: number;
  /** The euro ask converted at today's rate, in the guest's currency. */
  base: number;
  /** The cross-border and conversion cost, in the guest's currency. */
  fee: number;
  /** base + fee, what the guest transfers. */
  total: number;
  rate: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The arithmetic on its own, so it can be checked without the network. */
export function priceForeign(eur: number, currency: ForeignCurrency, rate: number): ForeignAsk {
  const base = r2(eur * rate);
  const fee = r2(base * CROSS_BORDER_FEE_PCT);
  return { currency, eur: r2(eur), base, fee, total: r2(base + fee), rate };
}

/** The euro ask as an amount a US or UK guest can transfer, fee included. */
export async function foreignAsk(eur: number, currency: ForeignCurrency): Promise<ForeignAsk | null> {
  const rate = await ecbRate(currency);
  return rate ? priceForeign(eur, currency, rate) : null;
}
