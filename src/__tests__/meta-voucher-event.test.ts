/**
 * A voucher ORDER is not a purchase (Nico, 27 Sep 2026).
 *
 * The gift form fires voucher_buy the moment a pending voucher row exists,
 * before the buyer has made the bank transfer. It went to Meta as "Purchase"
 * with the voucher's value, so the ad optimiser was told money had been
 * earned on every order. It must go as InitiateCheckout, and nothing in the
 * browser may ever claim a Purchase for it. Runs in node: the browser, the
 * consent flag and the pixel are stubbed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let calls: unknown[][];

async function loadPixel() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "1169038255308964");
  const store = new Map<string, string>([["np7_consent_marketing", "yes"]]);
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null });
  calls = [];
  vi.stubGlobal("window", { fbq: (...args: unknown[]) => void calls.push(args) });
  return import("@/lib/meta-pixel");
}

describe("voucher_buy on the Meta pixel", () => {
  beforeEach(() => { calls = []; });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("maps to InitiateCheckout, never Purchase", async () => {
    const { metaStandardEvent } = await loadPixel();
    expect(metaStandardEvent("voucher_buy")).toBe("InitiateCheckout");
  });

  it("sends the order's size as a checkout value, not as a purchase", async () => {
    const { metaForward } = await loadPixel();
    metaForward("voucher_buy", { amount: 1000, currency: "EUR", experience: "any" }, "evt-1");
    expect(calls).toEqual([["track", "InitiateCheckout", { value: 1000, currency: "EUR", content_name: "any" }, { eventID: "evt-1" }]]);
    expect(JSON.stringify(calls)).not.toContain("Purchase");
  });

  it("leaves the reservation checkout as it was: no value when none is given", async () => {
    const { metaForward } = await loadPixel();
    metaForward("reserve_start", { package: "pkg-1", level: "beginner" });
    expect(calls).toEqual([["track", "InitiateCheckout", { content_ids: ["pkg-1"] }]]);
  });
});
