/**
 * Custom-price display logic — how a booking's actual price compares to its
 * "list" price (the package price + any confirmed add-ons).
 *
 * Shared by the member booking view and the admin booking detail so both show
 * the same thing:
 *   • agreed below list  → a discount ("X% off")
 *   • agreed equals list → nothing special (the plain total)
 *   • agreed above list  → "price as discussed" (a negotiated/unmodelled extra —
 *                          we can't explain the surplus, so we don't pretend to)
 *
 * The comparison base is ALWAYS package price + confirmed add-ons. So once
 * add-ons exist, the "default" a customer would normally pay already includes
 * them: an agreed price still above package+add-ons is "as discussed", and one
 * below is a real discount off that all-in figure.
 */

export type PriceLabel =
  | { kind: "plain"; total: number }
  | { kind: "match"; total: number; list: number }
  | { kind: "discount"; total: number; list: number; percentOff: number }
  | { kind: "as_discussed"; total: number; list: number };

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function describePrice(opts: {
  /** The negotiated total for the package portion (exp_bookings.agreed_price). */
  agreedPrice: number | null;
  /** The package's list price (exp_packages.price). */
  packagePrice: number | null;
  /** Sum of confirmed add-ons, billed on top. */
  addonsTotal?: number;
}): PriceLabel {
  const addons = round(Math.max(0, opts.addonsTotal ?? 0));
  const total = round((opts.agreedPrice ?? 0) + addons);

  // No package price to compare against → just the plain figure, no judgement.
  if (opts.packagePrice == null || opts.packagePrice <= 0) {
    return { kind: "plain", total };
  }

  const list = round(opts.packagePrice + addons);
  const diff = round(total - list);
  const tol = 0.5; // treat sub-euro rounding as an exact match

  if (Math.abs(diff) <= tol) return { kind: "match", total, list };
  if (diff < 0) {
    const percentOff = Math.round(((list - total) / list) * 100);
    return { kind: "discount", total, list, percentOff };
  }
  return { kind: "as_discussed", total, list };
}
