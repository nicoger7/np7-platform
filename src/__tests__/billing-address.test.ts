/**
 * The address on the invoice: what is asked for, and what is allowed to be
 * written down.
 *
 * Two rules are pinned here and the second one is the dangerous one.
 *
 *  1. Every Checkout Session NP7 creates ASKS. Stripe's default, "auto", only
 *     collects an address where the payment method insists, which is how 49
 *     invoices over the §14 UStG line ended up with 2 addresses between them.
 *  2. What comes back NEVER OVERWRITES. Somebody in admin may have typed a
 *     correct address by hand, and a guest half-filling a form on the way to
 *     paying must not be able to wipe it. A rule that lives in one function
 *     because the webhook and the trip-page ask both have to obey it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { addressFromStripe, fillGaps, billingAddressIncomplete } from "@/lib/billing-address";
import { createCheckoutSession } from "@/lib/stripe";

// ── 1. The ask ──────────────────────────────────────────────────────────────

describe("the Checkout Session NP7 creates", () => {
  const posted: URLSearchParams[] = [];

  beforeEach(() => {
    posted.length = 0;
    process.env.STRIPE_SECRET_KEY = "sk_test_np7";
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      posted.push(new URLSearchParams(init.body));
      return { ok: true, json: async () => ({ id: "cs_1", url: "https://checkout.stripe.example/x" }) };
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.STRIPE_SECRET_KEY;
  });

  const make = (over: Record<string, unknown> = {}) => createCheckoutSession({
    line: { name: "Bonaire", amountCents: 144_000 },
    successUrl: "https://np-seven.com/ok",
    cancelUrl: "https://np-seven.com/no",
    metadata: { booking_id: "bk1" },
    ...over,
  });

  it("asks for the billing address when told to", async () => {
    await make({ collectBillingAddress: true });

    expect(posted[0].get("billing_address_collection")).toBe("required");
  });

  it("says nothing at all when not told to, so Stripe keeps its own default", async () => {
    await make();

    expect(posted[0].has("billing_address_collection")).toBe(false);
  });
});

// ── 2. Stripe's address, in NP7's four columns ──────────────────────────────

describe("what Stripe hands back", () => {
  it("puts line1 and line2 on the one street line the invoice prints", () => {
    expect(addressFromStripe({ line1: "Graskamp 8", line2: "c/o Prien" }).billing_address)
      .toBe("Graskamp 8, c/o Prien");
  });

  it("keeps the ISO country code as a code, which is what guestCountry reads", () => {
    expect(addressFromStripe({ line1: "Graskamp 8", country: "de" }).billing_country).toBe("DE");
  });

  it("returns nothing for the fields Stripe left blank, so a blank cannot count as an answer", () => {
    const out = addressFromStripe({ line1: "Graskamp 8", line2: "", city: "   ", postal_code: null });

    expect(out).toEqual({ billing_address: "Graskamp 8" });
  });

  it("is empty when there is no address at all, e.g. a session made before this deploy", () => {
    expect(addressFromStripe(null)).toEqual({});
    expect(addressFromStripe(undefined)).toEqual({});
  });
});

// ── 3. Fill gaps, and only gaps ─────────────────────────────────────────────

describe("writing it onto a contact", () => {
  const stripe = addressFromStripe({
    line1: "Rue Neuve 12", city: "Brussels", postal_code: "1000", country: "BE",
  });

  it("fills a contact that has nothing", () => {
    expect(fillGaps({}, stripe)).toEqual({
      billing_address: "Rue Neuve 12", billing_postal_code: "1000",
      billing_city: "Brussels", billing_country: "BE",
    });
  });

  it("NEVER overwrites what somebody typed by hand", () => {
    const byHand = {
      billing_address: "Graskamp 8", billing_postal_code: "24217",
      billing_city: "Schönberg", billing_country: "Germany",
    };

    expect(fillGaps(byHand, stripe)).toEqual({});
  });

  it("replaces a half-filled address outright rather than patching its holes", () => {
    const half = {
      billing_address: "Graskamp 8", billing_postal_code: null,
      billing_city: "", billing_country: "   ",
    };

    // Patching column by column would have married a German street to a
    // Belgian postcode and called the result complete. An address is one
    // thing: an incomplete one loses to a complete one the guest just typed.
    expect(fillGaps(half, stripe)).toEqual({
      billing_address: stripe.billing_address,
      billing_postal_code: "1000",
      billing_city: "Brussels",
      billing_country: "BE",
    });
  });

  it("ignores an incomplete incoming address instead of using it to patch holes", () => {
    const half = { billing_address: "Graskamp 8", billing_postal_code: null, billing_city: "", billing_country: "" };
    expect(fillGaps(half, { billing_city: "Brussels" })).toEqual({});
  });

  it("treats a missing contact row as nothing on file rather than as a reason to stop", () => {
    expect(fillGaps(null, stripe)).toEqual(stripe);
  });
});

// ── 4. Who still gets asked ─────────────────────────────────────────────────

describe("whether the guest is asked on their trip page", () => {
  const full = {
    billing_address: "Graskamp 8", billing_postal_code: "24217",
    billing_city: "Schönberg", billing_country: "DE",
  };

  it("is not asked once all four are there", () => {
    expect(billingAddressIncomplete(full)).toBe(false);
  });

  it("is asked when any one of them is missing: a street with no city is not an address", () => {
    for (const k of Object.keys(full) as (keyof typeof full)[]) {
      expect(billingAddressIncomplete({ ...full, [k]: null })).toBe(true);
    }
  });

  it("is asked when a contact has never had one", () => {
    expect(billingAddressIncomplete(null)).toBe(true);
    expect(billingAddressIncomplete({})).toBe(true);
  });
});
