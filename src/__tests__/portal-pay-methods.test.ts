/**
 * What the member's Pay button actually sends to Stripe, per country.
 *
 * The bank transfer was fully built and nothing called it: the route treated
 * kind 'transfer' exactly like 'rail', so flipping STRIPE_BANK_TRANSFER_ENABLED
 * would have handed a German guest the iDEAL/Bancontact list, a 30-minute
 * clock, no Stripe Customer and therefore no IBAN. Stripe rejects a
 * customer_balance session created with only customer_email, so that guest
 * would have reached a checkout they could not finish, which is worse than the
 * honest refusal they get with the flag off.
 *
 * Stripe is unreachable from here, so createCheckoutSession and stripePost are
 * stubbed and the PARAMETERS are the assertion. Everything else in the path is
 * the real thing, ensureStripeCustomer included: it runs against the fake
 * client, so the idempotency key and the claim-it-if-nobody-has update are
 * exercised rather than described.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { FakeSupabase, type Row } from "./stubs/fake-supabase";
import { cardFee } from "@/lib/card-fee";

type Opts = Record<string, string | number | undefined | Record<string, string> | { name: string; amountCents: number }[]>;

const state = vi.hoisted(() => {
  // hoisted runs before the route module is imported, and RAILS_CONFIG is read
  // once at module load. Set here, the rail branch is tested as production
  // actually runs it (a configuration id, not the hand-named fallback).
  process.env.STRIPE_PMC_RAILS = "pmc_rails_test";
  return {
    db: null as unknown as { from: (t: string) => unknown },
    calls: [] as Record<string, unknown>[],
    posts: [] as { path: string; params: Record<string, string>; key?: string }[],
    customerOk: true,
  };
});

vi.mock("@/lib/supabase", () => ({ createAdminClient: () => state.db }));
vi.mock("@/lib/auth", () => ({ getPortalUser: async () => ({ contactId: "ct1", email: "rider@example.com" }) }));
vi.mock("@/lib/stripe", () => ({
  stripeConfigured: () => true,
  createCheckoutSession: async (opts: Record<string, unknown>) => {
    state.calls.push(opts);
    return { id: "cs_new", url: "https://checkout.stripe.example/x" };
  },
  expireCheckoutSession: async () => ({ ok: true }),
  // What ensureStripeCustomer calls. Failing it is how "Stripe would not give
  // us a Customer" is reproduced, which is the one state a transfer must refuse.
  stripePost: async (path: string, params: Record<string, string>, key?: string) => {
    state.posts.push({ path, params, key });
    return state.customerOk
      ? { ok: true, json: { id: "cus_rider" } }
      : { ok: false, json: { error: { message: "no" } } };
  },
}));

import { POST } from "@/app/api/portal/bookings/[id]/pay/route";

/** A guest in `country`, nothing paid, nothing in flight. */
function setup(country: string, over: { links?: Row[]; contact?: Row } = {}): FakeSupabase {
  const fake = new FakeSupabase({
    exp_bookings: [{
      id: "bk1",
      contact_id: "ct1",
      experience_id: "ex1",
      agreed_price: 1440,
      status: "confirmed",
      covered_by_booking_id: null,
      contacts: { name: "Jan Rider", email: "rider@example.com", phone: null, country, billing_country: null },
      exp_experiences: { title: "Bonaire", currency: "EUR", page_template: "trip" },
      exp_editions: { label: "Week I", currency: "EUR" },
    }],
    // The real contacts row, which is where the Customer id is anchored.
    contacts: [{ id: "ct1", stripe_customer_id: null, ...(over.contact ?? {}) }],
    exp_payments: [],
    exp_booking_addons: [],
    exp_payment_links: over.links ?? [],
  });
  state.db = fake as unknown as { from: (t: string) => unknown };
  return fake;
}

async function pay(amount?: number) {
  const req = { json: async () => (amount != null ? { amount } : {}) } as unknown as NextRequest;
  const res = await POST(req, { params: Promise.resolve({ id: "bk1" }) });
  return { status: res.status, body: (await res.json()) as { url?: string; error?: string; fee?: number; method?: string } };
}

/** The options the route handed Stripe. */
const sent = () => state.calls[0] as unknown as Opts & {
  extraParams?: Record<string, string>;
  lines: { name: string; amountCents: number }[];
  metadata: Record<string, string>;
  paymentIntentMetadata?: Record<string, string>;
  paymentMethodTypes?: string[];
};

beforeEach(() => {
  state.calls = [];
  state.posts = [];
  state.customerOk = true;
  process.env.STRIPE_BANK_TRANSFER_ENABLED = "true";
});
afterEach(() => {
  delete process.env.STRIPE_BANK_TRANSFER_ENABLED;
});

