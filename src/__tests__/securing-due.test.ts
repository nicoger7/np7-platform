/**
 * When the securing payment falls due.
 *
 * The window was signup + refundDays with nothing checking it against the trip,
 * so booking five days before departure produced a deadline nine days AFTER the
 * trip had finished, printed onto a pro-forma.
 *
 * Nico's rule: "ab 14 tagen sollte man nur 2 tage zeit haben zum bezahlen".
 * Inside the last fortnight the window collapses to two days, and it is floored
 * so it can never land past departure.
 *
 * The invoice engine and the member's plan both call this one function. They
 * used to carry separate formulas for the same date, which is exactly how this
 * area's past bugs shipped: the document and the account page disagreed, and the
 * guest believed whichever they saw first.
 */
import { describe, it, expect } from "vitest";
import { securingDue, computePaymentPlan, LATE_SIGNUP_WITHIN_DAYS, LATE_SIGNUP_PAY_DAYS } from "@/lib/payments";

const REFUND_DAYS = 14;
const due = (signup: string, start: string | null) => securingDue(signup, start, REFUND_DAYS);

describe("booking well ahead keeps the normal window", () => {
  it("gives the full 14 days", () => {
    expect(due("2026-03-01", "2026-10-10")).toBe("2026-03-15");
  });

  it("still gives 14 days at exactly one day outside the threshold", () => {
    // start - signup = 15 days, so the late rule must NOT bite yet.
    expect(due("2026-09-25", "2026-10-10")).toBe("2026-10-09");
  });

  it("falls back to the plain window when the trip has no date", () => {
    expect(due("2026-03-01", null)).toBe("2026-03-15");
  });
});

describe("Nico's case: inside the last fortnight you get two days", () => {
  it("trip in exactly 14 days gives 2 days, not 14", () => {
    expect(due("2026-09-26", "2026-10-10")).toBe("2026-09-28");
  });

  it("trip in 10 days still gives 2 days", () => {
    expect(due("2026-09-30", "2026-10-10")).toBe("2026-10-02");
  });

  it("the constants say what the rule says", () => {
    expect(LATE_SIGNUP_WITHIN_DAYS).toBe(14);
    expect(LATE_SIGNUP_PAY_DAYS).toBe(2);
  });
});

describe("the deadline can never outlive the trip", () => {
  it("booking the day before departure is due on the day, not after it", () => {
    expect(due("2026-10-09", "2026-10-10")).toBe("2026-10-10");
  });

  it("booking on the day of departure is due immediately", () => {
    expect(due("2026-10-10", "2026-10-10")).toBe("2026-10-10");
  });

  it("a trip that already started is due immediately, never in the past", () => {
    expect(due("2026-10-12", "2026-10-10")).toBe("2026-10-12");
  });

  it("never returns a date before the signup itself", () => {
    for (const [signup, start] of [
      ["2026-10-09", "2026-10-10"], ["2026-10-10", "2026-10-10"],
      ["2026-10-12", "2026-10-10"], ["2026-09-26", "2026-10-10"],
      ["2026-03-01", "2026-10-10"],
    ] as const) {
      expect(due(signup, start)! >= signup).toBe(true);
    }
  });

  it("no signup date means no deadline, not a wrong one", () => {
    expect(securingDue(null, "2026-10-10", REFUND_DAYS)).toBeNull();
  });
});

describe("the plan the member sees uses the same rule", () => {
  const CFG = { deposit: 0, downpayment_percent: 50, final_days_before: 60, deposit_refund_days: 14 };

  it("a late booking's downpayment is due two days after signing up", () => {
    const plan = computePaymentPlan(CFG, {
      total: 2990, paidAmount: 0, bookedAt: "2026-09-30", editionStart: "2026-10-10",
    });
    expect(plan.find((m) => m.kind === "downpayment")?.dueDate).toBe("2026-10-02");
  });

  it("shortening the deadline does NOT shorten the refund window", () => {
    // "widerruf bleibt gleich". refundableUntil hangs off the date the money
    // arrived, so a late booker keeps the same right to change their mind.
    const plan = computePaymentPlan({ ...CFG, deposit: 300 }, {
      total: 2990, paidAmount: 300, bookedAt: "2026-09-30", editionStart: "2026-10-10",
      depositReceivedAt: "2026-09-30",
    });
    expect(plan.find((m) => m.kind === "deposit")?.refundableUntil).toBe("2026-10-14");
  });
});
