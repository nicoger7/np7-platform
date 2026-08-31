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
