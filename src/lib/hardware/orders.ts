// Shared D2C order model (blueprint §3.2): three orthogonal statuses, money in
// integer cents, derived payment/fulfillment states. Pure helpers only — DB
// writers live in orders-server.ts.

export const ORDER_STATUSES = ["pending", "completed", "canceled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "awaiting", "authorized", "paid", "partially_refunded", "refunded", "canceled", "failed",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const FULFILLMENT_STATUSES = [
  "unfulfilled", "partially_fulfilled", "fulfilled", "partially_shipped", "shipped",
  "partially_delivered", "delivered", "partially_returned", "returned",
] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export const TX_PROVIDERS = ["stripe", "bank_transfer", "gift_card", "manual"] as const;

/** cents → "€1,234.56" (orders store integer cents; the € UI formats late). */
export function fmtCents(cents: number | null | undefined, currency = "EUR"): string {
  if (cents == null) return "—";
  const symbol = currency === "EUR" ? "€" : `${currency} `;
  return `${symbol}${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "123.45" (euros, user input) → 12345 cents. */
export function toCents(euros: string | number): number {
  return Math.round(Number(euros) * 100);
}

/** Gross-first line math (PAngV: B2C prices are VAT-inclusive). */
export function computeLine(qty: number, unitGrossCents: number, taxRatePct: number) {
  const totalGross = qty * unitGrossCents;
  const totalNet = Math.round(totalGross / (1 + taxRatePct / 100));
  const unitNet = Math.round(unitGrossCents / (1 + taxRatePct / 100));
  return { totalGross, totalNet, taxAmount: totalGross - totalNet, unitNet };
}

export type OrderLineQty = {
  quantity: number;
  quantity_fulfilled: number;
  quantity_shipped: number;
  quantity_delivered: number;
  quantity_returned: number;
  requires_shipping: boolean;
};

/** Fulfillment status is DERIVED from line quantities, never set by hand. */
export function deriveFulfillmentStatus(lines: OrderLineQty[]): FulfillmentStatus {
  const ship = lines.filter((l) => l.requires_shipping);
  if (!ship.length) return "fulfilled";
  const total = ship.reduce((a, l) => a + l.quantity, 0);
  const sum = (k: keyof OrderLineQty) => ship.reduce((a, l) => a + (l[k] as number), 0);
  const returned = sum("quantity_returned");
  const delivered = sum("quantity_delivered");
  const shipped = sum("quantity_shipped");
  const fulfilled = sum("quantity_fulfilled");
  if (returned >= total) return "returned";
  if (returned > 0) return "partially_returned";
  if (delivered >= total) return "delivered";
  if (delivered > 0) return "partially_delivered";
  if (shipped >= total) return "shipped";
  if (shipped > 0) return "partially_shipped";
  if (fulfilled >= total) return "fulfilled";
  if (fulfilled > 0) return "partially_fulfilled";
  return "unfulfilled";
}

/** Payment status derived from the signed transactions ledger vs the total. */
export function derivePaymentStatus(
  transactions: { type: string; amount: number }[],
  grandTotal: number,
  current: PaymentStatus,
): PaymentStatus {
  if (current === "canceled" || current === "failed") return current;
  const captured = transactions.filter((t) => t.type === "capture").reduce((a, t) => a + t.amount, 0);
  const refunded = -transactions.filter((t) => t.type === "refund").reduce((a, t) => a + t.amount, 0);
  const hasAuth = transactions.some((t) => t.type === "authorization");
  if (captured <= 0) return hasAuth ? "authorized" : "awaiting";
  if (refunded <= 0) return captured >= grandTotal ? "paid" : "awaiting";
  return refunded >= captured ? "refunded" : "partially_refunded";
}

/** EU membership drives tax treatment: DE domestic, EU destination-VAT (OSS), else export. */
export const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HU",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
]);
