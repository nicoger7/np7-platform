/**
 * The standard cancellation terms, and the one-line version the funnel uses.
 *
 * WHICH PAYMENT IS REFUNDABLE (Nico, 21 Sep 2026, correcting this file):
 *
 *   · The DEPOSIT secures the spot and stays refundable for its window. Most
 *     trips do not charge one.
 *   · The DOWN-PAYMENT is the next step, or the first one when there is no
 *     deposit. It is NOT refundable. From the moment it is paid it is the
 *     cancellation fee.
 *
 * This file used to say the opposite on a trip with no deposit: "your 50%
 * down-payment is refundable for 14 days". That is a refund promise we do not
 * give, printed on the trip page of every guest who has one, and the same
 * sentence had spread through the booking funnel. Where a guest was actually
 * told it before booking it stands for them; what this fixes is everything
 * said from here on.
 *
 * NOTHING IS HARDCODED. The window and the percentage are the package's own
 * `deposit_refund_days` and `downpayment_percent` — a trip that asks 30% over
 * 21 days must not be read a sentence about 50% over 14. That is why these are
 * functions over the real terms rather than strings.
 *
 * Every trip is covered by the same EU package-travel terms; they live in the
 * Terms document and in the trip files a guest gets. An experience only needs
 * its own `cancellation_policy` text when it genuinely differs (a charter, a
 * non-refundable flight block). So this is the default, not a blank to fill in:
 * a trip with an empty field is not a trip with no terms.
 *
 * Two statutory rights are named on purpose. §651e (pass your place to someone
 * else) and §651h(3) (extraordinary circumstances at the destination: free
 * cancellation, full refund) both apply whether or not we mention them, and
 * both are cheaper for the guest than the fee scale. A summary that lists only
 * the ways you lose money, while staying silent on the two ways you don't, is
 * accurate and still misleading.
 *
 * The goodwill voucher is deliberately worded as a maybe. It is a gesture the
 * team decides case by case and it is usually small: promising it in the policy
 * turns a kindness into an expectation, and then into a complaint.
 */

export type CancelTerms = {
  /** This trip actually charges a deposit (exp_packages.deposit > 0). */
  hasDeposit: boolean;
  /** exp_packages.deposit_refund_days: the deposit's refund window, and the
   *  number of days a free signup has before the down-payment falls due. */
  refundDays: number;
  /** exp_packages.downpayment_percent. */
  downpaymentPct: number;
};

export function defaultCancellationPolicy(terms: CancelTerms): string {
  const { hasDeposit, refundDays, downpaymentPct: pct } = terms;

  const first = hasDeposit
    ? `Your deposit secures your spot and stays refundable for ${refundDays} days after you pay it; after that it is kept as the cancellation fee and nothing further is owed. The ${pct}% down-payment that follows is not refundable: once it is paid, that amount is the fee instead, and once you have paid the full balance, that is.`
    : `There is no deposit on this trip, so the ${pct}% down-payment is what secures your spot, and it is not refundable: from the moment it is paid it is kept as the cancellation fee. Once you have paid the full balance, that becomes the fee instead. Until you pay, cancelling costs you nothing.`;

  return [
    `You can cancel any time before the trip, no reason needed. ${first}`,
    "Two things worth knowing before you cancel. You can pass your place to someone else instead. That is usually cheaper for you than cancelling. And if unavoidable, extraordinary circumstances at or near the destination seriously affect the trip or getting there (war, epidemic, natural disaster), you can cancel free of charge and get everything back.",
    "Where a cancellation does fall in a non-refundable band we'll sometimes offer a small goodwill voucher toward a future trip. That is a gesture on our side, not something to count on.",
    "To start, use ‘Cancel this trip’ at the bottom of the Payment tab. The full scale is in our Terms.",
  ].join("\n\n");
}

/**
 * The short reassurance under a "secure your spot" button.
 *
 * With no deposit the honest promise is not that the money comes back, it is
 * that no money has to go yet: signing up is free, the down-payment has its own
 * window, and until it is paid cancelling costs nothing. That is the same
 * low-friction message the old "fully refundable down-payment" line carried,
 * without the part that was untrue.
 */
export function securingLine(terms: CancelTerms): string {
  const { hasDeposit, refundDays, downpaymentPct: pct } = terms;
  return hasDeposit
    ? `Secure your spot with the refundable deposit · ${refundDays} days to change your mind.`
    : `No payment now · ${refundDays} days to pay the ${pct}% down-payment · free to cancel until you do.`;
}
