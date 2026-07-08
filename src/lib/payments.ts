/**
 * Registration Phase 2 — the deposit → downpayment → final payment plan.
 *
 * Pure computation (no I/O) so the member view, the admin controls and the
 * invoice engine all derive the same numbers from one place.
 *
 * The model (configurable per package):
 *   1. Deposit       — a fixed amount that SECURES the spot. Refundable for
 *                      `deposit_refund_days` (default 14) after it's paid.
 *   2. Downpayment   — brings the total paid up to `downpayment_percent`
 *                      (default 50%) of the trip total (incl. confirmed add-ons),
 *                      i.e. amount = 50% of total − deposit. ALWAYS due
 *                      `deposit_refund_days` (default 14) after SIGN-UP — the
 *                      rider's window to book flights before money is committed.
 *   3. Final balance — the remainder. ALWAYS due `final_days_before` (default 90)
 *                      days before the trip starts (or right away if sooner).
 *
 * Everything is a "due-by" deadline — the member can always pay sooner.
 */

export type MilestoneKind = "deposit" | "downpayment" | "final";
export type MilestoneStatus = "paid" | "due" | "upcoming";

export type PackagePaymentConfig = {
  deposit?: number | null;
  deposit_refund_days?: number | null;
  downpayment_percent?: number | null;
  final_days_before?: number | null;
};

export type BookingPaymentState = {
  /** Trip total incl. confirmed add-ons (the booking's agreed_price + extras). */
  total: number;
  /** Sum of payments actually received. When given, it drives milestone status
   *  (a milestone is paid once cumulative payments reach its threshold) — so the
   *  member view works without the explicit flags / before migration 032. */
  paidAmount?: number | null;
  /** ISO date (yyyy-mm-dd) the edition starts, if known. */
  editionStart?: string | null;
  /** ISO date the booking/registration was made. With NO deposit (deposit = 0)
   *  this anchors the downpayment deadline: registration is free, and the
   *  downpayment falls due `deposit_refund_days` later — the window the rider
   *  gets to sort flights before any money is committed. */
  bookedAt?: string | null;
  depositReceivedAt?: string | null;
  /** Explicit milestone flags — used as the status driver when paidAmount is absent. */
  depositReceived?: boolean | null;
  downpaymentReceived?: boolean | null;
  finalPaymentReceived?: boolean | null;
};

export type Milestone = {
  kind: MilestoneKind;
  label: string;
  /** Amount due AT this milestone. */
  amount: number;
  /** Cumulative amount that should have been paid by the end of this milestone. */
  cumulative: number;
  /** ISO due date, or null when it's the "pay to secure" deposit. */
  dueDate: string | null;
  /** Human deadline ("Pay to secure your spot", "by 12 May 2026", "Due now"). */
  dueLabel: string;
  status: MilestoneStatus;
  /** For the deposit: ISO date until which it's still refundable. */
  refundableUntil?: string | null;
};

export const PAYMENT_DEFAULTS = {
  deposit: 300,
  depositRefundDays: 14,
  downpaymentPercent: 50,
  finalDaysBefore: 90,
};

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Add (or subtract) whole days to an ISO yyyy-mm-dd or full ISO timestamp. Returns yyyy-mm-dd. */
export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function fmtDue(dueDate: string): string {
  if (dueDate <= todayISO()) return "Due now";
  const d = new Date(dueDate + "T00:00:00Z");
  return `Due by ${d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`;
}

/**
 * Build the deposit → downpayment → final plan for a booking. Any zero-amount
 * milestone is dropped — so a package with deposit = 0 collapses to a clean
 * 2-stage plan (downpayment → final) with no empty "€0 deposit" step.
 */
