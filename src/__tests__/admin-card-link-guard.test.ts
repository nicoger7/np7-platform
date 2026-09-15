/**
 * The admin's double-pay guard, at the desk where it gets used.
 *
 * The case it exists for: a booking owes €1,440, the guest presses Pay at 14:00
 * and is sitting on Stripe's page with it, somebody in admin makes a card link
 * for the same €1,440 at 14:05 because the guest rang up. Two live claims on
 * one debt, and if both are paid the difference goes back by hand.
 *
 * The guard read `status = 'open' AND expires_at > now()`, which sees neither a
 * bank transfer the guest submitted days ago (its row is 'awaiting' and its
 * CHECKOUT died at 23 hours while the money is still moving) nor, through the
 * narrow total, the member's own checkout open in front of them. It read 0
 * against a live €1,440 and let the second request through.
 *
 * Stripe is not reachable from here, so the checkout call is stubbed. The guard
 * itself, and the classification it now leans on, are the real thing.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { FakeSupabase, type Row } from "./stubs/fake-supabase";

const state = vi.hoisted(() => ({ db: null as unknown as { from: (t: string) => unknown }, sessions: 0 }));

vi.mock("@/lib/supabase", () => ({ createAdminClient: () => state.db }));
vi.mock("@/lib/admin-auth", () => ({
  requireAdminGate: async () => null,
  getRequestMember: async () => ({ id: "staff1" }),
  getRequestAccess: async () => ({ role: "owner" }),
}));
vi.mock("@/lib/access", () => ({ effectiveCanSeeField: () => true }));
vi.mock("@/lib/stripe", () => ({
  stripeConfigured: () => true,
  createCheckoutSession: async () => ({ id: `cs_new_${++state.sessions}`, url: "https://checkout.stripe.example/x" }),
  expireCheckoutSession: async () => ({ ok: true }),
}));

import { POST } from "@/app/api/admin/bookings/[id]/payments/card-link/route";

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

const link = (over: Row): Row => ({
  booking_id: "bk1",
  amount: 1440,
  status: "open",
  created_by: "member",
  expires_at: hoursFromNow(1),
  ...over,
});

function setup(links: Row[]): FakeSupabase {
  const fake = new FakeSupabase({
    exp_bookings: [{
      id: "bk1",
      contact_id: "ct1",
      experience_id: "ex1",
      agreed_price: 1440,
      status: "confirmed",
      contacts: { name: "Test Rider", email: "rider@example.com" },
      exp_experiences: { title: "Bonaire", currency: "EUR", page_template: "trip" },
      exp_editions: { label: "Week I", date_start: "2026-11-14", date_end: "2026-11-21", currency: "EUR" },
    }],
    exp_payments: [],
    exp_booking_addons: [],
    exp_payment_links: links,
  });
  state.db = fake as unknown as { from: (t: string) => unknown };
  return fake;
}

/** The whole booking's balance, asked for by an admin. */
async function askFor(amount: number) {
  const req = { json: async () => ({ amount, cardRegion: "eea" }) } as unknown as NextRequest;
  const res = await POST(req, { params: Promise.resolve({ id: "bk1" }) });
  return { status: res.status, body: (await res.json()) as { error?: string; ok?: boolean } };
}

beforeEach(() => {
  state.sessions = 0;
});

describe("money already in flight is money already spoken for", () => {
  it("refuses a second link while the member's own checkout is open", async () => {
    const fake = setup([link({ id: "members-own" })]);

    const { status, body } = await askFor(1440);

    expect(status).toBe(400);
    expect(body.error).toContain("€1,440.00 of it is already on a live payment");
    // Nothing was created, so there is still exactly one claim on the money.
    expect(fake.rows("exp_payment_links")).toHaveLength(1);
  });

  it("refuses a second link while a transfer the guest submitted is still moving", async () => {
    // Day three: the checkout URL died long ago, the money has not landed yet.
    setup([link({ id: "moving", status: "awaiting", expires_at: hoursFromNow(-49) })]);

    const { status, body } = await askFor(1440);

    expect(status).toBe(400);
    expect(body.error).toContain("already on a live payment");
  });

  it("counts a part-funded transfer too", async () => {
    setup([link({ id: "short", status: "part_funded", amount_received: 1400, expires_at: hoursFromNow(-72) })]);

    const { status } = await askFor(1440);

    expect(status).toBe(400);
  });

  it("still counts an admin's own link, exactly as it always did", async () => {
    setup([link({ id: "theirs", created_by: "admin" })]);

    const { status } = await askFor(1440);

    expect(status).toBe(400);
  });

  it("leaves room for the part that is NOT spoken for", async () => {
    setup([link({ id: "members-own", amount: 500 })]);

    const asked = await askFor(940);

    expect(asked.status).toBe(200);
    expect(asked.body.ok).toBe(true);
  });
});

describe("what does not stand in the way", () => {
  it("a dead checkout nobody can pay", async () => {
    const fake = setup([link({ id: "dead", expires_at: hoursFromNow(-1) })]);

    const { status, body } = await askFor(1440);

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(fake.rows("exp_payment_links")).toHaveLength(2);
  });

  it("a cancelled, expired, failed or already paid row", async () => {
    for (const status of ["cancelled", "expired", "failed", "paid"]) {
      setup([link({ id: `was-${status}`, status })]);
      expect((await askFor(1440)).status, status).toBe(200);
    }
  });

  it("and with nothing live at all, the link is made", async () => {
    const fake = setup([]);

    const { status, body } = await askFor(1440);

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const created = fake.rows("exp_payment_links")[0];
    expect(Number(created.amount)).toBe(1440);
    expect(created.session_id).toBe("cs_new_1");
  });
});
