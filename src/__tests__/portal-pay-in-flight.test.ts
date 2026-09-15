/**
 * The member's own Pay button, and the three kinds of "something is already
 * live on this booking" it has to tell apart.
 *
 *   their own open checkout  → cancelled and replaced. They closed the tab;
 *                              refusing them locks them out of paying.
 *   a transfer they sent     → refused, and told why. Starting a second one
 *                              means somebody gets a refund by hand.
 *   a link NP7 sent them     → refused, and pointed at that link.
 *
 * The middle case is the one the old filter could not see at all: on day two a
 * submitted transfer is 'awaiting' and its checkout URL has expired, so
 * `status = 'open' AND expires_at > now()` found nothing and happily opened a
 * second payment for the same money.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { FakeSupabase, type Row } from "./stubs/fake-supabase";

const state = vi.hoisted(() => ({ db: null as unknown as { from: (t: string) => unknown }, sessions: 0, expired: [] as string[] }));

vi.mock("@/lib/supabase", () => ({ createAdminClient: () => state.db }));
vi.mock("@/lib/auth", () => ({ getPortalUser: async () => ({ contactId: "ct1", email: "rider@example.com" }) }));
vi.mock("@/lib/stripe", () => ({
  stripeConfigured: () => true,
  createCheckoutSession: async () => ({ id: `cs_new_${++state.sessions}`, url: "https://checkout.stripe.example/x" }),
  expireCheckoutSession: async (id: string) => {
    state.expired.push(id);
    return { ok: true };
  },
}));

import { POST } from "@/app/api/portal/bookings/[id]/pay/route";

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

const link = (over: Row): Row => ({
  booking_id: "bk1",
  amount: 1440,
  status: "open",
  created_by: "member",
  session_id: "cs_old",
  expires_at: hoursFromNow(0.4),
  amount_received: 0,
  funds_due_by: null,
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
      covered_by_booking_id: null,
      // A Dutch guest, so iDEAL is on offer and the route gets as far as the
      // link lifecycle without needing the transfer flag switched on.
      contacts: { email: "rider@example.com", phone: "+31612345678", country: "Netherlands", billing_country: null },
      exp_experiences: { title: "Bonaire", currency: "EUR", page_template: "trip" },
      exp_editions: { label: "Week I", currency: "EUR" },
    }],
    exp_payments: [],
    exp_booking_addons: [],
    exp_payment_links: links,
  });
  state.db = fake as unknown as { from: (t: string) => unknown };
  return fake;
}

async function pay(amount?: number) {
  const req = { json: async () => (amount != null ? { amount } : {}) } as unknown as NextRequest;
  const res = await POST(req, { params: Promise.resolve({ id: "bk1" }) });
  return { status: res.status, body: (await res.json()) as { url?: string; error?: string } };
}

beforeEach(() => {
  state.sessions = 0;
  state.expired = [];
});

describe("a transfer the guest has already sent", () => {
  it("is not something to pay a second time, however dead its checkout URL", async () => {
    const fake = setup([link({ id: "moving", status: "awaiting", expires_at: hoursFromNow(-49), funds_due_by: daysFromNow(11) })]);

    const { status, body } = await pay();

    expect(status).toBe(409);
    expect(body.error).toContain("still waiting for the €1,440 transfer you started");
    // Nothing new, and the row they are transferring against is untouched.
    expect(fake.rows("exp_payment_links")).toHaveLength(1);
    expect(fake.rows("exp_payment_links")[0].status).toBe("awaiting");
    expect(state.expired).toEqual([]);
  });

  it("is never cancelled to make room, part-funded included", async () => {
    const fake = setup([link({ id: "short", status: "part_funded", amount_received: 1400, funds_due_by: daysFromNow(-30) })]);

    expect((await pay()).status).toBe(409);
    expect(fake.rows("exp_payment_links")[0].status).toBe("part_funded");
  });

  it("stops standing in the way once nothing has arrived for two weeks", async () => {
    const fake = setup([link({ id: "abandoned", status: "awaiting", amount_received: 0, funds_due_by: daysFromNow(-1) })]);

    const { status, body } = await pay();

    expect(status).toBe(200);
    expect(body.url).toBeTruthy();
    expect(fake.rows("exp_payment_links").find((l) => l.id === "abandoned")?.status).toBe("expired");
  });
});

describe("the other two live rows behave as they always have", () => {
  it("the guest's own open checkout is closed at Stripe and replaced", async () => {
    const fake = setup([link({ id: "mine" })]);

    const { status, body } = await pay();

    expect(status).toBe(200);
    expect(body.url).toBeTruthy();
    expect(state.expired).toEqual(["cs_old"]);
    expect(fake.rows("exp_payment_links").find((l) => l.id === "mine")?.status).toBe("cancelled");
    expect(fake.rows("exp_payment_links")).toHaveLength(2);
  });

  it("a link NP7 sent is left alone, and the guest is pointed at it", async () => {
    setup([link({ id: "theirs", created_by: "admin" })]);

    const { status, body } = await pay();

    expect(status).toBe(409);
    expect(body.error).toContain("already sent you a payment link");
    expect(state.expired).toEqual([]);
  });
});

describe("reading the rows at all", () => {
  it("falls back to the pre-247 columns rather than failing a payment that works today", async () => {
    const fake = setup([link({ id: "mine" })]);
    fake.failOn("exp_payment_links", "select", { times: 1, message: `column "funds_due_by" does not exist` });

    const { status, body } = await pay();

    expect(status).toBe(200);
    expect(body.url).toBeTruthy();
  });

  it("refuses to start a payment when it cannot see what is already live", async () => {
    const fake = setup([link({ id: "mine" })]);
    fake.failOn("exp_payment_links", "select");

    const { status, body } = await pay();

    expect(status).toBe(500);
    expect(body.error).toContain("try again");
    // The important half: no second claim on the same money was created.
    expect(fake.rows("exp_payment_links")).toHaveLength(1);
  });
});
