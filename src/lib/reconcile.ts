/**
 * Payment ⇄ invoice reconciliation — pure logic shared by the admin booking
 * Payments tab, the global Payments page, and the cron/email nudges.
 *
 * The model: a booking has a total (agreed price + confirmed add-ons), a set of
 * invoices (rows in `documents`, one per milestone), and a set of payments (rows
 * in `exp_payments`). Each payment can be *allocated* to one invoice via
 * `document_id`. From those three we derive, with no guesswork:
 *   • per-invoice: invoiced / paid / remaining / state
 *   • per-booking: paid total, outstanding balance, what's due next
 *   • for an incoming payment: which open invoice it most likely settles
 */

export type ReconInvoice = {
  id: string;
  type: string | null;            // deposit_invoice | downpayment_invoice | final_invoice | …
  invoice_number: string | null;  // also the transfer reference the customer should use
  amount: number | null;
  currency: string | null;
  status: string | null;          // issued | void
  sent_at: string | null;
  due_date: string | null;
  issued_at: string | null;
};

export type ReconPayment = {
  id: string;
  amount: number | null;
  type: string | null;            // deposit | downpayment | final | partial | refund
  direction: string | null;       // revenue | cost
  status: string | null;          // pending | paid | overdue | cancelled
  reference: string | null;
  method: string | null;
  received_at: string | null;
  document_id: string | null;
};

export type InvoiceState = "void" | "open" | "partial" | "paid" | "overpaid";

export type InvoiceRecon = {
  invoice: ReconInvoice;
  invoiced: number;
  paid: number;
  remaining: number;
  state: InvoiceState;
  /** Invoice has been emailed to the customer. */
  sent: boolean;
};

export type BookingRecon = {
  total: number;
  invoicedTotal: number;
  /** Money actually received (revenue minus refunds; cost rows excluded). */
  paidTotal: number;
  /** Paid money that's been tied to a specific invoice. */
  allocatedTotal: number;
  /** Received money not yet tied to any invoice. */
  unallocatedTotal: number;
  /** Outstanding against the booking total. */
  balance: number;
  invoices: InvoiceRecon[];
  /** The next invoice still owing (earliest due, then by issue order). */
  nextDue: InvoiceRecon | null;
  fullyPaid: boolean;
};

export const round2 = (n: number) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100;

/** Signed contribution of a payment to "money received": refunds subtract, cost
 *  rows don't count, cancelled rows don't count. Add-on payments are money for
 *  an EXTRA service on top of the trip price, so they don't count toward the
 *  trip total/balance either (they're tracked as their own line). */
export function paymentInflow(p: Pick<ReconPayment, "amount" | "type" | "direction" | "status">): number {
  if (p.direction === "cost") return 0;
  if (p.status === "cancelled") return 0;
  if (p.type === "addon") return 0;
  const sign = p.type === "refund" ? -1 : 1;
  return sign * (Number(p.amount) || 0);
}

function invoiceStateOf(invoice: ReconInvoice, invoiced: number, paid: number): InvoiceState {
  if (invoice.status === "void") return "void";
  if (paid <= 0.001) return "open";
  if (paid + 0.01 >= invoiced && invoiced > 0) return paid - invoiced > 0.01 ? "overpaid" : "paid";
  return "partial";
}

/** Reconcile a single invoice against the payments allocated to it. */
export function reconcileInvoice(invoice: ReconInvoice, payments: ReconPayment[]): InvoiceRecon {
  const invoiced = round2(Number(invoice.amount) || 0);
  const paid = round2(
    payments.filter((p) => p.document_id === invoice.id).reduce((s, p) => s + paymentInflow(p), 0)
  );
  const state = invoiceStateOf(invoice, invoiced, paid);
  return {
    invoice,
    invoiced,
    paid,
    remaining: round2(Math.max(0, invoiced - paid)),
    state,
    sent: !!invoice.sent_at,
  };
}

/** Full reconciliation for a booking. `total` = agreed price + confirmed add-ons. */
export function reconcileBooking(opts: {
  total: number;
  invoices: ReconInvoice[];
  payments: ReconPayment[];
}): BookingRecon {
  const total = round2(Math.max(0, opts.total || 0));
  const live = opts.invoices.filter((i) => i.status !== "void");
  const invoices = live.map((inv) => reconcileInvoice(inv, opts.payments));

  const paidTotal = round2(opts.payments.reduce((s, p) => s + paymentInflow(p), 0));
  const allocatedTotal = round2(
    opts.payments.filter((p) => p.document_id).reduce((s, p) => s + paymentInflow(p), 0)
  );
  const unallocatedTotal = round2(paidTotal - allocatedTotal);
  const invoicedTotal = round2(invoices.reduce((s, i) => s + i.invoiced, 0));
  const balance = round2(Math.max(0, total - paidTotal));

  const owing = invoices
    .filter((i) => i.remaining > 0.01)
    .sort((a, b) => {
      const da = a.invoice.due_date || a.invoice.issued_at || "";
      const db = b.invoice.due_date || b.invoice.issued_at || "";
      return da < db ? -1 : da > db ? 1 : 0;
    });

  return {
    total,
    invoicedTotal,
    paidTotal,
    allocatedTotal,
    unallocatedTotal,
    balance,
    invoices,
    nextDue: owing[0] ?? null,
    fullyPaid: total > 0 && balance <= 0.01,
  };
}

export type MatchSuggestion = {
  invoice: ReconInvoice;
  remaining: number;
  /** Higher = more confident. */
  score: number;
  /** Why we matched it, for the UI ("Reference NP7E-2026-0007", "Exact amount"). */
  reason: string;
};

const norm = (s: string | null | undefined) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Rank a booking's open invoices for an incoming payment. Reference is the
 * strongest signal (the invoice number the customer should quote), then an exact
 * amount on the remaining, then closeness. Returns best-first, only plausible ones.
 */
export function suggestInvoices(
  payment: { amount: number; reference?: string | null },
  openInvoices: InvoiceRecon[]
): MatchSuggestion[] {
  const amount = round2(payment.amount);
  const ref = norm(payment.reference);

  const out: MatchSuggestion[] = openInvoices
    .filter((i) => i.state !== "paid" && i.state !== "void" && i.remaining > 0.01)
    .map((i) => {
      const num = norm(i.invoice.invoice_number);
      let score = 0;
      const reasons: string[] = [];

      if (num && ref && (ref.includes(num) || num.includes(ref))) {
        score += 100;
        reasons.push(`Reference ${i.invoice.invoice_number}`);
      }
      if (Math.abs(i.remaining - amount) < 0.01) {
        score += 50;
        reasons.push("Exact amount");
      } else if (amount <= i.remaining + 0.01) {
        // A partial payment toward this invoice is plausible.
        score += 15;
        reasons.push("Covers part of this invoice");
      } else {
        // Payment exceeds what's left on this invoice — less likely on its own.
        score += 3;
      }
      // Prefer the earliest-issued open invoice as a gentle tie-breaker.
      reasons.push(`${i.invoice.type?.replace(/_/g, " ") || "invoice"}`);

      return { invoice: i.invoice, remaining: i.remaining, score, reason: reasons[0] };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return out;
}
