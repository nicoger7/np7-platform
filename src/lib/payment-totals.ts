/**
 * One definition of "received", used everywhere money is totalled.
 *
 * A payment row carries a status: paid / pending / cancelled. Most of the app
 * summed every row regardless, so a payment that was only *planned* — or one
 * that had been cancelled — counted as cash in the bank. Across the book that is
 * €38,810 pending and €33,086 cancelled being reported as received: roughly €72k
 * of money that isn't there, and the reason a €5,350 trip could show €10,700
 * received.
 *
 * (Separate from payments.ts, which computes the deposit → downpayment → final
 * PLAN. This file is about what has actually landed.)
 *
 * Refunds (type 'refund') subtract. Cost rows are the other direction entirely
 * and never belong in customer revenue.
 */

export type PaymentLike = {
  amount: number | string | null;
  direction?: string | null;
  type?: string | null;
  status?: string | null;
};

const signed = (p: PaymentLike) => (p.type === "refund" ? -1 : 1) * (Number(p.amount) || 0);

/** Customer money, not a supplier cost. */
export function isRevenue(p: PaymentLike): boolean {
  return p.direction !== "cost";
}

/** In the bank. Only 'paid' counts — this is the whole point of the file. */
export function isReceived(p: PaymentLike): boolean {
  return isRevenue(p) && p.status === "paid";
}

/** Promised but not arrived. Shown separately so it informs without inflating. */
export function isExpected(p: PaymentLike): boolean {
  return isRevenue(p) && p.status === "pending";
}

/** Σ of money actually received. */
export function sumReceived(rows: PaymentLike[] | null | undefined): number {
  return round2((rows ?? []).filter(isReceived).reduce((s, p) => s + signed(p), 0));
}

/** Σ of money still expected (pending rows). Never added to `received`. */
export function sumExpected(rows: PaymentLike[] | null | undefined): number {
  return round2((rows ?? []).filter(isExpected).reduce((s, p) => s + signed(p), 0));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * How far a booking is paid, from the ledger — not from the hand-ticked
 * `downpayment_received` / `final_payment_received` flags, which nobody kept in
 * sync after the Notion import (a booking could read "Fully paid", show a
 * half-paid tick and have no payments at all, all at once).
 *
 * `none` when nothing is in; `part` for anything short of the price; `full` once
 * the price is met. A booking with no price yet can only be `none` or `part` —
 * we cannot claim it is fully paid when we don't know the total.
 */
export function paidState(received: number, agreedTotal: number | null | undefined): "none" | "part" | "full" {
  if (received <= 0) return "none";
  const total = Number(agreedTotal) || 0;
  if (total > 0 && received + 0.01 >= total) return "full";
  return "part";
}
