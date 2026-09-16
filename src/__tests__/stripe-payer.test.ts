/**
 * Sven Heinsohn's EUR 2,895 landed in Payments with a dash where the payer
 * should be. The money came through a virtual IBAN, so there is no card and
 * therefore no `billing_details.name` — that field is the CARDHOLDER, and it is
 * empty for every payment that is not a card. Two older charges had the same
 * gap and one of them stored a single space, which reads as a name and is not.
 */
import { describe, it, expect } from "vitest";
import { __testing } from "@/lib/bank/stripe-feed";

const { payerOf } = __testing;

describe("who paid", () => {
  it("uses the cardholder when there is one", () => {
    expect(payerOf({ billing_details: { name: "JM van der Meij", email: "j@x.com" } })).toBe("JM van der Meij");
  });

  it("falls back to the Stripe customer for a bank transfer", () => {
    expect(payerOf({
      billing_details: { name: null, email: null },
      customer: { id: "cus_1", name: "Sven Heinsohn", email: "sven@x.com" },
    })).toBe("Sven Heinsohn");
  });

  it("treats a blank name as no name", () => {
    expect(payerOf({ billing_details: { name: "   " }, customer: { name: "Real Person" } })).toBe("Real Person");
    expect(payerOf({ billing_details: { name: "" }, receipt_email: "k@x.com" })).toBe("k@x.com");
  });

  it("would rather show an email than a dash", () => {
    expect(payerOf({ billing_details: { name: null, email: "nicolaifaber@web.de" } })).toBe("nicolaifaber@web.de");
    expect(payerOf({ receipt_email: "istari500@yahoo.com" })).toBe("istari500@yahoo.com");
  });

  it("says nothing when it knows nothing, rather than inventing one", () => {
    expect(payerOf({})).toBeNull();
    expect(payerOf({ billing_details: { name: " " }, customer: "cus_unexpanded" })).toBeNull();
  });
});
