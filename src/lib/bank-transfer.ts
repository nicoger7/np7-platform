/**
 * Paying by bank transfer: the parameters, the amount, and the two clocks.
 *
 * Pure on purpose. No database, no Stripe import, no fetch — so the contract
 * this file encodes can be asserted in a unit test with no network, which is
 * the only way it can be checked at all from a machine that cannot reach the
 * Stripe API. Everything that needs a connection lives in stripe.ts, the pay
 * route and the webhook; everything that needs judgement lives here.
 *
 * ── THE TWO CLOCKS, WHICH ARE THE WHOLE PROBLEM ──────────────────────────────
 *
 * A Checkout Session lives 30 minutes to 24 hours, Stripe's hard limits. The
 * payment lives for days: one to three working days is normal and slower
 * happens. exp_payment_links.expires_at was carrying both meanings, and the pay
 * route's "still live" test was `status = 'open' AND expires_at > now()`. On
 * day two an in-flight transfer simply fell out of that filter, and the guest
 * could open a second one for the same money while the first was still moving.
 *
 * So the clocks are split. `expires_at` narrows to one meaning, when the
 * CHECKOUT URL dies, and the payment's own life is carried by the status:
 * `awaiting` from the moment Stripe issues the IBAN. On day two the row is not
 * open, so no expiry applies to it and nothing sweeps it.
 */

/** How long a transfer's checkout URL stays openable. Stripe's cap is 24h; 23
 *  keeps a clock-skew rejection off the boundary and still lets an evening mail
 *  be opened the next morning. Rails and cards keep their 30 minutes. */
export const TRANSFER_SESSION_HOURS = 23;

/** How long we wait for money that was never sent before letting the guest
 *  start again. Ours, not Stripe's, and a guess: nothing arriving in two weeks
 *  reads as abandonment rather than a slow bank. Exported rather than buried in
 *  a route because it is exactly the kind of number Nico may want to move. */
export const TRANSFER_DUE_DAYS = 14;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── The parameters ───────────────────────────────────────────────────────────

/**
 * The four keys that turn a Checkout Session into a bank transfer, verified
 * against Stripe's docs on 2026-09-14.
 *
 * `customer` is not optional and not a convenience: bank transfer is NOT
 * available on a session created with only customer_email, because the IBAN is
 * issued against a Customer's cash balance and there is no balance without a
 * Customer. It is the single constraint that fails the whole session rather
 * than degrading, which is why the caller must refuse the transfer outright
 * when it has no Customer id to pass.
 *
 * `country` picks which localised IBAN the guest is shown, DE / FR / IE / NL.
 * See transferCountryFor in payment-methods.ts for why everybody else gets DE.
 */
export function bankTransferParams(opts: { customer: string; country: "DE" | "FR" | "IE" | "NL" }): Record<string, string> {
  return {
    customer: opts.customer,
    "payment_method_types[0]": "customer_balance",
    "payment_method_options[customer_balance][funding_type]": "bank_transfer",
    "payment_method_options[customer_balance][bank_transfer][type]": "eu_bank_transfer",
    "payment_method_options[customer_balance][bank_transfer][eu_bank_transfer][country]": opts.country,
  };
}

// ── The amount ───────────────────────────────────────────────────────────────

/**
 * What actually arrived, less the fee, in euros. The one place this is derived.
 *
 * Never the link's own amount. That is a REQUEST, and Stripe cannot control
 * what a guest types into their banking app: a short transfer part-funds the
 * payment and an over-transfer leaves the excess in their cash balance. Record
 * the request and a €1,400 transfer against a €1,440 ask would mark the booking
 * secured and the invoice settled with €40 missing and nobody looking.
 *
 * `sessionTotalCents` is the fallback for one case only, a PaymentIntent fetch
 * that failed. On a customer_balance PI that has succeeded the two are equal by
 * construction, because such a PI does not succeed until it is fully funded.
 */
export function recordedAmount(opts: {
  /** payment_intent.amount_received. Null when the fetch failed. */
  amountReceivedCents: number | null | undefined;
  /** checkout.session.amount_total, the fallback. */
  sessionTotalCents: number | null | undefined;
  /** What the guest was charged on top for the card. Always 0 on a transfer. */
  feeEur: number;
}): number {
  const cents = opts.amountReceivedCents != null && Number.isFinite(opts.amountReceivedCents)
    ? Number(opts.amountReceivedCents)
    : Number(opts.sessionTotalCents ?? 0);
  return r2(cents / 100 - (Number(opts.feeEur) || 0));
}

/**
 * A transfer may never carry a fee. §270a BGB bans a surcharge on a SEPA credit
 * transfer outright, with no premium-instrument carve-out to argue about, so
 * this is a flat answer and not a lookup. Asserted rather than assumed, because
 * a fee written by some future bug would silently under-record the trip's
 * share, which is the quietest way this can go wrong.
 */
export function feeForMethod(method: string | null | undefined, linkFee: number | null | undefined): number {
  return method === "transfer" ? 0 : Number(linkFee ?? 0) || 0;
}

// ── The lifecycle ────────────────────────────────────────────────────────────

/** The columns of exp_payment_links the lifecycle actually reasons about. */
export type LinkRow = {
  id: string;
  amount: number | string | null;
  status: string | null;
  created_by: string | null;
  expires_at: string | null;
  session_id?: string | null;
  method?: string | null;
  amount_received?: number | string | null;
  funds_due_by?: string | null;
  instructions_url?: string | null;
};

