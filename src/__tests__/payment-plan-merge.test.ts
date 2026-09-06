/**
 * Two instalments due on the same day are one instalment.
 *
 * computePaymentPlan clamps the final balance so it can never fall due before
 * the downpayment. For a late signup that clamp lands both on the same date, and
 * the quote then read:
 *
 *   Downpayment · 50%   EUR 1,495   Due by 20 September 2026
 *   Final balance       EUR 1,495   Due by 20 September 2026
 *
 * which is one payment printed twice, on the screen where somebody decides
 * whether to book.
 *
 * The merge is display-only on purpose: the invoice engine addresses stages by
 * kind through milestoneAmount(), so the raw plan must keep both. These tests
 * pin both halves of that, because getting it wrong bills a guest wrongly.
 */
import { describe, it, expect } from "vitest";
import { computePaymentPlan, mergeSameDayStages, milestoneAmount } from "@/lib/payments";

// Bonaire sells its November weeks all summer, which is how a signup lands
// inside the final-payment window in the first place.
const CFG = { deposit: 0, downpayment_percent: 50, final_days_before: 60, deposit_refund_days: 14 };
const LATE = { total: 2990, paidAmount: 0, bookedAt: "2026-09-06", editionStart: "2026-10-10" };
const EARLY = { total: 2990, paidAmount: 0, bookedAt: "2026-03-01", editionStart: "2026-10-10" };

describe("a late signup, where both instalments land on the same day", () => {
  const raw = computePaymentPlan(CFG, LATE);
  const shown = mergeSameDayStages(raw);

  it("really does collapse to one date without the merge", () => {
    const down = raw.find((m) => m.kind === "downpayment");
    const fin = raw.find((m) => m.kind === "final");
    expect(down?.dueDate).toBe(fin?.dueDate);
    expect(down?.dueDate).toBeTruthy();
  });

  it("shows the rider one row, not two", () => {
    expect(shown).toHaveLength(1);
    expect(shown[0].label).toBe("Full amount");
  });

  it("asks for the whole trip, to the cent", () => {
    expect(shown[0].amount).toBe(2990);
    expect(shown.reduce((s, m) => s + m.amount, 0)).toBe(raw.reduce((s, m) => s + m.amount, 0));
  });

  it("keeps the real deadline", () => {
    expect(shown[0].dueDate).toBe(raw.find((m) => m.kind === "final")?.dueDate);
  });

  it("records what it swallowed, so the row can explain itself", () => {
    expect(shown[0].mergedFrom).toEqual(["downpayment", "final"]);
  });

  it("LEAVES THE INVOICE ENGINE BOTH STAGES", () => {
    // The whole reason this is a separate function. If milestoneAmount ever
    // returns 0 here, a down-payment invoice bills nothing.
    expect(milestoneAmount("downpayment", CFG, LATE)).toBe(1495);
    expect(milestoneAmount("final", CFG, LATE)).toBe(1495);
  });
});

describe("a normal signup is left completely alone", () => {
  const raw = computePaymentPlan(CFG, EARLY);
  const shown = mergeSameDayStages(raw);

  it("has two genuinely different dates", () => {
    const down = raw.find((m) => m.kind === "downpayment");
    const fin = raw.find((m) => m.kind === "final");
    expect(down?.dueDate).not.toBe(fin?.dueDate);
  });

  it("still shows both instalments", () => {
    expect(shown).toHaveLength(2);
    expect(shown.map((m) => m.kind)).toEqual(["downpayment", "final"]);
    expect(shown.every((m) => !m.mergedFrom)).toBe(true);
  });
});

describe("what must never be merged away", () => {
  it("a downpayment the rider has already sent us stays visible", () => {
    // Same late booking, but the downpayment is settled. Merging here would
    // erase a payment the rider made from their own plan.
    const paid = computePaymentPlan(CFG, { ...LATE, paidAmount: 1495 });
    const shown = mergeSameDayStages(paid);
    expect(paid.find((m) => m.kind === "downpayment")?.status).toBe("paid");
    expect(shown).toHaveLength(2);
    expect(shown.find((m) => m.kind === "downpayment")?.status).toBe("paid");
  });

  it("a plan with a deposit keeps the deposit as its own step", () => {
    const withDep = computePaymentPlan({ ...CFG, deposit: 300 }, LATE);
    const shown = mergeSameDayStages(withDep);
    expect(shown[0].kind).toBe("deposit");
    expect(shown.reduce((s, m) => s + m.amount, 0)).toBe(2990);
  });

  it("does nothing when a stage is missing entirely", () => {
    const onlyFinal = [{ kind: "final" as const, label: "Final balance", amount: 100, cumulative: 100, dueDate: "2026-10-01", dueLabel: "x", status: "due" as const }];
    expect(mergeSameDayStages(onlyFinal)).toEqual(onlyFinal);
    expect(mergeSameDayStages([])).toEqual([]);
  });
});
