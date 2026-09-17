/**
 * Who a German invoice is made out to.
 *
 * Sec 14 UStG wants the recipient's full name and address on any invoice over
 * 250 euro. Billing addresses have been collected from Stripe checkout since
 * 15 Sep and print correctly, but a guest whose company pays had nowhere to put
 * the company, so the invoice carried a person's name for a business purchase.
 */
import { describe, it, expect } from "vitest";
import { buyerAddress } from "@/lib/invoices/template";

const base = {
  name: "Wilfred Wagt",
  email: "w@example.com",
  billingAddress: "Waldburgstraße 55",
  billingPostalCode: "6714",
  billingCity: "Nüziders",
  billingCountry: "Austria",
};

describe("the invoice recipient", () => {
  it("is the person, with their address, when no company is set", () => {
    expect(buyerAddress({ ...base, companyName: null, vatId: null }))
      .toBe("Wilfred Wagt\nWaldburgstraße 55\n6714 Nüziders\nAustria");
  });

  it("is the COMPANY when one is set, with the person on an attention line", () => {
    expect(buyerAddress({ ...base, companyName: "Wagt Consulting GmbH", vatId: "ATU12345678" }))
      .toBe("Wagt Consulting GmbH\nAttn. Wilfred Wagt\nWaldburgstraße 55\n6714 Nüziders\nAustria");
  });

  it("does not print an empty attention line when only a company is known", () => {
    expect(buyerAddress({ ...base, name: null, companyName: "Wagt Consulting GmbH" }))
      .toBe("Wagt Consulting GmbH\nWaldburgstraße 55\n6714 Nüziders\nAustria");
  });

  it("ignores whitespace typed into the company field", () => {
    expect(buyerAddress({ ...base, companyName: "   " })).toBe("Wilfred Wagt\nWaldburgstraße 55\n6714 Nüziders\nAustria");
  });

  it("still gives a recipient when the address is missing, so the name is never lost", () => {
    expect(buyerAddress({ name: "Ann", email: null, companyName: null, vatId: null, billingAddress: null, billingPostalCode: null, billingCity: null, billingCountry: null }))
      .toBe("Ann");
  });
});
