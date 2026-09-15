/**
 * Which way to pay a guest is offered, country by country.
 *
 * The first half of this file is the claim that matters most on the day the
 * bank transfer ships: WITH THE FLAG OFF, NOTHING CHANGES. It is written as an
 * assertion per country rather than as a sentence in a commit message, because
 * "it defaults off so it is safe" is exactly the kind of thing that is true
 * until somebody adds a branch.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { onlineMethodsFor, canPayOnline, transferCountryFor, guestCountry } from "@/lib/payment-methods";

afterEach(() => vi.unstubAllEnvs());

/** The EEA countries with no rail: everybody this feature is actually for. */
const EEA_NO_RAIL = ["DE", "FR", "ES", "IT", "IE", "PT", "FI", "DK", "SE", "NO", "GR", "HR", "CZ", "HU", "IS", "LI", "BG", "CY", "EE", "LV", "LT", "LU", "MT", "RO", "SK", "SI"];
const RAIL = ["NL", "BE", "AT", "PL"];
const OUTSIDE = ["US", "TR", "GB", "CH"];

describe("with STRIPE_BANK_TRANSFER_ENABLED unset, every country answers exactly as it does today", () => {
  it("an EEA guest with no rail is offered nothing and sent to their invoice", () => {
    for (const c of EEA_NO_RAIL) {
      const m = onlineMethodsFor(c);
      expect(m.kind, c).toBeNull();
      expect(canPayOnline(m), c).toBe(false);
      expect(m.unavailable, c).toMatch(/instant payment isn't available/);
    }
  });
  it("a rail country gets the rail and no card", () => {
    for (const c of RAIL) {
      expect(onlineMethodsFor(c).kind, c).toBe("rail");
      expect(onlineMethodsFor(c).unavailable, c).toBeNull();
    }
  });
  it("outside the EEA the card is the honest offer, because the fee is lawful there", () => {
    for (const c of OUTSIDE) expect(onlineMethodsFor(c).kind, c).toBe("card");
  });
  it("an unknown country gets nothing, and says something true about why", () => {
    const m = onlineMethodsFor(null);
    expect(m.kind).toBeNull();
    expect(m.unavailable).toMatch(/can't tell which instant payments/);
  });
  it("the flag being anything other than the string 'true' is off", () => {
    for (const v of ["1", "yes", "TRUE", ""]) {
      vi.stubEnv("STRIPE_BANK_TRANSFER_ENABLED", v);
      expect(onlineMethodsFor("DE").kind, v).toBeNull();
    }
  });
});

describe("with the flag on, and only then", () => {
  it("the EEA countries with no rail get the transfer", () => {
    vi.stubEnv("STRIPE_BANK_TRANSFER_ENABLED", "true");
    for (const c of EEA_NO_RAIL) {
      const m = onlineMethodsFor(c);
      expect(m.kind, c).toBe("transfer");
      expect(canPayOnline(m), c).toBe(true);
      expect(m.unavailable, c).toBeNull();
    }
  });
  it("leaves the rail countries alone: instant beats three days, so nothing is offered beside it", () => {
    vi.stubEnv("STRIPE_BANK_TRANSFER_ENABLED", "true");
    for (const c of RAIL) expect(onlineMethodsFor(c).kind, c).toBe("rail");
  });
  it("leaves non-EEA guests on the card", () => {
    vi.stubEnv("STRIPE_BANK_TRANSFER_ENABLED", "true");
    for (const c of OUTSIDE) expect(onlineMethodsFor(c).kind, c).toBe("card");
  });
  it("still refuses an unknown country: eu_bank_transfer needs one to pick the IBAN", () => {
    vi.stubEnv("STRIPE_BANK_TRANSFER_ENABLED", "true");
    expect(onlineMethodsFor(null).kind).toBeNull();
  });
});

/**
 * The ordering, which is the one place the two flags meet. DE is a Wero
 * country, so the day Wero is granted Germany must move from the transfer to
 * the rail rather than staying on the slower method because a branch was
 * written in the wrong order.
 */
describe("when both flags are live, the rail wins", () => {
  it("a German is given Wero, not a three-day transfer", () => {
    vi.stubEnv("STRIPE_WERO_ENABLED", "true");
    vi.stubEnv("STRIPE_BANK_TRANSFER_ENABLED", "true");
    expect(onlineMethodsFor("DE").kind).toBe("rail");
    expect(onlineMethodsFor("FR").kind).toBe("rail");
    expect(onlineMethodsFor("BE").kind).toBe("rail");
  });
  it("a Spaniard, whom Wero does not cover, keeps the transfer", () => {
    vi.stubEnv("STRIPE_WERO_ENABLED", "true");
    vi.stubEnv("STRIPE_BANK_TRANSFER_ENABLED", "true");
    expect(onlineMethodsFor("ES").kind).toBe("transfer");
  });
});

describe("which country's IBAN the guest is shown", () => {
  it("is always one of the four Stripe localises", () => {
    for (const c of [...EEA_NO_RAIL, ...RAIL]) {
      expect(["DE", "FR", "IE", "NL"], c).toContain(transferCountryFor(c));
    }
  });
  it("gives the four their own and everybody else the German one", () => {
    expect(transferCountryFor("FR")).toBe("FR");
    expect(transferCountryFor("IE")).toBe("IE");
    expect(transferCountryFor("NL")).toBe("NL");
    expect(transferCountryFor("DE")).toBe("DE");
    for (const c of ["ES", "IT", "PT", "FI", "SE", "GR", "HR"]) expect(transferCountryFor(c), c).toBe("DE");
  });
  it("copes with a missing or oddly cased country rather than throwing", () => {
    expect(transferCountryFor(null)).toBe("DE");
    expect(transferCountryFor("fr")).toBe("FR");
  });
});

describe("where the guest is, when nobody typed it", () => {
  it("prefers a billing country, then a country, then the dial code they picked", () => {
    expect(guestCountry({ billingCountry: "de", country: "NL", phone: "+33 1 23" })).toBe("DE");
    expect(guestCountry({ country: "ES", phone: "+49 170" })).toBe("ES");
    expect(guestCountry({ phone: "+351 91 234" })).toBe("PT");
    expect(guestCountry({ phone: "012345" })).toBeNull();
  });
});
