import { describe, it, expect } from "vitest";
import { priceForeign, CROSS_BORDER_FEE_PCT } from "@/lib/fx";

/**
 * A US or UK guest transfers in their own currency, so the euro ask is
 * converted and the cross-border cost added ON TOP (Nico, 19 Sep 2026). The
 * euro figure the booking is owed must never move with the rate.
 */
describe("cross-border transfer pricing", () => {
  it("converts the euro ask and adds the cost on top", () => {
    const p = priceForeign(2183.67, "usd", 1.1643);
    expect(p.eur).toBe(2183.67);            // what the trip is owed, untouched
    expect(p.base).toBeCloseTo(2542.45, 2); // 2183.67 × 1.1643
    expect(p.fee).toBeCloseTo(2542.45 * CROSS_BORDER_FEE_PCT, 2);
    expect(p.total).toBeCloseTo(p.base + p.fee, 2);
    expect(p.total).toBeGreaterThan(p.base);
  });

  it("never rounds a fee into the trip's share", () => {
    const p = priceForeign(1440, "gbp", 0.8412);
    expect(p.base + p.fee).toBeCloseTo(p.total, 2);
    // The euro ask is what the webhook credits, whatever the guest sent.
    expect(p.eur).toBe(1440);
  });
});