export function computePaymentPlan(cfg: PackagePaymentConfig, state: BookingPaymentState): Milestone[] {
  const total = round(Math.max(0, state.total || 0));
  const depositCfg = round(cfg.deposit ?? PAYMENT_DEFAULTS.deposit);
  const dpPct = cfg.downpayment_percent ?? PAYMENT_DEFAULTS.downpaymentPercent;
  const refundDays = cfg.deposit_refund_days ?? PAYMENT_DEFAULTS.depositRefundDays;
  const finalDaysBefore = cfg.final_days_before ?? PAYMENT_DEFAULTS.finalDaysBefore;

  const depositAmt = round(Math.min(depositCfg, total || depositCfg));
  const downpaymentTarget = round(total * (dpPct / 100));
  const downpaymentAmt = round(Math.max(0, downpaymentTarget - depositAmt));
  const finalAmt = round(Math.max(0, total - depositAmt - downpaymentAmt));

  const refundableUntil = state.depositReceivedAt ? addDays(state.depositReceivedAt, refundDays) : null;
  // Downpayment deadline: ALWAYS `refundDays` after SIGN-UP (deposit or not) —
  // the rider's window to book flights before the first real payment is due.
  // Deposit-payment date only as a fallback for legacy rows missing bookedAt.
  const downpaymentAnchor = state.bookedAt ?? state.depositReceivedAt ?? null;
  const downpaymentDue = downpaymentAnchor ? addDays(downpaymentAnchor, refundDays) : null;
  const finalDue = state.editionStart ? addDays(state.editionStart, -finalDaysBefore) : null;

  // Prefer the actual paid amount (cumulative thresholds); fall back to flags.
  const byAmount = typeof state.paidAmount === "number";
  const paidAmt = state.paidAmount ?? 0;
  const depositPaid = byAmount ? paidAmt + 0.01 >= depositAmt : !!state.depositReceived;
  const downPaid = byAmount ? paidAmt + 0.01 >= downpaymentTarget : !!state.downpaymentReceived;
  const finalPaid = byAmount ? paidAmt + 0.01 >= total && total > 0 : !!state.finalPaymentReceived;

  const all: Milestone[] = [
    {
      kind: "deposit",
      label: "Deposit — secures your spot",
      amount: depositAmt,
      cumulative: depositAmt,
      dueDate: null,
      dueLabel: "Pay to secure your spot",
      status: depositPaid ? "paid" : "due",
      refundableUntil,
    },
    {
      kind: "downpayment",
      label: `Downpayment — ${dpPct}% of your trip`,
      amount: downpaymentAmt,
      cumulative: downpaymentTarget,
      dueDate: downpaymentDue,
      // Concrete date once the deposit is paid (deposit + refund window);
      // before that it's anchored to whenever the deposit lands. With no deposit
      // (deposit = 0) the downpayment IS the securing payment, so don't reference
      // a deposit that doesn't exist.
      dueLabel: downpaymentDue
        ? fmtDue(downpaymentDue)
        : depositAmt > 0
          ? `Due within ${refundDays} days of signing up`
          : `Due within ${refundDays} days of registering — secures your spot`,
      status: downPaid ? "paid" : depositPaid ? "due" : "upcoming",
    },
    {
      kind: "final",
      label: "Final balance",
      amount: finalAmt,
      cumulative: total,
      dueDate: finalDue,
      // The final balance has a real deadline: finalDaysBefore days before the trip.
      dueLabel: finalDue ? fmtDue(finalDue) : "After your downpayment",
      status: finalPaid ? "paid" : downPaid ? "due" : "upcoming",
    },
  ];

  // Drop any zero-amount milestone — so a package with deposit = 0 collapses to
  // a clean 2-stage plan (downpayment → final) with no empty "€0 deposit" step.
  return all.filter((m) => m.amount > 0);
}

/** Amount already paid, derived from which milestones are marked received. */
export function amountPaid(cfg: PackagePaymentConfig, state: BookingPaymentState): number {
  const plan = computePaymentPlan(cfg, state);
  return round(plan.filter((m) => m.status === "paid").reduce((s, m) => s + m.amount, 0));
}

/** Outstanding balance. */
export function balanceDue(cfg: PackagePaymentConfig, state: BookingPaymentState): number {
  return round(Math.max(0, (state.total || 0) - amountPaid(cfg, state)));
}

/** The single invoice amount for a given milestone (used by the invoice engine). */
export function milestoneAmount(kind: MilestoneKind, cfg: PackagePaymentConfig, state: BookingPaymentState): number {
  const m = computePaymentPlan(cfg, state).find((x) => x.kind === kind);
  return m ? m.amount : 0;
}
