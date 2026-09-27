/**
 * Google Ads tag (gtag.js), the paid-search twin of the Meta Pixel. Nothing
 * loads and nothing is sent unless ALL of these pass:
 *
 *   1. MARKETING consent, given under banner version 2 or later. Version 1's
 *      Marketing toggle named only the Meta Pixel, so a "yes" from then does
 *      not cover Google; the banner asks those visitors again instead.
 *   2. PRODUCTION host. NEXT_PUBLIC_SITE_URL is set on Vercel's Production
 *      scope only, so preview deploys and `npm run dev` never load the tag and
 *      a test sign-up can never be counted as a paid conversion.
 *   3. Not opted out: the team excludes its own browsers with /?np7_notrack=1
 *      (see components/analytics/tracker.tsx).
 *   4. Not a page that must never reach an ad network: /admin is staff
 *      tooling, and /account/auth carries a live single-use login token in its
 *      query string, which gtag would ship with the page URL.
 *
 * Account 893-549-7146, tag AW-677967699. Its one conversion action is the
 * sign-up Google created with the Bonaire search campaign; our "register"
 * event (reserve modal + free account) is the same moment the Meta Pixel
 * reports as a Lead. No PII: value, currency and a random dedup id only.
 */

import { hasMarketingConsent } from "@/lib/meta-pixel";
import { consentVersion } from "@/components/shared/cookie-consent";

/** Public by nature: every page that loads the tag carries these in its source. */
export const GOOGLE_ADS_ID = "AW-677967699";
const LEAD_SEND_TO = "AW-677967699/PC-lCOe2-IYdENPuo8MC";
/** The value Google's own snippet sends; the action counts sign-ups, not revenue. */
const LEAD_VALUE = 1.0;

/** Banner version whose Marketing toggle names Google (see cookie-consent.tsx). */
const GOOGLE_NAMED_SINCE = 2;

function hostOf(url: string | undefined, fallback: string): string {
  try { return new URL(url || fallback).hostname.toLowerCase(); } catch { return fallback; }
}
const PROD_HOST = hostOf(process.env.NEXT_PUBLIC_SITE_URL, "www.np-seven.com");

/** np-seven.com and www.np-seven.com are one site — the apex 308s to the www. */
const bare = (h: string) => h.replace(/^www\./, "");

function optedOut(): boolean {
  try {
    if (localStorage.getItem("np7_notrack") === "1") return true;
  } catch { /* private mode — fall through to the cookie */ }
  return /(?:^|;\s*)np7_notrack=1/.test(document.cookie);
}

/** May the tag run (and report) on this page right now? */
export function googleAdsEnabled(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (!hasMarketingConsent() || consentVersion() < GOOGLE_NAMED_SINCE) return false;
    if (bare(window.location.hostname.toLowerCase()) !== bare(PROD_HOST)) return false;
    if (/^\/(admin|account\/auth)(\/|$)/.test(window.location.pathname)) return false;
    return !optedOut();
  } catch {
    return false;
  }
}

declare global { interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } }

/**
 * Inject gtag.js and configure the tag. Returns true when THIS call loaded it:
 * the config call then already counted the current page (and read the gclid
 * off its URL), so the caller must not send a second page view for it.
 * Only call when googleAdsEnabled().
 */
export function loadGoogleAds(): boolean {
  if (typeof window === "undefined" || window.gtag) return false;
  const dataLayer = (window.dataLayer = window.dataLayer || []);
  // gtag.js reads the `arguments` object itself off the dataLayer, not an array.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
  // Loaded only after a yes to Marketing, so the ad signals start granted.
  // Analytics stays denied: we run no Google Analytics.
  window.gtag("consent", "default", {
    ad_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "granted",
    analytics_storage: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("config", GOOGLE_ADS_ID);
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`;
  document.head.appendChild(s);
  return true;
}

/** A client-side navigation: the tag only saw the page it loaded on. */
export function googleAdsPageView(): void {
  try {
    if (!googleAdsEnabled() || !window.gtag) return;
    window.gtag("event", "page_view", { send_to: GOOGLE_ADS_ID });
  } catch {
    /* never break the page */
  }
}

/**
 * Pass a changed banner choice to a tag that is already on the page. The
 * script can't be unloaded, but on "denied" it stops reading and writing its
 * ad cookies, and googleAdsEnabled() stops every further event anyway.
 */
export function googleAdsConsent(granted: boolean): void {
  try {
    if (typeof window === "undefined" || !window.gtag) return;
    const v = granted ? "granted" : "denied";
    window.gtag("consent", "update", { ad_storage: v, ad_user_data: v, ad_personalization: v });
  } catch {
    /* never break the page */
  }
}

/**
 * Forward an internal event to Google if it is a conversion. Only "register"
 * is: the one action the account has. `eventId` is the same random id the
 * Meta Pixel gets; as transaction_id it stops Google counting a sign-up twice.
 */
export function googleAdsForward(event: string, eventId?: string): void {
  try {
    if (event !== "register" || !googleAdsEnabled() || !window.gtag) return;
    window.gtag("event", "conversion", {
      send_to: LEAD_SEND_TO,
      value: LEAD_VALUE,
      currency: "EUR",
      ...(eventId ? { transaction_id: eventId } : {}),
    });
  } catch {
    /* never break the page */
  }
}
