/**
 * A stage that has been PAID must stop moving when the trip total changes.
 *
 * Indrek Orro paid his EUR 2,775 down-payment on 12 February 2026. In
 * September we added eight nights (EUR 2,368) and a late check-out (EUR 85),
 * and his trip page immediately told him:
 *
 *   ! This one is past its date
 *   1  Downpayment · 50% of your trip      EUR 1,227
 *      Due now · EUR 2,775 of EUR 4,002 already covered
 *   2  Final balance                       EUR 4,002
 *
 * Every number there is a consequence of one mistake: the down-payment stage
 * was re-derived from the NEW total, so a stage he had settled seven months
 * earlier reopened, fell short, and went overdue. Ten live bookings read this
 * way the day it was found.
 */
import { describe, it, expect } from "vitest";
import { computePaymentPlan, settledStagesFrom } from "@/lib/payments";

const CFG = { deposit: 0, downpayment_percent: 50, final_days_before: 90, deposit_refund_days: 14 };
const INDREK = { total: 8003, paidAmount: 2775, editionStart: "2026-12-07", bookedAt: "2026-06-08" };

describe("a settled stage does not move when the trip grows", () => {
  it("pins the down-payment to what was actually paid for it", () => {
    const plan = computePaymentPlan(CFG, { ...INDREK, settledStages: { deposit: 0, downpayment: 2775 } });
    const down = plan.find((m) => m.kind === "downpayment")!;
    const fin = plan.find((m) => m.kind === "final")!;

    expect(down.status).toBe("paid");
    expect(down.amount).toBe(2775);
    expect(fin.amount).toBe(5228);
    // The two steps and the balance are the same statement.
    expect(down.amount + fin.amount).toBe(INDREK.total);
  });

  it("stops claiming a percentage the number does not hold", () => {
    const pinned = computePaymentPlan(CFG, { ...INDREK, settledStages: { deposit: 0, downpayment: 2775 } });
    // 2,775 is 34.7% of 8,003. Saying "50% of your trip" over it is false.
    expect(pinned.find((m) => m.kind === "downpayment")!.label).not.toMatch(/%/);
    // Where nothing is settled the percentage IS true, so it stays.
    const fresh = computePaymentPlan(CFG, { total: 8003, paidAmount: 0, editionStart: "2026-12-07", bookedAt: "2026-06-08" });
    expect(fresh.find((m) => m.kind === "downpayment")!.label).toBe("Downpayment · 50% of your trip");
  });

  it("without the pin, the old bug is reproduced exactly", () => {
    const plan = computePaymentPlan(CFG, INDREK);
    const down = plan.find((m) => m.kind === "downpayment")!;
    expect(down.status).toBe("due");           // a stage he paid in February
    expect(down.amount).toBe(4001.5);          // re-derived from the bigger total
    expect(down.dueDate).toBe("2026-06-22");   // and therefore months overdue
  });
});

describe("settledStagesFrom is the one definition", () => {
  it("an invoice alone settles the stage", () => {
    expect(settledStagesFrom([{ type: "downpayment_invoice", amount: 2775 }], [])).toEqual({ deposit: 0, downpayment: 2775 });
  });

  it("a payment alone settles the stage (Indrek: no invoice ever existed)", () => {
    expect(settledStagesFrom([], [{ type: "downpayment", status: "paid", direction: "revenue", amount: 2775 }]))
      .toEqual({ deposit: 0, downpayment: 2775 });
  });

  it("both together describe ONE stage, so they are compared, not summed", () => {
    expect(settledStagesFrom(
      [{ type: "downpayment_invoice", amount: 2775 }],
      [{ type: "downpayment", status: "paid", direction: "revenue", amount: 2775 }],
    )).toEqual({ deposit: 0, downpayment: 2775 });
  });

  it("ignores money that is not in the bank, and money that is not ours", () => {
    expect(settledStagesFrom([], [
      { type: "downpayment", status: "pending", direction: "revenue", amount: 5000 },
      { type: "downpayment", status: "paid", direction: "cost", amount: 5000 },
      { type: "partial", status: "paid", direction: "revenue", amount: 5000 },
      { type: "final", status: "paid", direction: "revenue", amount: 5000 },
    ])).toEqual({ deposit: 0, downpayment: 0 });
  });
});

describe("a stage cannot have been paid with more money than arrived", () => {
  const paid = (type: string, amount: number) => ({ type, status: "paid", direction: "revenue", amount });

  it("Richard Hood: a credit-noted downpayment invoice does not count twice", () => {
    const s = settledStagesFrom([], [
      paid("downpayment", 2542.8), // 204, the replacement
      paid("downpayment", 2445),   // 202, cancelled
      paid("refund", 2445),        // 202/credit
    ]);
    expect(s.downpayment).toBe(2542.8);
    const plan = computePaymentPlan(CFG, { total: 4890, paidAmount: 2542.8, editionStart: "2026-12-07", bookedAt: "2026-06-08", settledStages: s });
    expect(plan.find((m) => m.kind === "downpayment")!.amount).toBeLessThanOrEqual(4890);
    expect(plan.find((m) => m.kind === "downpayment")!.amount).toBe(2542.8);
  });

  it("Indrek is unchanged: one clean downpayment still pins", () => {
    expect(settledStagesFrom([], [paid("downpayment", 2775)])).toEqual({ deposit: 0, downpayment: 2775 });
  });

  it("an empty payment list does not wipe a paid stage invoice (a failed read is not zero money)", () => {
    expect(settledStagesFrom([{ type: "downpayment_invoice", amount: 2775 }], [])).toEqual({ deposit: 0, downpayment: 2775 });
  });

  it("money moved on to cover another guest is not the payer's own stage", () => {
    const s = settledStagesFrom([], [paid("downpayment", 3000), paid("partial", -2000)]);
    expect(s.downpayment).toBe(1000);
  });
});
