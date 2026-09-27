/**
 * The team-alerts cron runs its sweeps one after another (review, 28 Sep 2026).
 *
 * With Promise.all, all thirteen sweeps sent at once. sendEmail logs the dedupe
 * key before it calls Resend and never retries, so one rate-limited send in
 * that burst was an alert lost for good. Pinned here: no two sweeps overlap,
 * every sweep still runs, and one that throws (even before its first await)
 * does not take the rest with it.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";

const { state, fakeSweep } = vi.hoisted(() => {
  const state = {
    running: 0,
    maxRunning: 0,
    order: [] as string[],
    throwing: new Set<string>(),
  };
  /** A sweep that takes a moment, and records how many ran at the same time.
   *  A "throwing" one throws synchronously, before any await. */
  const fakeSweep = (name: string) => () => {
    if (state.throwing.has(name)) throw new Error(`${name} broke`);
    return (async () => {
      state.running++;
      state.maxRunning = Math.max(state.maxRunning, state.running);
      state.order.push(name);
      await new Promise((r) => setTimeout(r, 2));
      state.running--;
      return { looked: 1, announced: 0, recipients: 1, skipped: [] };
    })();
  };
  return { state, fakeSweep };
});

vi.mock("@/lib/cron-auth", () => ({ cronAuthorized: () => true }));
vi.mock("@/lib/email/team-alerts", () => ({
  sweepNewBookings: fakeSweep("bookings"),
  sweepAddonRequests: fakeSweep("addons"),
  sweepInterestSignups: fakeSweep("waitlist"),
}));
vi.mock("@/lib/email/team-alerts-guests", () => ({
  SIGNATURE_LOOKBACK_MS: 7 * 24 * 3600 * 1000,
  sweepPayments: fakeSweep("payments"),
  sweepGuestRequests: fakeSweep("requests"),
  sweepCancellationRequests: fakeSweep("cancellations"),
  sweepWiderrufe: fakeSweep("widerrufe"),
  sweepAccountSignups: fakeSweep("signups"),
  sweepSignatureApplications: fakeSweep("signature"),
  sweepReviews: fakeSweep("reviews"),
}));
vi.mock("@/lib/email/team-alerts-hardware", () => ({
  sweepHwOrders: fakeSweep("hwOrders"),
  sweepHwReturns: fakeSweep("hwReturns"),
  sweepHwEnquiries: fakeSweep("hwEnquiries"),
}));

import { GET } from "@/app/api/cron/team-alerts/route";

const ALL = [
  "bookings", "addons", "waitlist", "payments", "requests", "cancellations", "widerrufe",
  "signups", "signature", "reviews", "hwOrders", "hwReturns", "hwEnquiries",
];

const run = async () => {
  const res = await GET({} as NextRequest);
  return (await res.json()) as Record<string, unknown>;
};

beforeEach(() => {
  state.running = 0;
  state.maxRunning = 0;
  state.order = [];
  state.throwing = new Set();
});

describe("team-alerts cron", () => {
  it("runs every sweep, never two at once", async () => {
    const body = await run();
    expect(state.maxRunning).toBe(1);
    expect(state.order).toEqual(ALL);
    expect(body.ok).toBe(true);
    for (const k of ALL) expect(body[k], k).toMatchObject({ looked: 1 });
  });

  it("a sweep that throws is reported, and the ones after it still run", async () => {
    state.throwing.add("payments");
    const body = await run();
    expect(body.payments).toEqual({ error: "payments broke" });
    expect(state.order).toEqual(ALL.filter((k) => k !== "payments"));
    expect(state.maxRunning).toBe(1);
  });
});
