/**
 * The three figures on a final invoice, and the one line of arithmetic that
 * ties them together:
 *
 *   trip − earlier invoices            = this invoice
 *   this invoice − payments applied     = balance due
 *
 * Money settles earlier invoices first (the same rule the engine uses to size
 * the invoice), so a paid down-payment invoice is deducted once as "already
 * invoiced", never a second time as a payment. Whatever received money those
 * earlier invoices do not absorb is what THIS invoice has already been paid
 * against.
 *
 * Daniel Rainham's NP7-XP-2026-0052 is why this is a function: the paper
 * printed the trip, "Less: payments received −3,010.80", then a balance equal
 * to the trip, because the deduction and the balance came from two different
 * definitions.
 */
export type FinalFigures = {
  /** What earlier tax invoices on the booking already stand for. */
  priorInvoiced: number;
  /** Received money beyond those earlier invoices, i.e. paid against this one. */
  receivedApplied: number;
  /** What this invoice bills. */
  invoiceAmount: number;
  /** What is still to pay on this invoice. */
  balance: number;
};

export function finalInvoiceFigures(input: {
  agreedPrice: number;
  received?: number | null;
  priorInvoiced?: number | null;
  /** The figure the document was issued with, when the engine decided one. */
  amountDue?: number | null;
}): FinalFigures {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const received = input.received ?? 0;
  const priorInvoiced = Math.max(0, input.priorInvoiced ?? 0);
  const receivedApplied = r2(Math.max(0, received - priorInvoiced));
  const invoiceAmount = r2(input.amountDue ?? Math.max(0, input.agreedPrice - priorInvoiced));
  const balance = r2(Math.max(0, invoiceAmount - receivedApplied));
  return { priorInvoiced: r2(priorInvoiced), receivedApplied, invoiceAmount, balance };
}
