/**
 * The standard cancellation terms.
 *
 * Every trip is covered by the same EU package-travel terms — they live in the
 * Terms document and in the trip files a guest gets. An experience only needs
 * its own `cancellation_policy` text when it genuinely differs (a charter, a
 * non-refundable flight block). So this is the default, not a blank to fill in:
 * a trip with an empty field is not a trip with no terms.
 *
 * Deposit-aware, because most trips have none — the 50% down-payment is the
 * first, 14-day-refundable payment, and calling that a "deposit" confuses the
 * two.
 *
 * Two statutory rights are named here on purpose. §651e (pass your place to
 * someone else) and §651h(3) (extraordinary circumstances at the destination —
 * free cancellation, full refund) both apply whether or not we mention them,
 * and both are cheaper for the guest than the fee scale. A summary that lists
 * only the ways you lose money, while staying silent on the two ways you don't,
 * is accurate and still misleading.
 *
 * The goodwill voucher is deliberately worded as a maybe. It is a gesture the
 * team decides case by case and it is usually small — promising it in the
 * policy turns a kindness into an expectation, and then into a complaint.
 */
export function defaultCancellationPolicy(hasDeposit: boolean): string {
  const first = hasDeposit
    ? "Your deposit is refundable for 14 days after you pay it; after that it's kept as the cancellation fee and nothing further is owed. Once you've paid the 50% down-payment or the full balance, that amount becomes the fee instead."
    : "Your 50% down-payment is refundable for 14 days after you pay it; after that it's kept as the cancellation fee. Once you've paid the full balance, that becomes the fee instead.";

  return [
    `You can cancel any time before the trip, no reason needed. ${first}`,
    "Two things worth knowing before you cancel. You can pass your place to someone else instead — usually cheaper for you than cancelling. And if something extraordinary at the destination makes the trip impossible or unsafe (war, epidemic, natural disaster), you can cancel free of charge and get everything back.",
    "Where a cancellation does fall in a non-refundable band we'll sometimes offer a small goodwill voucher toward a future trip — a gesture on our side, not something to count on.",
    "To start, use ‘Cancel this trip’ at the bottom of the Payment tab. The full scale is in our Terms.",
  ].join("\n\n");
}
