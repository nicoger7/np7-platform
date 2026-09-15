/**
 * What a rider has to pay next, and whether it belongs on the home page.
 *
 * Cameron Cederquist, Bonaire Week I (30 Nov – 6 Dec 2026): down-payment paid,
 * EUR 1,820 balance due 1 September, viewed on 14 September. The trip page
 * said "Balance due — €1,820 · due 1 Sept". The home said "Spot secured".
 * These pin the derivation both pages now read, and the 14-day window that
 * decides what the home surfaces.
 */
import { describe, it, expect } from "vitest";
import { paymentPicture, isDueSoon, isOverdue, daysUntilDue, fmtDueShort, DUE_SOON_DAYS } from "@/lib/portal-next-step";

const TODAY = "2026-09-14";
// Bonaire packages carry no deposit: the 50% down-payment is the securing payment.
const CFG = { deposit: 0, downpayment_percent: 50, final_days_before: 90, deposit_refund_days: 14 };
const BONAIRE = { kind: "trip", date_start: "2026-11-30", deposit: 0 };

const cameron = {
  status: "confirmed", downpayment_received: true, bookedAt: "2026-06-01",
  edition: BONAIRE, total: 3640, paid: 1820, cfg: CFG,
};

describe("a secured trip with the balance past its date", () => {
  const p = paymentPicture(cameron);
  it("owes the final balance, due 90 days before the trip", () => {
    expect(p.step).toEqual({ kind: "balance", amount: 1820, dueDate: "2026-09-01" });
    expect(p.depositPaid).toBe(true);
    expect(p.fullyPaid).toBe(false);
  });
  it("is overdue on the 14th, and therefore due soon", () => {
    expect(daysUntilDue(p.step, TODAY)).toBe(-13);
    expect(isOverdue(p.step, TODAY)).toBe(true);
    expect(isDueSoon(p.step, TODAY)).toBe(true);
  });
  it("prints the date the way the trip page does", () => {
    expect(fmtDueShort("2026-09-01")).toMatch(/^1 Sep/);
  });
});

describe("the 14-day window", () => {
  const due = (dueDate: string) => ({ kind: "balance" as const, amount: 100, dueDate });
  it("takes a balance due today and one due in exactly 14 days", () => {
    expect(isDueSoon(due(TODAY), TODAY)).toBe(true);
    expect(isDueSoon(due("2026-09-28"), TODAY)).toBe(true);
    expect(isOverdue(due(TODAY), TODAY)).toBe(false);
  });
  it("leaves a balance due in 15 days to the trip page", () => {
    expect(DUE_SOON_DAYS).toBe(14);
    expect(isDueSoon(due("2026-09-29"), TODAY)).toBe(false);
  });
  it("cannot place a step without a deadline", () => {
    expect(isDueSoon({ kind: "balance", amount: 100, dueDate: null }, TODAY)).toBe(false);
    expect(isDueSoon({ kind: "none" }, TODAY)).toBe(false);
    expect(isDueSoon({ kind: "pending", amount: 400 }, TODAY)).toBe(false);
  });
});

describe("the other states", () => {
  it("paid up is nothing", () => {
    expect(paymentPicture({ ...cameron, paid: 3640 }).step).toEqual({ kind: "none" });
  });
  it("what is owed is the threshold minus what landed, not the nominal slice", () => {
    // Overpaid the down-payment by 300: the balance shrinks by the same.
    expect(paymentPicture({ ...cameron, paid: 2120 }).step).toEqual({ kind: "balance", amount: 1520, dueDate: "2026-09-01" });
  });
  it("an unsecured spot asks for the securing payment, due 14 days after signup", () => {
    const p = paymentPicture({ ...cameron, status: "lead", downpayment_received: false, paid: 0 });
    expect(p.step).toEqual({ kind: "secure", amount: 1820, dueDate: "2026-06-15" });
    expect(p.depositPaid).toBe(false);
  });
  it("a covered guest owes nothing, whatever the numbers say", () => {
    expect(paymentPicture({ ...cameron, coveredByBookingId: "payer" }).step).toEqual({ kind: "none" });
  });
  it("a price we do not know cannot be owed", () => {
    expect(paymentPicture({ ...cameron, total: null, paid: 0 }).step).toEqual({ kind: "none" });
  });
  it("a part-paid clinic owes what is unpaid, an unpaid one is pending", () => {
    const clinic = { ...cameron, edition: { kind: "event", date_start: "2026-10-10", deposit: null }, total: 400, cfg: null };
    expect(paymentPicture({ ...clinic, paid: 100 }).step).toMatchObject({ kind: "balance", amount: 300 });
    expect(paymentPicture({ ...clinic, paid: 0, status: "reserved", downpayment_received: false }).step).toEqual({ kind: "pending", amount: 400 });
  });
});

/**
 * A bank transfer in flight. Cameron's own securing payment, sent on Monday
 * and not yet confirmed by Stripe.
 *
 * The branch lives here rather than in the trip page on purpose: the HOME page
 * reads this same derivation, so putting it in the page would leave somebody
 * who transferred last night looking at "balance due" on their home. It
 * silences the ASK and never touches `paid`, because money in a cash balance
 * is not money in the bank.
 */
describe("money already on its way", () => {
  const unsecured = { ...cameron, status: "lead" as const, downpayment_received: false, paid: 0 };

  it("changes nothing at all when there is none, which is every booking today", () => {
    expect(paymentPicture({ ...unsecured, inFlight: 0 }).step).toEqual(paymentPicture(unsecured).step);
    expect(paymentPicture({ ...cameron, inFlight: 0 }).step).toEqual(paymentPicture(cameron).step);
  });

  it("stops asking for a securing payment that is already moving", () => {
    const p = paymentPicture({ ...unsecured, inFlight: 1820 });
    expect(p.step).toEqual({ kind: "awaiting", amount: 1820, dueDate: "2026-06-15" });
    // Still not paid: the ledger is the only word on that, and the plan below
    // must keep showing the money as owed until it actually lands.
    expect(p.depositPaid).toBe(false);
    expect(p.fullyPaid).toBe(false);
    expect(p.dueNow).toBe(1820);
  });

  it("stops asking for a balance that is already moving", () => {
    expect(paymentPicture({ ...cameron, inFlight: 1820 }).step).toEqual({ kind: "awaiting", amount: 1820, dueDate: "2026-09-01" });
  });

  it("keeps asking when the transfer covers only part of what is due", () => {
    // EUR 1,400 sent against a EUR 1,820 securing payment: the rest is still
    // genuinely owed, and asking for it is the honest thing.
    expect(paymentPicture({ ...unsecured, inFlight: 1400 }).step).toEqual({ kind: "secure", amount: 1820, dueDate: "2026-06-15" });
  });

  it("never chases a guest whose money is in flight", () => {
    const step = paymentPicture({ ...cameron, inFlight: 1820 }).step;
    expect(isOverdue(step, TODAY)).toBe(false);
    expect(isDueSoon(step, TODAY)).toBe(false);
    expect(daysUntilDue(step, TODAY)).toBeNull();
  });

  it("says nothing is owed once the money has actually landed", () => {
    expect(paymentPicture({ ...cameron, paid: 3640, inFlight: 1820 }).step).toEqual({ kind: "none" });
  });
});
