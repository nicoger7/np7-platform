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
 */
export function defaultCancellationPolicy(hasDeposit: boolean): string {
  return hasDeposit
    ? "You can cancel any time before the trip. Your deposit is refundable for 14 days after you pay it; after that it's kept as the cancellation fee. Once you've paid the 50% downpayment or the full balance, that amount becomes the fee — with a goodwill credit voucher toward a future trip. Use ‘Cancel this trip’ above to start, or see our Terms for the full scale."
    : "You can cancel any time before the trip. Your 50% downpayment is refundable for 14 days after you pay it; after that it's kept as the cancellation fee. Once you've paid the full balance, that becomes the fee instead — with a goodwill credit voucher toward a future trip. Use ‘Cancel this trip’ above to start, or see our Terms for the full scale.";
}