describe("a German guest, with the transfer switched on", () => {
  it("is sent to a bank transfer and not to the rails list", async () => {
    setup("Germany");

    const { status, body } = await pay();

    expect(status).toBe(200);
    expect(body.method).toBe("transfer");
    const o = sent();
    expect(o.extraParams?.["payment_method_types[0]"]).toBe("customer_balance");
    expect(o.extraParams?.["payment_method_options[customer_balance][funding_type]"]).toBe("bank_transfer");
    // The two ways Stripe could still be asked to pick for itself. Either one
    // beside customer_balance is how the rails came back.
    expect(o.paymentMethodTypes).toBeUndefined();
    expect(o.paymentMethodConfiguration).toBeUndefined();
  });

  it("carries the Customer, and the email is not sent beside it", async () => {
    setup("Germany");

    await pay();

    const o = sent();
    // Not a convenience: an IBAN is issued against a Customer's cash balance,
    // and Stripe refuses a session carrying both a Customer and an email.
    expect(o.customer).toBe("cus_rider");
    expect(o.extraParams?.["customer"]).toBe("cus_rider");
    expect(o.customerEmail).toBeUndefined();
    // Keyed on the contact, so a double press cannot mint a second Customer
    // and therefore a second IBAN for one human.
    expect(state.posts[0].path).toBe("/customers");
    expect(state.posts[0].key).toBe("np7-customer:ct1");
  });

  it("reuses the Customer this contact already has rather than making another", async () => {
    setup("Germany", { contact: { stripe_customer_id: "cus_from_before" } });

    await pay();

    expect(sent().customer).toBe("cus_from_before");
    expect(state.posts).toHaveLength(0);
  });

  it("is shown a German IBAN, and a French guest a French one", async () => {
    const key = "payment_method_options[customer_balance][bank_transfer][eu_bank_transfer][country]";
    setup("Germany");
    await pay();
    expect(sent().extraParams?.[key]).toBe("DE");

    state.calls = [];
    setup("France");
    await pay();
    expect(sent().extraParams?.[key]).toBe("FR");

    // Everybody else in the euro area gets the German one: Stripe localises
    // four countries and the invoice they hold already carries German details.
    state.calls = [];
    setup("Italy");
    await pay();
    expect(sent().extraParams?.[key]).toBe("DE");
  });

  it("carries no fee, on the bill or on the row", async () => {
    const fake = setup("Germany");

    const { body } = await pay();

    // §270a BGB bans a surcharge on a SEPA credit transfer outright, so there
    // is no second line item and nothing for the webhook to deduct.
    expect(sent().lines).toHaveLength(1);
    expect(sent().metadata.fee_cents).toBe("0");
    expect(body.fee).toBe(0);
    expect(Number(fake.rows("exp_payment_links")[0].fee)).toBe(0);
  });

  it("gets 23 hours rather than the instant 30 minutes", async () => {
    const fake = setup("Germany");

    await pay();

    const hours = (Number(sent().expiresAt) * 1000 - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(22.5);
    expect(hours).toBeLessThan(23.5);
    // And the row agrees with the session: expires_at is the CHECKOUT's clock.
    const row = fake.rows("exp_payment_links")[0];
    const rowHours = (new Date(String(row.expires_at)).getTime() - Date.now()) / 3_600_000;
    expect(rowHours).toBeGreaterThan(22.5);
  });

  it("tells the webhook exactly what it is, on the session and on the intent", async () => {
    const fake = setup("Germany");

    await pay();

    const linkId = String(fake.rows("exp_payment_links")[0].id);
    const o = sent();
    // The string the webhook's transfer handlers match on. Anything else and
    // the money lands at Stripe and nowhere in the platform.
    expect(o.metadata.kind).toBe("trip_transfer");
    expect(o.metadata.link_id).toBe(linkId);
    // A partial funding is a PI-level event and carries no session at all, so
    // the intent needs its own copy or nothing points it back at the row.
    expect(o.paymentIntentMetadata?.link_id).toBe(linkId);
    expect(fake.rows("exp_payment_links")[0].method).toBe("transfer");
  });

  it("does not congratulate them on a payment that has not happened", async () => {
    setup("Germany");

    await pay();

    // They stay on Stripe's instructions page with their account number; the
    // money moves for days afterwards. `?paid=1` would be a lie either way.
    expect(String(sent().successUrl)).not.toContain("paid=1");
    expect(String(sent().successUrl)).toContain("/account/bookings/bk1");
  });

  it("refuses outright when Stripe will not give us a Customer", async () => {
    state.customerOk = false;
    const fake = setup("Germany");

    const { status, body } = await pay();

    // No Customer, no cash balance, no IBAN: Stripe would reject the session,
    // so the honest answer is the invoice they already hold.
    expect(status).toBe(502);
    expect(body.error).toContain("invoice");
    expect(state.calls).toHaveLength(0);
    // And no half-made claim on the money left behind.
    expect(fake.rows("exp_payment_links")).toHaveLength(0);
  });
});

describe("with the flag off, every country gets the answer it gets today", () => {
  it("the German guest is told to use the details on their invoice", async () => {
    delete process.env.STRIPE_BANK_TRANSFER_ENABLED;
    const fake = setup("Germany");

    const { status, body } = await pay();

    expect(status).toBe(409);
    expect(body.error).toContain("transfer is the way");
    expect(state.calls).toHaveLength(0);
    expect(fake.rows("exp_payment_links")).toHaveLength(0);
  });
});

describe("the other two kinds are untouched", () => {
  it("a Dutch guest still gets the rails configuration and 30 minutes", async () => {
    const fake = setup("Netherlands");

    const { status, body } = await pay();

    expect(status).toBe(200);
    expect(body.method).toBe("rail");
    const o = sent();
    expect(o.paymentMethodConfiguration).toBe("pmc_rails_test");
    expect(o.excludedPaymentMethodTypes).toEqual(["klarna"]);
    expect(o.customerEmail).toBe("rider@example.com");
    expect(o.customer).toBeUndefined();
    expect(o.extraParams).toBeUndefined();
    expect(o.metadata.kind).toBe("trip_card");
    expect(String(o.successUrl)).toContain("paid=1");
    const minutes = (Number(o.expiresAt) * 1000 - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(25);
    expect(minutes).toBeLessThan(31);
    // `method` is deliberately not written on a rail row: the column arrives
    // with migration 247 and naming it would fail the insert on a deployment
    // that has not had it, for a payment that works today.
    expect(fake.rows("exp_payment_links")[0].method).toBeUndefined();
  });

  it("a card guest still gets their band from cardRegionFor", async () => {
    setup("United States");
    await pay();

    let o = sent();
    expect(o.paymentMethodTypes).toEqual(["card"]);
    expect(o.metadata.card_region).toBe("intl");
    expect(o.lines).toHaveLength(2);
    expect(o.lines[1].amountCents).toBe(Math.round(cardFee(1440, "intl").fee * 100));

    // A London guest costs Stripe 2.5 %, not 3.15 %, and §312a Abs. 4 BGB lets
    // a surcharge stand only up to what it actually cost us.
    state.calls = [];
    setup("United Kingdom");
    await pay();
    o = sent();
    expect(o.metadata.card_region).toBe("uk");
    expect(o.lines[1].amountCents).toBe(Math.round(cardFee(1440, "uk").fee * 100));
  });
});

describe("reads that may not answer zero", () => {
  it("refuses rather than reopening a checkout for money already received", async () => {
    const fake = setup("Germany");
    // A booking paid in full. With the read failing, sumReceived of an empty
    // list is 0 and the whole €1,440 reads as owing again.
    fake.rows("exp_payments").push({ booking_id: "bk1", amount: 1440, status: "paid", direction: "in", type: "final" });
    fake.failOn("exp_payments", "select");

    const { status, body } = await pay();

    expect(status).toBe(500);
    expect(body.error).toContain("try again");
    expect(state.calls).toHaveLength(0);
    expect(fake.rows("exp_payment_links")).toHaveLength(0);
  });

  it("and says nothing is left when the read works and the money really is in", async () => {
    const fake = setup("Germany");
    fake.rows("exp_payments").push({ booking_id: "bk1", amount: 1440, status: "paid", direction: "in", type: "final" });

    const { status, body } = await pay();

    expect(status).toBe(409);
    expect(body.error).toContain("Nothing left to pay");
  });

  it("refuses when the add-ons read falls over too", async () => {
    const fake = setup("Germany");
    fake.failOn("exp_booking_addons", "select");

    expect((await pay()).status).toBe(500);
    expect(fake.rows("exp_payment_links")).toHaveLength(0);
  });
});

describe("the billing address is asked for whatever they pay with", () => {
  /*
   * The transfer is the one that matters most and is the easiest to forget: a
   * transfer guest never fills in a card form, so this Checkout page, the one
   * they pass through before Stripe will issue their IBAN, is the only place
   * NP7 will ever be handed their address. Stripe's default, "auto", would ask
   * none of them, which is how 49 invoices over the §14 UStG line ended up
   * carrying 2 addresses between them.
   */
  it.each([
    ["Germany", "transfer"],
    ["Netherlands", "rail"],
    ["United States", "card"],
  ])("%s, paying by %s", async (country) => {
    setup(country);

    const { status } = await pay();

    expect(status).toBe(200);
    expect(sent().collectBillingAddress).toBe(true);
  });
});
