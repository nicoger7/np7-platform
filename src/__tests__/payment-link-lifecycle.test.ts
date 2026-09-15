/**
 * The link lifecycle: what may be cancelled, what counts as spoken for, and
 * what may be swept.
 *
 * The bug this whole classification exists to prevent: a guest transfers €1,440
 * on Monday, opens their trip page on Wednesday, and the old filter
 * (`status='open' AND expires_at > now()`) no longer sees their payment at all,
 * because the CHECKOUT died at 23 hours while the MONEY is still moving. They
 * press Pay, a second transfer starts, and if both eventually land the booking
 * is overpaid and somebody has to refund it by hand.
 */
import { describe, it, expect } from "vitest";
import { classifyLinks, sweepableLinks, isInFlight, canSayNotSent, type LinkRow } from "@/lib/bank-transfer";

const NOW = new Date("2026-09-20T12:00:00Z").getTime();
const hoursFromNow = (h: number) => new Date(NOW + h * 3600_000).toISOString();

const row = (over: Partial<LinkRow> & { id: string }): LinkRow => ({
  amount: 1440, status: "open", created_by: "member", expires_at: hoursFromNow(1), ...over,
});

describe("what a new payment may sweep aside", () => {
  it("cancels the guest's own live, un-submitted checkout and nothing else", () => {
    const c = classifyLinks([
      row({ id: "mine-live" }),
      row({ id: "mine-dead", expires_at: hoursFromNow(-2) }),
      row({ id: "theirs", created_by: "admin" }),
      row({ id: "moving", status: "awaiting", expires_at: hoursFromNow(-48) }),
    ], NOW);
    expect(c.toCancel.map((l) => l.id)).toEqual(["mine-live"]);
  });

  it("an expired open row is neither cancelled nor counted: nobody can pay a dead session", () => {
    const c = classifyLinks([row({ id: "dead", expires_at: hoursFromNow(-1) })], NOW);
    expect(c.toCancel).toHaveLength(0);
    expect(c.spokenFor).toBe(0);
    expect(c.spokenForOnceReplaced).toBe(0);
  });

  it("NEVER cancels a transfer in flight, whoever made it and however dead its URL", () => {
    for (const created_by of ["member", "admin"]) {
      for (const status of ["awaiting", "part_funded"]) {
        const c = classifyLinks([row({ id: "x", status, created_by, expires_at: hoursFromNow(-72) })], NOW);
        expect(c.toCancel, `${created_by}/${status}`).toHaveLength(0);
        expect(c.spokenFor, `${created_by}/${status}`).toBe(1440);
      }
    }
  });
});

describe("what counts as already spoken for", () => {
  it("an admin's live link, exactly as it always has", () => {
    expect(classifyLinks([row({ id: "a", created_by: "admin" })], NOW).spokenFor).toBe(1440);
  });

  it("a transfer on day three, which is the case the old filter lost", () => {
    const c = classifyLinks([row({ id: "t", status: "awaiting", expires_at: hoursFromNow(-49) })], NOW);
    expect(c.spokenFor).toBe(1440);
    expect(c.inFlight.map((l) => l.id)).toEqual(["t"]);
  });

  it("adds every live row up, the guest's own open checkout included", () => {
    const c = classifyLinks([
      row({ id: "mine", amount: 500 }),
      row({ id: "admin", amount: 300, created_by: "admin" }),
      row({ id: "moving", amount: 640, status: "awaiting" }),
    ], NOW);
    expect(c.spokenFor).toBe(1440);
    // Only for the pay route, which cancels "mine" in the same request.
    expect(c.spokenForOnceReplaced).toBe(940);
    expect(c.toCancel.map((l) => l.id)).toEqual(["mine"]);
    expect(c.adminOpen.map((l) => l.id)).toEqual(["admin"]);
  });

  it("says nothing is live when nothing is", () => {
    const c = classifyLinks([], NOW);
    expect(c).toEqual({ toCancel: [], adminOpen: [], inFlight: [], spokenFor: 0, spokenForOnceReplaced: 0 });
    expect(classifyLinks(null, NOW).spokenFor).toBe(0);
  });

  it("knows an in-flight row from a finished one", () => {
    expect(isInFlight(row({ id: "a", status: "awaiting" }))).toBe(true);
    expect(isInFlight(row({ id: "b", status: "part_funded" }))).toBe(true);
    for (const s of ["open", "paid", "expired", "cancelled", "failed"]) {
      expect(isInFlight(row({ id: "c", status: s })), s).toBe(false);
    }
  });
});

