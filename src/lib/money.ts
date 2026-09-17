/**
 * One way to write an amount, everywhere.
 *
 * `n.toLocaleString()` pads nothing, so €1,705.50 rendered as "€1.705,5" — a
 * single decimal that reads like a typo on an invoice line. Whole amounts keep
 * their clean look (€2.990), amounts with cents get both digits (€1.705,50).
 * Never three: a rounding artefact must not reach a money column.
 */
export function formatAmount(n: number, locale = "de-DE"): string {
  const cents = Math.abs(n % 1) > 0.0001;
  return n.toLocaleString(locale, {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/** Amount with its symbol — null in, null out, so callers can render a dash. */
export function formatMoney(n: number | null | undefined, currency?: string | null, locale = "de-DE"): string | null {
  if (n == null) return null;
  const symbol = currency === "EUR" || !currency ? "€" : `${currency} `;
  return `${symbol}${formatAmount(n, locale)}`;
}

/**
 * An amount somebody is asked to PAY, always with both cents.
 *
 * The portal had seven separate formatters, each written with
 * `maximumFractionDigits: 0`, so every amount on the payment screens was
 * ROUNDED. Christian Røsjorde owes 5,864.23 and his page said 5,864; Julius
 * Stelzer 5,077.70 said 5,078. Four bookings are priced in cents and 25
 * payments carry them, and the transfer reference has to match the invoice to
 * the cent, so a rounded figure on the Pay button is not a display choice, it
 * is the wrong number.
 *
 * Always two digits here, unlike formatMoney: this sits beside an invoice,
 * which always prints them.
 */
export function formatMoneyExact(n: number | null | undefined, currency?: string | null, locale = "en-GB"): string | null {
  if (n == null) return null;
  const symbol = currency === "EUR" || !currency ? "€" : `${currency} `;
  return `${symbol}${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
