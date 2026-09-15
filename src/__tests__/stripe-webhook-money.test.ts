/**
 * What the Stripe webhook does when something goes wrong, which is the only
 * part of it that has ever cost anybody money.
 *
 * Three faults are pinned here, and all three share one shape: a failure that
 * ended in a 200. Stripe treats a 200 as "handled" and never sends the event
 * again, so every one of them is permanent the moment it happens.
 *
 *   1. A read that FAILED looked exactly like "this session is not ours", and
 *      both returned quietly. The payment was never recorded and nothing said
 *      so.
 *   2. Money landing on a cancelled booking was recorded AND invoiced: a real
 *      gapless tax invoice, emailed with "you're in" copy, to somebody who had
 *      cancelled. §14 UStG makes that expensive to unwind.
 *   3. A failed state write was logged and the guest was sent the IBAN anyway,
 *      against a link row still sitting at 'open' that nothing counts and
 *      nothing sweeps.
 *
 * The Stripe API is not reachable from here, so the Stripe module is stubbed at
 * its edge (the two calls that fetch a PaymentIntent) and everything between the
 * signature check and the database is the real route.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { FakeSupabase, type Row } from "./stubs/fake-supabase";

const SECRET = "whsec_test_np7_0123456789";

const state = vi.hoisted(() => ({
  db: null as unknown as { from: (t: string) => unknown },
  emails: [] as { templateKey: string; to: string }[],
  invoiced: [] as string[],
  intent: { amountReceived: 144_000, chargeCreated: 1_757_000_000 } as { amountReceived: number | null; chargeCreated: number | null } | null,
  instructions: { hostedInstructionsUrl: "https://stripe.example/instructions", reference: "NP7-REF-1", iban: "DE89370400440532013000", bic: "COBADEFF", accountHolder: "NP7 GmbH" } as Record<string, string> | null,
}));

vi.mock("@/lib/supabase", () => ({ createAdminClient: () => state.db }));
vi.mock("@/lib/stripe", () => ({
  eur: (n: number, c = "EUR") => `${c} ${n.toFixed(2)}`,
  paymentIntentDetails: async () => state.intent,
  transferInstructions: async () => state.instructions,
  cardForPaymentIntent: async () => null,
  refundPaymentIntent: async () => ({ ok: true }),
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async (m: { templateKey: string; to: string }) => {
    state.emails.push(m);
    return { status: "sent" };
  },
}));
vi.mock("@/lib/invoices/generate", () => ({
  generateDocument: async () => ({ id: "doc1" }),
  settleInvoices: async () => {},
}));
vi.mock("@/lib/bank/adopt", () => ({
  afterMoneyLanded: async (id: string) => {
    state.invoiced.push(id);
    return null;
  },
}));
vi.mock("@/lib/bank/store", () => ({ linkStripeChargesToWebhookPayments: async () => {} }));
vi.mock("@/lib/members", () => ({ ensureMemberAccount: async () => null }));

import { POST } from "@/app/api/webhooks/stripe/route";

// ── Fixtures ────────────────────────────────────────────────────────────────

/** The booking this whole feature was built against: €1,440 securing payment. */
const booking = (over: Row = {}): Row => ({
  id: "bk1",
  contact_id: "ct1",
  experience_id: "ex1",
  status: "confirmed",
  agreed_price: 1440,
  deposit_received: false,
  downpayment_received: false,
  final_payment_received: false,
  created_at: "2026-06-01T00:00:00Z",
  exp_editions: { deposit: 0, date_start: "2026-11-14", date_end: "2026-11-21" },
  exp_packages: { deposit: 0, deposit_refund_days: 14, downpayment_percent: 50, final_days_before: 60 },
  exp_experiences: { title: "Bonaire", currency: "EUR" },
  contacts: { name: "Test Rider", email: "rider@example.com" },
  ...over,
});

const link = (over: Row = {}): Row => ({
  id: "lk1",
  booking_id: "bk1",
  contact_id: "ct1",
  session_id: "cs_test_1",
  amount: 1440,
  fee: 0,
  total: 1440,
  status: "open",
  created_by: "member",
  method: "transfer",
  ...over,
});

function db(over: Record<string, Row[]> = {}): FakeSupabase {
  const fake = new FakeSupabase({
    exp_bookings: [booking()],
    exp_payment_links: [link()],
    exp_payments: [],
    exp_booking_addons: [],
    documents: [],
    ...over,
  });
  state.db = fake as unknown as { from: (t: string) => unknown };
  return fake;
}

function session(over: Row = {}): Row {
  return {
    id: "cs_test_1",
    payment_status: "paid",
    payment_intent: "pi_test_1",
    amount_total: 144_000,
    metadata: { booking_id: "bk1", link_id: "lk1", kind: "trip_card" },
    ...over,
  };
}

/** A properly signed delivery, so the route's own signature check runs. */
async function deliver(type: string, object: Row) {
  const body = JSON.stringify({ type, created: 1_757_000_100, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex");
  const req = {
    text: async () => body,
    headers: new Headers({ "stripe-signature": `t=${t},v1=${v1}` }),
  } as unknown as NextRequest;
  return POST(req);
}

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  state.emails = [];
  state.invoiced = [];
  state.intent = { amountReceived: 144_000, chargeCreated: 1_757_000_000 };
  state.instructions = { hostedInstructionsUrl: "https://stripe.example/instructions", reference: "NP7-REF-1", iban: "DE89370400440532013000", bic: "COBADEFF", accountHolder: "NP7 GmbH" };
});

// ── 1. A read that failed is not a no-match ─────────────────────────────────