describe("the lazy sweep, which only ever closes a row nothing arrived against", () => {
  const due = (h: number) => hoursFromNow(h);

  it("sweeps an awaiting row that was never funded, past its deadline", () => {
    const rows = [row({ id: "abandoned", status: "awaiting", amount_received: 0, funds_due_by: due(-1) })];
    expect(sweepableLinks(rows, NOW).map((l) => l.id)).toEqual(["abandoned"]);
  });

  it("leaves the same row alone while there is still time", () => {
    const rows = [row({ id: "slow", status: "awaiting", amount_received: 0, funds_due_by: due(1) })];
    expect(sweepableLinks(rows, NOW)).toHaveLength(0);
  });

  it("NEVER sweeps a row with money against it, however old", () => {
    const rows = [
      row({ id: "part", status: "part_funded", amount_received: 1400, funds_due_by: due(-240) }),
      row({ id: "some", status: "awaiting", amount_received: 0.5, funds_due_by: due(-240) }),
    ];
    expect(sweepableLinks(rows, NOW)).toHaveLength(0);
  });

  it("never touches an open, a paid or a cancelled row", () => {
    const rows = ["open", "paid", "cancelled", "expired", "failed"].map((status, i) =>
      row({ id: `s${i}`, status, amount_received: 0, funds_due_by: due(-240) }));
    expect(sweepableLinks(rows, NOW)).toHaveLength(0);
  });

  it("does nothing to a row that has no deadline at all", () => {
    const rows = [row({ id: "no-clock", status: "awaiting", amount_received: 0, funds_due_by: null })];
    expect(sweepableLinks(rows, NOW)).toHaveLength(0);
  });

  it("a swept row stops being spoken for, so the guest can pay again", () => {
    const rows = [row({ id: "abandoned", status: "awaiting", amount_received: 0, funds_due_by: due(-1) })];
    const swept = new Set(sweepableLinks(rows, NOW).map((l) => l.id));
    expect(classifyLinks(rows.filter((l) => !swept.has(l.id)), NOW).spokenFor).toBe(0);
  });
});

/**
 * The dedupe, which is not new but carries over unchanged and has to.
 * exp_payments.reference is UNIQUE (migration 159) and the webhook matches BOTH
 * spellings: its own `pi_…`, and `stripe:pi_…` if the bank feed imported the
 * charge first and somebody connected it by hand. A transfer's reference is the
 * same PaymentIntent id as a card's, so a redelivery finds the row either way
 * and inserts nothing.
 */
describe("a redelivered webhook writes no second payment row", () => {
  const pi = "pi_3QabcDEF";
  /** What the webhook's findRow() asks the database for. */
  const matches = (reference: string) => [pi, `stripe:${pi}`].includes(reference);

  const cases: [string, string, boolean][] = [
    ["the webhook's own row, redelivered", pi, true],
    ["a row the bank feed created and somebody connected", `stripe:${pi}`, true],
    ["a different intent entirely", "pi_3QotherXYZ", false],
    ["the same intent on another provider's prefix", `paypal:${pi}`, false],
    ["nothing at all", "", false],
  ];
  for (const [name, reference, found] of cases) {
    it(name, () => expect(matches(reference)).toBe(found));
  }

  it("means the second delivery records nothing new", () => {
    const ledger = [{ reference: pi, amount: 1440 }];
    const again = ledger.find((r) => matches(r.reference));
    expect(again).toBeTruthy();
    expect(ledger).toHaveLength(1);
  });
});

