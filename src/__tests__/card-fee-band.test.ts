/**
 * The fee band is guessed before anyone has seen the card, and corrected after.
 *
 * Two different legal rules sit on top of each other. On a private EEA card no
 * surcharge may stand at all (§270a BGB), so the whole fee goes back. On a card
 * where one MAY stand, it may still not exceed what it actually cost us
 * (§312a Abs. 4 BGB), so anything above the real band's cost goes back too.
 * Both corrections only ever run downwards: a card dearer than the band we
 * quoted is NP7's own misjudgement to carry.
 */
import { describe, it, expect } from "vitest";
import { cardRegionFromCard, cardFee, feeAllowedOnCard } from "@/lib/card-fee";

const excess = (charged: number, card: Parameters<typeof cardRegionFromCard>[0], amount = 1440) => {
  if (!feeAllowedOnCard(card)) return charged;                 // the whole thing
  const actual = cardRegionFromCard(card);
  const owed = actual ? cardFee(amount, actual).fee : charged;
  return Math.round((charged - owed) * 100) / 100;
};

describe("cardRegionFromCard", () => {
  it("reads the band off the card that was actually used", () => {
    expect(cardRegionFromCard({ country: "GB", brand: "visa" })).toBe("uk");
    expect(cardRegionFromCard({ country: "US", brand: "visa" })).toBe("intl");
    expect(cardRegionFromCard({ country: "DE", brand: "visa" })).toBe("eea");
    // Three-party schemes sit outside the interchange cap wherever issued.
    expect(cardRegionFromCard({ country: "DE", brand: "amex" })).toBe("amex");
  });

  it("says it cannot tell rather than guessing", () => {
    expect(cardRegionFromCard(null)).toBeNull();
    expect(cardRegionFromCard({ country: null, brand: "visa" })).toBeNull();
  });
});

describe("what goes back to the guest", () => {
  it("returns the whole fee when the card turns out to be a private EEA one", () => {
    // A guest we believed was outside the EEA, paying with a German card.
    const charged = cardFee(1440, "intl").fee;
    expect(excess(charged, { country: "DE", brand: "visa" })).toBeCloseTo(charged, 2);
  });

  it("returns only the difference when the card is merely cheaper than quoted", () => {
    // The case Nico asked about: quoted the international band, paid with a UK card.
    const charged = cardFee(1440, "intl").fee;
    const owed = cardFee(1440, "uk").fee;
    expect(excess(charged, { country: "GB", brand: "visa" })).toBeCloseTo(charged - owed, 2);
    expect(excess(charged, { country: "GB", brand: "visa" })).toBeGreaterThan(0);
  });

  it("returns nothing when the band was right", () => {
    const charged = cardFee(1440, "intl").fee;
    expect(excess(charged, { country: "US", brand: "visa" })).toBeCloseTo(0, 2);
  });

  it("never bills more when the card turns out dearer than quoted", () => {
    // Quoted the UK band, paid with a US card. NP7 carries it.
    const charged = cardFee(1440, "uk").fee;
    expect(excess(charged, { country: "US", brand: "visa" })).toBeLessThan(0);
  });

  it("returns the whole fee when the card cannot be identified", () => {
    const charged = cardFee(1440, "intl").fee;
    expect(excess(charged, null)).toBeCloseTo(charged, 2);
  });
});
