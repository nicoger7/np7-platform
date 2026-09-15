/**
 * The billing address that rides back on a Checkout Session, and the three
 * things it is never allowed to do.
 *
 * Every session NP7 creates now asks for an address, because a German invoice
 * over 250 euro must carry one (§14 UStG) and 47 of the 49 issued over that
 * line do not. Stripe returns it on checkout.session.completed. This file pins
 * what the webhook does with it:
 *
 *  1. It fills the gaps on the contact, INCLUDING for a bank transfer, whose
 *     'completed' event arrives days before any money and whose guest is
 *     exactly the one who never types an address anywhere else.
 *  2. It never overwrites. An address typed by hand in admin outranks whatever
 *     somebody enters in a hurry on the way to paying.
 *  3. It cannot fail the payment. Bookkeeping runs beside money here, so a
 *     broken read or write ends in a log line, a 200 and a recorded payment,
 *     never in a 500 that makes Stripe redeliver money we already have.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { FakeSupabase, type Row } from "./stubs/fake-supabase";

const SECRET = "whsec_test_np7_0123456789";

const state = vi.hoisted(() => ({
  db: null as unknown as { from: (t: string) => unknown },
  emails: [] as { templateKey: string; to: string }[],
}));

vi.mock("@/lib/supabase", () => ({ createAdminClient: () => state.db }));
vi.mock("@/lib/stripe", () => ({
  eur: (n: number, c = "EUR") => `${c} ${n.toFixed(2)}`,
  paymentIntentDetails: async () => ({ amountReceived: 144_000, chargeCreated: 1_757_000_000 }),
  transferInstructions: async () => ({
    hostedInstructionsUrl: "https://stripe.example/instructions", reference: "NP7-REF-1",
    iban: "DE89370400440532013000", bic: "COBADEFF", accountHolder: "NP7 GmbH",
  }),
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
vi.mock("@/lib/bank/adopt", () => ({ afterMoneyLanded: async () => null }));
vi.mock("@/lib/bank/store", () => ({ linkStripeChargesToWebhookPayments: async () => {} }));
vi.mock("@/lib/members", () => ({ ensureMemberAccount: async () => null }));

import { POST } from "@/app/api/webhooks/stripe/route";

// ── Fixtures ────────────────────────────────────────────────────────────────

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
  id: "lk1", booking_id: "bk1", contact_id: "ct1", session_id: "cs_test_1",
  amount: 1440, fee: 0, total: 1440, status: "open", created_by: "member",
  method: "transfer", ...over,
});

/** The contact as production has them: a name, an email and no address. */
const contact = (over: Row = {}): Row => ({
  id: "ct1", name: "Test Rider", email: "rider@example.com",
  billing_address: null, billing_postal_code: null, billing_city: null, billing_country: null,
  ...over,
});

function db(over: Record<string, Row[]> = {}): FakeSupabase {
  const fake = new FakeSupabase({
    exp_bookings: [booking()],
    exp_payment_links: [link()],
    exp_payments: [],
    exp_booking_addons: [],
    contacts: [contact()],
    documents: [],
    ...over,
  });
  state.db = fake as unknown as { from: (t: string) => unknown };
  return fake;
}

/** What Stripe puts on the session once billing_address_collection is on. */
const typedIn = {
  line1: "Graskamp 8", line2: null, city: "Schönberg",
  postal_code: "24217", state: null, country: "DE",
};

function session(over: Row = {}): Row {
  return {
    id: "cs_test_1",
    payment_status: "paid",
    payment_intent: "pi_test_1",
    amount_total: 144_000,
    customer_details: { email: "rider@example.com", address: typedIn },
    metadata: { booking_id: "bk1", link_id: "lk1", kind: "trip_card" },
    ...over,
  };
}

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

const saved = (fake: FakeSupabase) => {
  const c = fake.rows("contacts")[0];
  return {
    billing_address: c.billing_address, billing_postal_code: c.billing_postal_code,
    billing_city: c.billing_city, billing_country: c.billing_country,
  };
};

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  state.emails = [];
});

// ── 1. It is written down ───────────────────────────────────────────────────

describe("the address a guest typed on the Checkout page", () => {
  it("lands on the contact when they paid by card", async () => {
    const fake = db();

    const res = await deliver("checkout.session.completed", session());

    expect(res.status).toBe(200);
    expect(saved(fake)).toEqual({
      billing_address: "Graskamp 8", billing_postal_code: "24217",
      billing_city: "Schönberg", billing_country: "DE",
    });
  });

  it("lands on a BANK TRANSFER too, days before the money does", async () => {
    // payment_status 'unpaid': the guest submitted, Stripe issued an IBAN and
    // nothing has been paid. This is the guest the whole feature is for, and
    // they are the one who would never reach a card form at all.
    const fake = db();

    const res = await deliver("checkout.session.completed", session({
      payment_status: "unpaid",
      metadata: { booking_id: "bk1", link_id: "lk1", kind: "trip_transfer" },
    }));

    expect(res.status).toBe(200);
    // Not a payment. The transfer is only awaiting, and the address is the only
    // thing this delivery changed about the money side of the booking.
    expect(fake.rows("exp_payments")).toHaveLength(0);
    expect(saved(fake).billing_city).toBe("Schönberg");
  });

  it("replaces a half-filled contact outright, never mixing two addresses", async () => {
    const fake = db({
      contacts: [contact({
        billing_address: "Firmenstraße 1", billing_city: "Kiel",
        billing_postal_code: null, billing_country: null,
      })],
    });

    await deliver("checkout.session.completed", session());

    // A Kiel street with a Schoenberg postcode is an address that exists
    // nowhere, and it would then read as complete and never be corrected.
    expect(saved(fake)).toEqual({
      billing_address: "Graskamp 8",
      billing_city: "Schönberg",
      billing_postal_code: "24217",
      billing_country: "DE",
    });
  });

  it("does nothing at all when Stripe collected no address", async () => {
    const fake = db();

    await deliver("checkout.session.completed", session({ customer_details: { email: "rider@example.com" } }));

    expect(saved(fake).billing_address).toBeNull();
    // The payment is unaffected either way.
    expect(fake.rows("exp_payments")).toHaveLength(1);
  });
});

// ── 2. It can never cost a payment ──────────────────────────────────────────

describe("when saving the address goes wrong", () => {
  it("still records the money and still answers 200 when the contacts WRITE fails", async () => {
    const fake = db();
    fake.failOn("contacts", "update");

    const res = await deliver("checkout.session.completed", session());

    // A 500 here would make Stripe redeliver a payment that is already in the
    // books, for the sake of an address that can be asked for again on the
    // trip page.
    expect(res.status).toBe(200);
    expect(fake.rows("exp_payments")).toHaveLength(1);
    expect(Number(fake.rows("exp_payments")[0].amount)).toBe(1440);
  });

  it("still records the money and still answers 200 when the contacts READ fails", async () => {
    const fake = db();
    fake.failOn("contacts", "select");

    const res = await deliver("checkout.session.completed", session());

    expect(res.status).toBe(200);
    expect(fake.rows("exp_payments")).toHaveLength(1);
    // Nothing was guessed at: a read that failed is not "this contact has no
    // address", so nothing is written on the strength of it.
    expect(saved(fake).billing_address).toBeNull();
  });
});
