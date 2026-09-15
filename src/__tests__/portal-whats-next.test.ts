/**
 * The trip page's timeline: what is done, what is now, and what is still ahead.
 *
 * Same rider as portal-next-step.test.ts, so the two files can be read side by
 * side: Cameron Cederquist, Bonaire Week I (30 Nov – 6 Dec 2026), down-payment
 * paid, EUR 1,820 balance due 1 September, viewed on 14 September.
 *
 * The regression that matters most is the first one. Before this line existed,
 * Cameron's overdue balance was FILTERED OUT of the block entirely: a dated
 * step older than a day was dropped whether or not it had been paid. A list can
 * absorb that as an omission. A line cannot: it would have drawn a green tick
 * and four quiet dots while the hero directly above asked for the EUR 1,820.
 */
import { describe, it, expect } from "vitest";
import { buildWhatsNext, type WhatsNextStep } from "@/components/portal/whats-next";
import { computePaymentPlan, type Milestone } from "@/lib/payments";

// Bonaire packages carry no deposit: the 50% down-payment is the securing payment.
const CFG = { deposit: 0, downpayment_percent: 50, final_days_before: 90, deposit_refund_days: 14 };
const TIMING = { crew_forming: 60, pre_trip_info: 21, pre_trip_final: 7 };
const START = new Date("2026-11-30");
const END = new Date("2026-12-06");

const cameronPlan = (paid: number) =>
  computePaymentPlan(CFG, { total: 3640, paidAmount: paid, editionStart: "2026-11-30", bookedAt: "2026-06-01" });

function line(over: {
  now: string;
  plan?: Milestone[];
  asking?: boolean;
  isEvent?: boolean;
  fullyPaid?: boolean;
  joinedGroup?: boolean;
  start?: Date | null;
}): WhatsNextStep[] {
  return buildWhatsNext({
    now: new Date(over.now),
    start: over.start === undefined ? START : over.start,
    end: over.start === null ? null : END,
    plan: over.plan ?? cameronPlan(1820),
    depositPaid: true,
    fullyPaid: over.fullyPaid ?? false,
    isEvent: over.isEvent ?? false,
    timingBefore: TIMING,
    whatsappLink: null,
    joinedGroup: over.joinedGroup ?? false,
    asking: over.asking ?? false,
    money: (n) => `EUR ${n.toLocaleString("en-GB")}`,
  });
}

const shorts = (steps: WhatsNextStep[]) => steps.map((s) => s.short);
const states = (steps: WhatsNextStep[]) => steps.map((s) => s.state);
const current = (steps: WhatsNextStep[]) => steps.find((s) => s.state === "now") ?? null;

describe("money that is overdue and unpaid", () => {
  const steps = line({ now: "2026-09-14T10:00:00Z", asking: true });

  it("is on the line at all, which it was not before", () => {
    expect(shorts(steps)).toEqual(["Down-payment", "Balance", "Your crew", "Packing list", "Final details", "Your trip"]);
  });

  it("is the current step, not a grey one the date has gone past", () => {
    expect(current(steps)?.short).toBe("Balance");
    expect(states(steps)).toEqual(["done", "now", "ahead", "ahead", "ahead", "ahead"]);
  });

  it("carries the flag the collapsed line names it by", () => {
    expect(steps.filter((s) => s.due).map((s) => s.short)).toEqual(["Balance"]);
  });

  it("counts backwards for nobody: an overdue step gets no 'in N days'", () => {
    expect(steps[1].eta).toBeUndefined();
  });
});

describe("the gate that stops the line contradicting the hero", () => {
  /* Both of these are `asking: false`, from the two different reasons the trip
     page has for it, and that is the point: one flag, read off the same
     payment step the hero reads, so the two cards cannot disagree. */
  const steps = line({ now: "2026-09-14T10:00:00Z", asking: false });

  it("a guest whose transfer is already on its way is never dunned", () => {
    expect(steps.every((s) => !s.due)).toBe(true);
    expect(shorts(steps)).not.toContain("Balance");
  });

  it("a covered group guest's next step is their crew, not their payer's money", () => {
    expect(current(steps)?.short).toBe("Your crew");
  });
});

