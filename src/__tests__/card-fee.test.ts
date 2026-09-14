/** The card fee is Stripe's cost, grossed up, and nothing on EEA consumer cards. */
import { describe, it, expect } from "vitest";
import { cardFee, CARD_REGIONS } from "@/lib/card-fee";

describe("card fee", () => {
  it("adds nothing on an EEA consumer card, whatever the amount", () => {
    expect(cardFee(2779.2, "eea")).toEqual({ fee: 0, total: 2779.2 });
  });
  it("grosses up so the trip nets the amount after Stripe's cut", () => {
    for (const r of CARD_REGIONS.filter((x) => x.surcharge)) {
      const { fee, total } = cardFee(2779.2, r.key);
      const stripeTakes = total * r.pct + r.fixed;
      expect(total - stripeTakes).toBeCloseTo(2779.2, 1);
      expect(fee).toBeGreaterThan(0);
      expect(total).toBeCloseTo(2779.2 + fee, 2);
    }
  });
  it("a Canadian card on Daniel's balance costs about 3.4 %", () => {
    const { fee } = cardFee(2779.2, "intl");
    expect(fee).toBeGreaterThan(90);
    expect(fee).toBeLessThan(100);
  });
  it("Amex is surchargeable even as a private card, an EEA Visa is not", () => {
    expect(cardFee(1000, "amex").fee).toBeGreaterThan(0);
    expect(cardFee(1000, "eea").fee).toBe(0);
  });
  it("refuses to price nothing", () => {
    expect(cardFee(0, "intl")).toEqual({ fee: 0, total: 0 });
  });
});
