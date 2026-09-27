/**
 * The trip page asks a guest we can't place for their country, and that answer
 * has to switch on paying online. John Fisher had no country, no phone and so
 * no way to pay by card (Simona, 27 Sep 2026); the fix is a dropdown, and it is
 * only a fix if every name the dropdown can write reads back as a country.
 */
import { describe, it, expect } from "vitest";
import { countryOptions, isoFromCountryName } from "@/lib/countries";
import { guestCountry, onlineMethodsFor, canPayOnline } from "@/lib/payment-methods";

describe("the country dropdown on the trip page", () => {
  it("offers real countries only, not Intl's pseudo regions", () => {
    const codes = new Set(countryOptions().map((c) => c.code));
    expect(codes.has("US")).toBe(true);
    expect(codes.has("CW")).toBe(true); // Curaçao, next door to Bonaire
    for (const junk of ["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ"]) expect(codes.has(junk)).toBe(false);
  });

  it("every name it can write reads back as that country", () => {
    for (const { code, name } of countryOptions()) {
      expect(guestCountry({ billingCountry: name }), name).toBe(code);
    }
  });

  it("names outside the hand-written list now resolve too", () => {
    expect(isoFromCountryName("Mexico")).toBe("MX");
    expect(guestCountry({ billingCountry: "Curaçao" })).toBe("CW");
  });

  it("once saved, every guest has some way to pay online", () => {
    // Card outside the EEA, a rail or a transfer inside it. The transfer is
    // behind a flag, so the EEA half is asked with it on, as in production.
    const prev = process.env.STRIPE_BANK_TRANSFER_ENABLED;
    process.env.STRIPE_BANK_TRANSFER_ENABLED = "true";
    try {
      for (const { name } of countryOptions()) {
        expect(canPayOnline(onlineMethodsFor(guestCountry({ billingCountry: name }))), name).toBe(true);
      }
    } finally {
      process.env.STRIPE_BANK_TRANSFER_ENABLED = prev;
    }
  });

  it("an unknown guest still gets nothing, which is why the page asks", () => {
    expect(guestCountry({})).toBeNull();
    expect(canPayOnline(onlineMethodsFor(null))).toBe(false);
  });
});