describe("a short transfer claims only what is still missing", () => {
  it("counts the remainder, not the whole ask", async () => {
    const { classifyLinks } = await import("@/lib/bank-transfer");
    // Asked 1,440, sent 1,400. What is still in flight is 40, not 1,440.
    // Counting the ask froze the booking: no Pay button, no way to send the 40,
    // and an email telling them to transfer the full amount again.
    const c = classifyLinks([
      { id: "l1", status: "part_funded", amount: 1440, amount_received: 1400, created_by: "member", expires_at: null, session_id: "cs_1", funds_due_by: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    expect(c.spokenFor).toBeCloseTo(40, 2);
    expect(c.spokenForOnceReplaced).toBeCloseTo(40, 2);
  });

  it("still claims the whole ask while nothing has arrived", async () => {
    const { classifyLinks } = await import("@/lib/bank-transfer");
    const c = classifyLinks([
      { id: "l1", status: "awaiting", amount: 1440, amount_received: 0, created_by: "member", expires_at: null, session_id: "cs_1", funds_due_by: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    expect(c.spokenFor).toBeCloseTo(1440, 2);
  });

  it("never sweeps a part-funded row, because that row is the only record of the money", async () => {
    const { sweepableLinks } = await import("@/lib/bank-transfer");
    const old = new Date(Date.now() - 86_400_000).toISOString();
    const rows = [
      { id: "part", status: "part_funded", amount: 1440, amount_received: 1400, funds_due_by: old },
      { id: "empty", status: "awaiting", amount: 1440, amount_received: 0, funds_due_by: old },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;
    expect(sweepableLinks(rows, Date.now()).map((l: { id: string }) => l.id)).toEqual(["empty"]);
  });
});

/**
 * "I have not sent this yet": the escape hatch out of an awaiting row, and the
 * three rows it must refuse.
 *
 * The dead end: press Pay by bank transfer, read the IBAN, send nothing. The
 * row counts as spoken for, the trip page says "your transfer is on its way",
 * and every Pay button is gone for the fourteen days funds_due_by takes to
 * sweep it. These pin who may say it and, more importantly, who may not.
 */
describe("who may say they never sent it", () => {
  const awaiting = (over: Partial<LinkRow> = {}) =>
    row({ id: "t", status: "awaiting", created_by: "member", amount_received: 0, ...over });

  it("the guest's own transfer, awaiting, with nothing against it", () => {
    expect(canSayNotSent(awaiting())).toEqual({ ok: true });
  });

  it("not a part-funded row: that row is the only record of the money on it", () => {
    expect(canSayNotSent(awaiting({ status: "part_funded", amount_received: 1400 })))
      .toEqual({ ok: false, reason: "already-arrived" });
  });

  it("not a row with money against it whatever its status says", () => {
    // The money decides, not the label: a webhook mid-write can leave an
    // awaiting row carrying a real amount, and cancelling that erases it.
    expect(canSayNotSent(awaiting({ amount_received: 0.5 })))
      .toEqual({ ok: false, reason: "already-arrived" });
  });

  it("not a transfer somebody at NP7 set up and sent them", () => {
    expect(canSayNotSent(awaiting({ created_by: "admin" })))
      .toEqual({ ok: false, reason: "not-theirs" });
  });

  it("not an open checkout: no IBAN was ever issued, so there is nothing to back out of", () => {
    expect(canSayNotSent(awaiting({ status: "open" })))
      .toEqual({ ok: false, reason: "not-waiting" });
  });

  it("not a row that is already finished with", () => {
    for (const status of ["paid", "cancelled", "expired", "failed"]) {
      expect(canSayNotSent(awaiting({ status })), status).toEqual({ ok: false, reason: "not-waiting" });
    }
  });

  it("not a row that is not there", () => {
    expect(canSayNotSent(null)).toEqual({ ok: false, reason: "missing" });
    expect(canSayNotSent(undefined)).toEqual({ ok: false, reason: "missing" });
  });

  it("and saying it hands the guest their Pay button back", () => {
    const rows = [awaiting({ amount: 1440 })];
    expect(classifyLinks(rows, NOW).spokenFor).toBe(1440);
    // What the route writes: status cancelled, and nothing at Stripe.
    const after = rows.map((l) => ({ ...l, status: "cancelled" }));
    expect(classifyLinks(after, NOW).spokenFor).toBe(0);
    expect(sweepableLinks(after, NOW)).toHaveLength(0);
  });

  it("leaves a part-funded guest where they already were, which is not stuck", () => {
    // They were never locked out: only the REMAINDER is claimed, so the 40 they
    // are short is askable today. Refusing them costs them nothing.
    const part = [awaiting({ status: "part_funded", amount: 1440, amount_received: 1400 })];
    expect(canSayNotSent(part[0]).ok).toBe(false);
    expect(classifyLinks(part, NOW).spokenFor).toBeCloseTo(40, 2);
  });
});