describe("a read that ERRORED is never answered with 200", () => {
  it("refuses the delivery when the link read fails on the transfer path", async () => {
    const fake = db();
    fake.failOn("exp_payment_links", "select");

    const res = await deliver("checkout.session.completed", session({ payment_status: "unpaid", metadata: { booking_id: "bk1", link_id: "lk1", kind: "trip_transfer" } }));

    // 500, because Stripe must send this again. 200 would end the story here.
    expect(res.status).toBe(500);
    expect(state.emails).toHaveLength(0);
    expect(fake.rows("exp_payment_links")[0].status).toBe("open");
  });

  it("refuses the delivery when the link read fails on the CARD path, which is live today", async () => {
    const fake = db();
    fake.failOn("exp_payment_links", "select");

    const res = await deliver("checkout.session.completed", session());

    expect(res.status).toBe(500);
    expect(fake.rows("exp_payments")).toHaveLength(0);
  });

  it("refuses the delivery when the booking read fails, money in hand and nowhere to put it", async () => {
    const fake = db();
    fake.failOn("exp_bookings", "select");

    const res = await deliver("checkout.session.completed", session());

    expect(res.status).toBe(500);
    expect(fake.rows("exp_payments")).toHaveLength(0);
  });

  it("but a read that SUCCEEDED and found nothing is a genuine no-match, and is not retried", async () => {
    // The link belongs to another booking: the metadata does not get to decide.
    const fake = db({ exp_payment_links: [link({ booking_id: "someone_else" })] });

    const res = await deliver("checkout.session.completed", session());

    expect(res.status).toBe(200);
    expect(fake.rows("exp_payments")).toHaveLength(0);
    expect(state.invoiced).toEqual([]);
  });
});

// ── 2. Money on a cancelled booking ─────────────────────────────────────────

describe("a transfer that lands after the booking was cancelled", () => {
  const late = () => session({ metadata: { booking_id: "bk1", link_id: "lk1", kind: "trip_transfer" } });

  it("records the money: it really arrived, and somebody is owed a decision about it", async () => {
    const fake = db({ exp_bookings: [booking({ status: "cancelled" })] });

    const res = await deliver("checkout.session.async_payment_succeeded", late());

    expect(res.status).toBe(200);
    const pays = fake.rows("exp_payments");
    expect(pays).toHaveLength(1);
    expect(Number(pays[0].amount)).toBe(1440);
    expect(pays[0].booking_id).toBe("bk1");
  });

  it("does NOT invoice it: no real tax invoice, no 'you're in' mail to somebody who cancelled", async () => {
    db({ exp_bookings: [booking({ status: "cancelled" })] });

    await deliver("checkout.session.async_payment_succeeded", late());

    expect(state.invoiced).toEqual([]);
  });

  it("says so on the payment row itself, where the money is, not only in a log line", async () => {
    const fake = db({ exp_bookings: [booking({ status: "lost" })] });

    await deliver("checkout.session.async_payment_succeeded", late());

    expect(String(fake.rows("exp_payments")[0].notes)).toContain("ARRIVED AFTER THE BOOKING WAS LOST");
    expect(String(fake.rows("exp_payment_links")[0].note)).toContain("Recorded, not applied");
  });

  it("never reopens the booking", async () => {
    const fake = db({ exp_bookings: [booking({ status: "cancelled" })] });

    await deliver("checkout.session.async_payment_succeeded", late());

    const bk = fake.rows("exp_bookings")[0];
    expect(bk.status).toBe("cancelled");
    expect(bk.downpayment_received).toBe(false);
    expect(bk.final_payment_received).toBe(false);
  });

  it("and the same money on a LIVE booking is invoiced exactly as before", async () => {
    const fake = db();

    await deliver("checkout.session.async_payment_succeeded", late());

    expect(state.invoiced).toEqual(["bk1"]);
    expect(fake.rows("exp_bookings")[0].status).toBe("paid");
  });
});

// ── 3. The IBAN mail and the state write travel together ────────────────────

describe("the guest is only told where to send money once we have written it down", () => {
  const submitted = () => session({ payment_status: "unpaid", metadata: { booking_id: "bk1", link_id: "lk1", kind: "trip_transfer" } });

  it("sends the bank details and marks the link awaiting", async () => {
    const fake = db();

    const res = await deliver("checkout.session.completed", submitted());

    expect(res.status).toBe(200);
    const row = fake.rows("exp_payment_links")[0];
    expect(row.status).toBe("awaiting");
    expect(row.transfer_reference).toBe("NP7-REF-1");
    expect(row.iban_last4).toBe("3000");
    expect(state.emails.map((m) => m.templateKey)).toEqual(["transfer_instructions"]);
  });

  it("sends NOTHING when the state write fails, and asks Stripe to try again", async () => {
    const fake = db();
    fake.failOn("exp_payment_links", "update");

    const res = await deliver("checkout.session.completed", submitted());

    expect(res.status).toBe(500);
    expect(state.emails).toHaveLength(0);
    // Still open: nothing anywhere claims this guest was given an account number.
    expect(fake.rows("exp_payment_links")[0].status).toBe("open");
  });

  it("does not hand out an IBAN against a link that is already paid", async () => {
    db({ exp_payment_links: [link({ status: "paid" })] });

    const res = await deliver("checkout.session.completed", submitted());

    expect(res.status).toBe(200);
    expect(state.emails).toHaveLength(0);
  });

  it("a redelivery re-sends the details and changes nothing else", async () => {
    const fake = db({ exp_payment_links: [link({ status: "awaiting", transfer_reference: "NP7-REF-1" })] });

    const res = await deliver("checkout.session.completed", submitted());

    expect(res.status).toBe(200);
    // The mail carries a dedupeKey, so the second one is suppressed downstream.
    expect(state.emails.map((m) => m.templateKey)).toEqual(["transfer_instructions"]);
    expect(fake.rows("exp_payment_links")[0].status).toBe("awaiting");
  });
});