describe("a payment due TODAY", () => {
  // The old comparison was getTime() against a local clock, and `when` for a
  // milestone is UTC midnight: at 00:01 on the due date the step went grey and
  // its date was blanked, on the very day we were asking for the money.
  const steps = line({ now: "2026-09-01T10:00:00Z" });

  it("is now, not past", () => {
    expect(steps[1].short).toBe("Balance");
    expect(steps[1].state).toBe("now");
  });

  it("says so in words", () => {
    expect(steps[1].eta).toBe("today");
  });
});

describe("the order things happen in", () => {
  it("puts an undated securing payment first, not after the trip it secures", () => {
    const plan = computePaymentPlan(
      { deposit: 300, downpayment_percent: 50, final_days_before: 90, deposit_refund_days: 14 },
      { total: 3640, paidAmount: 0, editionStart: "2026-11-30", bookedAt: "2026-09-10" },
    );
    const steps = line({ now: "2026-09-14T10:00:00Z", plan, asking: true });
    expect(shorts(steps)).toEqual(["Deposit", "Down-payment", "Balance", "Your crew", "Packing list", "Final details", "Your trip"]);
    expect(current(steps)?.short).toBe("Deposit");
  });

  it("puts a clinic's waiver before the clinic", () => {
    const steps = line({ now: "2026-09-14T10:00:00Z", plan: [], isEvent: true });
    expect(shorts(steps)).toEqual(["The waiver", "Your trip"]);
  });

  it("ends at the trip whatever else is on the line", () => {
    for (const s of [
      line({ now: "2026-09-14T10:00:00Z", asking: true }),
      line({ now: "2026-09-14T10:00:00Z", plan: [], isEvent: true }),
      line({ now: "2026-11-24T10:00:00Z", plan: cameronPlan(3640), fullyPaid: true }),
    ]) {
      expect(s[s.length - 1].short).toBe("Your trip");
    }
  });
});

describe("a trip that is paid for and a week away", () => {
  const steps = line({ now: "2026-11-24T10:00:00Z", plan: cameronPlan(3640), fullyPaid: true });

  it("is ticks and one thing left", () => {
    expect(states(steps)).toEqual(["done", "done", "now"]);
    expect(shorts(steps)).toEqual(["Down-payment", "Balance", "Your trip"]);
  });

  it("says how far away it is, so nobody has to count", () => {
    expect(current(steps)?.eta).toBe("in 6 days");
  });
});

describe("how far away things read", () => {
  const trip = (now: string) => line({ now, plan: cameronPlan(3640), fullyPaid: true }).at(-1)!.eta;
  it("today, tomorrow, days, weeks, then a date", () => {
    expect(trip("2026-11-30T10:00:00Z")).toBe("today");
    expect(trip("2026-11-29T10:00:00Z")).toBe("tomorrow");
    expect(trip("2026-11-27T10:00:00Z")).toBe("in 3 days");
    expect(trip("2026-11-16T10:00:00Z")).toBe("in 2 weeks");
    expect(trip("2026-09-14T10:00:00Z")).toBe("~30 Nov");
  });
});

describe("invariants the rail depends on", () => {
  const worlds = [
    line({ now: "2026-09-14T10:00:00Z", asking: true }),
    line({ now: "2026-09-14T10:00:00Z", asking: false }),
    line({ now: "2026-09-01T10:00:00Z", asking: true }),
    line({ now: "2026-11-24T10:00:00Z", plan: cameronPlan(3640), fullyPaid: true }),
    line({ now: "2026-09-14T10:00:00Z", plan: [], isEvent: true }),
    line({ now: "2026-09-14T10:00:00Z", plan: cameronPlan(1820), joinedGroup: true, asking: true }),
  ];

  it("marks exactly one step as now, because the rail draws exactly one big dot", () => {
    for (const w of worlds) expect(w.filter((s) => s.state === "now")).toHaveLength(1);
  });

  it("never asks for money twice at once", () => {
    for (const w of worlds) expect(w.filter((s) => s.due).length).toBeLessThanOrEqual(1);
  });

  it("gives every step a name the collapsed line can print", () => {
    for (const w of worlds) for (const s of w) expect(s.short.length).toBeGreaterThan(0);
  });

  it("never marks a done step as anything else", () => {
    const joined = worlds[5];
    expect(joined.find((s) => s.short === "Your crew")?.state).toBe("done");
  });
});
