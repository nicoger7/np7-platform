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

describe("cardRegionFor", () => {
  it("quotes a UK guest the UK band, not the international one", async () => {
    const { cardRegionFor } = await import("@/lib/payment-methods");
    const { cardFee } = await import("@/lib/card-fee");
    expect(cardRegionFor("GB")).toBe("uk");
    // On a 1,440 securing payment the difference is real money, and quoting
    // above cost is what §312a Abs. 4 BGB forbids.
    const uk = cardFee(1440, "uk").fee;
    const intl = cardFee(1440, "intl").fee;
    expect(uk).toBeLessThan(intl);
  });

  it("quotes everywhere else the international band", async () => {
    const { cardRegionFor } = await import("@/lib/payment-methods");
    for (const c of ["US", "CH", "TR", "AU", "BR", null]) expect(cardRegionFor(c)).toBe("intl");
  });
});

describe("guestCountry: each field is tried, not just preferred", () => {
  it("falls through to the contact's country when the billing one is unreadable", () => {
    // It used to shadow: a billing country of "n/a" sent the guest to their
    // phone, past a country field that said exactly where they were.
    expect(guestCountry({ billingCountry: "n/a", country: "Germany" })).toBe("DE");
  });

  it("still lets a readable billing country win", () => {
    expect(guestCountry({ billingCountry: "NL", country: "Germany" })).toBe("NL");
  });
});

describe("guestCountry: two letters is not automatically a country code", () => {
  it("reads UK as GB, because UK is not an ISO code", () => {
    // Two real bookers carry the literal string "UK". It used to pass straight
    // through, match no country anywhere, and land them on the card with a fee.
    expect(guestCountry({ country: "UK" })).toBe("GB");
    expect(guestCountry({ billingCountry: "uk" })).toBe("GB");
  });

  it("still passes an unrecognised two-letter code through", () => {
    expect(guestCountry({ country: "SI" })).toBe("SI");
  });
});

describe("paymentDescription", () => {
  it("does not say NP7 twice", async () => {
    const { paymentDescription } = await import("@/lib/payment-methods");
    // Live on the Stripe bank transfer page: "NP7 NP7 Experience Alaçatı".
    expect(paymentDescription("NP7 Experience Alaçatı", " · Week I", "4611b8e2-28b6-4f43"))
      .toBe("NP7 Experience Alaçatı · Week I · booking 4611B8E2");
  });

  it("adds NP7 when the title does not carry it", async () => {
    const { paymentDescription } = await import("@/lib/payment-methods");
    expect(paymentDescription("Race Clinic", "", "c79f1376-737d"))
      .toBe("NP7 Race Clinic · booking C79F1376");
  });

  it("keeps the card fee note the admin link adds", async () => {
    const { paymentDescription } = await import("@/lib/payment-methods");
    expect(paymentDescription("NP7 Bonaire", " · Week III", "abcdef12-0000", " incl. card fee"))
      .toBe("NP7 Bonaire · Week III · booking ABCDEF12 incl. card fee");
  });
});