/** A link with money genuinely in the air: Stripe has issued the IBAN. */
export const isInFlight = (l: LinkRow) => l.status === "awaiting" || l.status === "part_funded";

const notExpired = (l: LinkRow, now: number) => !l.expires_at || new Date(l.expires_at).getTime() > now;

export type LinkClassification = {
  /** Safe to expire at Stripe and mark cancelled before starting a new attempt. */
  toCancel: LinkRow[];
  /**
   * € already claimed by something live, THE MEMBER'S OWN OPEN CHECKOUT
   * INCLUDED. This is the number almost every caller wants: it is what a second
   * request for the same money has to fit beside.
   */
  spokenFor: number;
  /**
   * € still claimed once `toCancel` has actually been cancelled, which only
   * the pay route does, in the same request, right before it asks for a new
   * payment. Anyone else reading this is under-counting by exactly the amount
   * the guest is in the middle of paying.
   */
  spokenForOnceReplaced: number;
  /** Rows the guest may still be transferring against, newest first. */
  inFlight: LinkRow[];
  /** Live links somebody at NP7 made and sent deliberately. Left alone, and
   *  named here only so the refusal can quote the right expiry date. */
  adminOpen: LinkRow[];
};

/**
 * Which live links stand in the way of a new payment, and which may be swept
 * aside to make room for one.
 *
 * The invariant the pay route has always enforced is: money in flight plus
 * money now being asked for never exceeds what is owed. It expressed that by
 * splitting live links two ways, the member's own (cancel and replace) and an
 * admin's (counted as spoken for). A transfer makes it a three-way split of the
 * same set, and the only thing that MOVES is the expiry test:
 *
 *   1. open + member + not expired  → cancelled and replaced, exactly as today.
 *      Safe because an un-submitted session has produced no IBAN, so there is
 *      nothing anybody could have sent money to.
 *   2. awaiting or part_funded, WHOEVER made it → never cancelled, never
 *      expired at Stripe. We cannot un-tell somebody's bank. It counts as
 *      spoken for, which is precisely how an admin's link already behaves, so
 *      the guard survives with no new arithmetic.
 *   3. open + admin → spoken for, as today.
 *
 * An expired open row is neither: the session is dead, nobody can pay it, and
 * cancelling it at Stripe would only be noise.
 *
 * ── TWO TOTALS, AND WHY THE INCLUSIVE ONE IS THE DEFAULT ─────────────────────
 *
 * Group 1 is "cancel and replace" only from inside the pay route, which really
 * does cancel it, in the same request, one line later. To every OTHER reader
 * that row is a guest halfway through paying: the checkout is open in front of
 * them and the money is on its way.
 *
 * The admin's double-pay guard read the narrow total and let a second request
 * for the same €1,440 through while the member's own checkout was live. So the
 * plain name carries the inclusive figure. A caller who grabs the wrong one
 * now over-counts, which refuses a link somebody can simply retry, rather than
 * under-counting, which bills a guest twice.
 */
export function classifyLinks(rows: LinkRow[] | null | undefined, now: number = Date.now()): LinkClassification {
  const all = rows ?? [];
  const inFlight = all.filter(isInFlight);
  const openLive = all.filter((l) => l.status === "open" && notExpired(l, now));
  const toCancel = openLive.filter((l) => l.created_by === "member");
  const adminOpen = openLive.filter((l) => l.created_by !== "member");
  const sum = (rs: LinkRow[]) => r2(rs.reduce((n, l) => n + (Number(l.amount) || 0), 0));
  const onceReplaced = sum([...inFlight, ...adminOpen]);
  return {
    toCancel,
    adminOpen,
    spokenFor: r2(onceReplaced + sum(toCancel)),
    spokenForOnceReplaced: onceReplaced,
    inFlight: [...inFlight].sort((a, b) => String(b.expires_at ?? "").localeCompare(String(a.expires_at ?? ""))),
  };
}

/**
 * Awaiting rows nobody ever funded, past the date we stop waiting.
 *
 * There is no cron for payment links and this does not earn one: it needs
 * vercel.json, which is another workflow's file, and a scheduled function for a
 * job with no deadline is exactly what the Fluid CPU cap argues against. So the
 * pay route sweeps lazily, which runs at the only moment it matters — when the
 * guest is standing there wanting to pay again — and heals itself.
 *
 * A row with ANY money against it is never swept, part_funded included. Real
 * guest money arrived there and quietly expiring the row would hide it. And
 * sweeping never cancels the PaymentIntent, so a transfer that lands afterwards
 * is still recorded: status gates whether we OFFER a payment, never whether we
 * record one.
 */
export function sweepableLinks(rows: LinkRow[] | null | undefined, now: number = Date.now()): LinkRow[] {
  return (rows ?? []).filter((l) =>
    l.status === "awaiting" &&
    !(Number(l.amount_received) > 0) &&
    !!l.funds_due_by && new Date(l.funds_due_by).getTime() <= now);
}

/** funds_due_by from the moment the IBAN was issued. */
export function fundsDueBy(awaitingSince: Date, days: number = TRANSFER_DUE_DAYS): Date {
  return new Date(awaitingSince.getTime() + days * 86_400_000);
}
