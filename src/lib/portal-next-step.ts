/**
 * The one money question the portal keeps asking: what does this rider have to
 * pay next, how much, and by when?
 *
 * The trip page answered it inline, in its hero, from computePaymentPlan. The
 * home page did not answer it at all: Cameron's Bonaire balance was two weeks
 * past its date and his home read "Spot secured · Flights added". One
 * derivation, read by both, so the home can never be calmer than the trip page.
 *
 * Pure. The rows a booking row does not carry (package config, settled stage
 * invoices, covered guests) come from getBookingPaymentInputs in portal-data,
 * which loads them for a whole list of bookings at once.
 */
import { computePaymentPlan, amountDueNow, daysBetween, type Milestone, type PackagePaymentConfig } from "@/lib/payments";
import { isAttending } from "@/lib/types";

export type PaymentStep =
  /** Nothing owed: paid up, no price yet, or somebody else's plan carries it. */
  | { kind: "none" }
  /** A clinic ticket not paid at all. Bought outright, so there is no plan. */
  | { kind: "pending"; amount: number }
  /** The first securing payment: the deposit, or the down-payment where there is none. */
  | { kind: "secure"; amount: number; dueDate: string | null }
  /** The spot is held, the remainder is owed. */
  | { kind: "balance"; amount: number; dueDate: string | null }
  /** A bank transfer covering what is due is on its way. Nothing to do: it
   *  takes one to three working days and the spot is held meanwhile. */
  | { kind: "awaiting"; amount: number; dueDate: string | null };

export type PaymentInputs = {
  status: string | null;
  downpayment_received: boolean | null;
  /** exp_bookings.created_at. Anchors the no-deposit down-payment deadline. */
  bookedAt: string | null;
  edition: { kind?: string | null; date_start: string | null; deposit: number | null } | null;
  /** Agreed price + confirmed add-ons + covered guests. Null when no price is set. */
  total: number | null;
  /** Money that actually arrived (the ledger, never the hand-ticked flags). */
  paid: number;
  /** The package's payment config. Null means the engine's defaults. */
  cfg: PackagePaymentConfig | null;
  /** Stages with an issued and settled invoice, see BookingPaymentState. */
  settledStages?: { deposit: number; downpayment: number } | null;
  /** Group bookings: a covered guest pays nothing here, the payer's plan carries it. */
  coveredByBookingId?: string | null;
  /**
   * Money the guest has already sent by bank transfer and Stripe has not yet
   * confirmed. Deliberately NOT part of `paid`: it is not in the bank, it is
   * not in exp_payments, and counting it as received would mark a spot secured
   * against money that may never arrive. It only silences the ASK.
   */
  inFlight?: number;
};

export type PaymentPicture = {
  plan: Milestone[];
  nextMilestone: Milestone | undefined;
  /** What to transfer now: the next threshold minus what has already landed. */
  dueNow: number;
  depositPaid: boolean;
  hasDeposit: boolean;
  fullyPaid: boolean;
  isEvent: boolean;
  step: PaymentStep;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The plan and the next step for one booking. The branches are the trip
 * page's hero, in the order it asked them, minus the trip phase (a started
 * trip has no money hero, and that is the page's call, not this one's).
 */
export function paymentPicture(i: PaymentInputs): PaymentPicture {
  const total = i.total;
  const paid = i.paid;
  const isEvent = i.edition?.kind === "event";
  // An edition-level deposit, if set, overrides the package's. Missing config
  // falls through to the engine's defaults.
  const plan = computePaymentPlan(
    {
      deposit: i.edition?.deposit ?? i.cfg?.deposit ?? null,
      downpayment_percent: i.cfg?.downpayment_percent ?? null,
      final_days_before: i.cfg?.final_days_before ?? null,
      deposit_refund_days: i.cfg?.deposit_refund_days ?? null,
    },
    {
      total: total ?? 0,
      paidAmount: paid,
      editionStart: i.edition?.date_start ?? null,
      bookedAt: i.bookedAt,
      settledStages: i.settledStages ?? undefined,
    },
  );
  // "Secured" = the first real milestone is paid (the deposit, or the
  // down-payment when the package has none). The admin flag and an attending
  // status count too: a bank transfer lands days before anyone books it.
  const depositMilestone = plan.find((m) => m.kind === "deposit");
  const depositPaid =
    (depositMilestone ? depositMilestone.status === "paid" : paid > 0) ||
    !!i.downpayment_received ||
    isAttending(i.status);
  const hasDeposit = !!depositMilestone;
  const fullyPaid = total != null && total > 0 && paid >= total;
  const nextMilestone = plan.find((m) => m.status !== "paid");
  const dueNow = amountDueNow(plan, paid) ?? nextMilestone?.amount ?? 0;

  const inFlight = i.inFlight ?? 0;

  let step: PaymentStep;
  if (i.coveredByBookingId || fullyPaid) {
    step = { kind: "none" };
  } else if (isEvent) {
    // A clinic has no deposit→balance ladder: what is owed is what is unpaid.
    // Part-paid is still secured, money in and money still owed.
    step = paid > 0.01
      ? { kind: "balance", amount: round2(Math.max(0, (total ?? 0) - paid)), dueDate: plan.find((m) => m.kind === "final")?.dueDate ?? null }
      : { kind: "pending", amount: total ?? 0 };
  } else if (inFlight + 0.01 >= dueNow && dueNow > 0) {
    /*
     * A transfer covering what is due now silences the ask, and it belongs HERE
     * rather than in the trip page because the HOME page reads the same
     * derivation: put the branch in the page and somebody who transferred last
     * night still opens their home to "balance due". This way both are right at
     * once, with no edit to the home page at all.
     *
     * Only when it covers the whole of what is due. A PART transfer leaves the
     * existing step standing, because the money that is genuinely unfunded is
     * still owed and asking for it is the honest thing.
     */
    step = { kind: "awaiting", amount: round2(inFlight), dueDate: nextMilestone?.dueDate ?? null };
  } else if (!depositPaid && nextMilestone) {
    step = { kind: "secure", amount: dueNow, dueDate: nextMilestone.dueDate };
  } else if (nextMilestone) {
    step = { kind: "balance", amount: dueNow, dueDate: nextMilestone.dueDate };
  } else {
    step = { kind: "none" };
  }

  return { plan, nextMilestone, dueNow, depositPaid, hasDeposit, fullyPaid, isEvent, step };
}

/** A payment inside this many days of its deadline belongs on the home page. */
export const DUE_SOON_DAYS = 14;

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Whole days until the step's deadline. Negative once it has passed; null when there is none. */
export function daysUntilDue(step: PaymentStep, today: string = todayISO()): number | null {
  if (step.kind !== "balance" && step.kind !== "secure") return null;
  if (!step.dueDate) return null;
  return daysBetween(today, step.dueDate);
}

/** The deadline has passed and the money has not landed. */
export function isOverdue(step: PaymentStep, today: string = todayISO()): boolean {
  const d = daysUntilDue(step, today);
  return d != null && d < 0;
}

/** Due within the window, or already past it. Due today counts. */
export function isDueSoon(step: PaymentStep, today: string = todayISO(), within: number = DUE_SOON_DAYS): boolean {
  const d = daysUntilDue(step, today);
  return d != null && d <= within;
}

/** "1 Sept", read in UTC so a yyyy-mm-dd never slips a day on the server. */
export function fmtDueShort(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
