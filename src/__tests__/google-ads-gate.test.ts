/**
 * The Google Ads tag may only ever reach Google when every gate passes:
 * marketing consent given under the banner that names Google, the production
 * host, no team opt-out, and not a page that must stay off ad networks. And
 * only "register" is a conversion. These run in node, so the browser is
 * stubbed: a Map-backed localStorage, a location and a cookie string.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { googleAdsEnabled, googleAdsForward } from "@/lib/google-ads";

let store: Map<string, string>;
let calls: unknown[][];

function browser({ host = "www.np-seven.com", path = "/experience/np7-bonaire", cookie = "" } = {}) {
  store = new Map();
  calls = [];
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("document", { cookie });
  vi.stubGlobal("window", {
    location: { hostname: host, pathname: path },
    gtag: (...args: unknown[]) => void calls.push(args),
  });
}

/** What the banner writes for "Accept all" today (version 2). */
function acceptedToday() {
  store.set("np7_consent", "all");
  store.set("np7_consent_analytics", "yes");
  store.set("np7_consent_marketing", "yes");
  store.set("np7_consent_v", "2");
}

describe("the Google Ads gate", () => {
  beforeEach(() => browser());
  afterEach(() => vi.unstubAllGlobals());

  it("stays shut without any choice", () => {
    expect(googleAdsEnabled()).toBe(false);
  });

  it("opens on today's marketing yes on the live site", () => {
    acceptedToday();
    expect(googleAdsEnabled()).toBe(true);
  });

  it("stays shut on marketing no", () => {
    acceptedToday();
    store.set("np7_consent_marketing", "no");
    expect(googleAdsEnabled()).toBe(false);
  });

  it("does not treat a yes from the Meta-only banner as a yes to Google", () => {
    acceptedToday();
    store.delete("np7_consent_v"); // chosen before the banner named Google
    expect(googleAdsEnabled()).toBe(false);
  });

  it("stays shut on a preview deploy, whatever the visitor chose", () => {
    browser({ host: "np7-platform-git-dev-nico.vercel.app" });
    acceptedToday();
    expect(googleAdsEnabled()).toBe(false);
  });

  it("treats the apex domain as the live site", () => {
    browser({ host: "np-seven.com" });
    acceptedToday();
    expect(googleAdsEnabled()).toBe(true);
  });

  it("stays shut for a team browser that opted out (localStorage or cookie)", () => {
    acceptedToday();
    store.set("np7_notrack", "1");
    expect(googleAdsEnabled()).toBe(false);

    browser({ cookie: "a=b; np7_notrack=1" });
    acceptedToday();
    expect(googleAdsEnabled()).toBe(false);
  });

  it("never runs on the login-token page or in admin", () => {
    for (const path of ["/account/auth", "/account/auth/confirm", "/admin", "/admin/bookings"]) {
      browser({ path });
      acceptedToday();
      expect(googleAdsEnabled(), path).toBe(false);
    }
  });

  it("still runs on the member login page, where free accounts are made", () => {
    browser({ path: "/account/login" });
    acceptedToday();
    expect(googleAdsEnabled()).toBe(true);
  });
});

describe("what reaches Google", () => {
  beforeEach(() => browser());
  afterEach(() => vi.unstubAllGlobals());

  it("sends a sign-up as the account's one conversion, deduplicated by the shared id", () => {
    acceptedToday();
    googleAdsForward("register", "evt-123");
    expect(calls).toEqual([[
      "event",
      "conversion",
      { send_to: "AW-677967699/PC-lCOe2-IYdENPuo8MC", value: 1, currency: "EUR", transaction_id: "evt-123" },
    ]]);
  });

  it("sends nothing for events that are not conversions", () => {
    acceptedToday();
    for (const e of ["pageview", "reserve_start", "voucher_buy", "scroll_90"]) googleAdsForward(e, "x");
    expect(calls).toEqual([]);
  });

  it("sends nothing without consent", () => {
    googleAdsForward("register", "evt-1");
    expect(calls).toEqual([]);
  });
});
