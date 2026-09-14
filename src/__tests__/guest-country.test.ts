/**
 * Where the guest is, decided without asking Stripe.
 *
 * The Pay button is drawn or not drawn before Stripe is ever called, so this
 * has to answer from what NP7 already holds. Measured against production on
 * 2026-09-14: of 111 people holding a live booking, 77 resolved and 34 did not,
 * and 19 of those 34 failed only because `country` holds a NAME and this read
 * two-letter codes. Those spellings are pinned below so the regression cannot
 * come back quietly.
 */
import { describe, it, expect } from "vitest";
import { guestCountry } from "@/lib/payment-methods";

describe("guestCountry", () => {
  it("prefers the billing country, because somebody typed it deliberately", () => {
    expect(guestCountry({ billingCountry: "NL", country: "Germany", phone: "+49 170 1234567" })).toBe("NL");
  });

  it("reads a two-letter code in any case", () => {
    expect(guestCountry({ billingCountry: "de" })).toBe("DE");
  });

  it("reads the country NAMES that are actually in the column today", () => {
    // Every one of these is a real value on a real booker's contact row.
    for (const [text, iso] of [
      ["Netherlands", "NL"], ["Norway", "NO"], ["Turkey", "TR"], ["Brasil", "BR"],
      ["Bulgaria", "BG"], ["Estonia", "EE"], ["Australia", "AU"], ["Bahrain", "BH"],
      ["United States", "US"],
    ] as const) {
      expect(guestCountry({ country: text })).toBe(iso);
    }
  });

  it("takes the country off the end of a one-line address", () => {
    // "Minnesota, USA" is on a real row: people put the country last.
    expect(guestCountry({ country: "Minnesota, USA" })).toBe("US");
  });

  it("falls back to the dial code the guest picked at booking", () => {
    expect(guestCountry({ phone: "+49 170 1234567" })).toBe("DE");
    expect(guestCountry({ phone: "+31 6 12345678" })).toBe("NL");
    // Longest prefix wins, or +351 would read as +3 then Spain.
    expect(guestCountry({ phone: "+351 912 345 678" })).toBe("PT");
  });

  it("says it does not know rather than guessing", () => {
    // 15 bookers have no phone and no country. A wrong guess sends them to a
    // bank list they are not on; "we cannot tell" sends them to the transfer.
    expect(guestCountry({})).toBeNull();
    expect(guestCountry({ country: "Atlantis", phone: "0170 1234567" })).toBeNull();
    // A national number with no country code is exactly the unusable case:
    // 19 bookers have one, and it could be any country on earth.
    expect(guestCountry({ phone: "0031612345678" })).toBeNull();
  });
});
