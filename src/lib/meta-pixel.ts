/**
 * Meta (Facebook) Pixel — OFF by default and double-gated so it can never fire
 * until it's deliberately switched on:
 *
 *   1. NEXT_PUBLIC_META_PIXEL_ID must be set (no id → the script never loads), AND
 *   2. the visitor must have given MARKETING consent (np7_consent_marketing="yes").
 *
 * The current cookie banner only offers essential/analytics consent and never
 * sets the marketing key — so today this is completely inert and the site's
 * "no third-party tracking" promise holds. To go live: set the Pixel id in env
 * AND add a Marketing option to the cookie banner + update the privacy policy.
 *
 * Privacy: only standard events, no PII in params. Pair with the server-side
 * Conversions API later for iOS/ad-blocker resilience (event_id dedup).
 */

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "";

const MARKETING_KEY = "np7_consent_marketing"; // "yes" once a Marketing banner option sets it

/** Has the visitor consented to marketing / ad tracking? (Separate from analytics.) */
export function hasMarketingConsent(): boolean {
  try {
    return localStorage.getItem(MARKETING_KEY) === "yes";
  } catch {
    return false;
  }
}

/** The pixel may only run when an id is configured AND marketing consent is given. */
export function metaEnabled(): boolean {
  return !!META_PIXEL_ID && typeof window !== "undefined" && hasMarketingConsent();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { interface Window { fbq?: any; _fbq?: any } }

/** Inject the Meta Pixel script + init (idempotent). Only call when metaEnabled(). */
export function loadMetaPixel(): void {
  if (typeof window === "undefined" || !META_PIXEL_ID) return;
  if (window.fbq) return; // already loaded
  /* eslint-disable @typescript-eslint/no-explicit-any */
  (function (f: any, b: Document, e: string, v: string) {
    if (f.fbq) return;
    const n: any = (f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    const t = b.createElement(e) as HTMLScriptElement; t.async = true; t.src = v;
    const s = b.getElementsByTagName(e)[0]; s.parentNode?.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable @typescript-eslint/no-explicit-any */
  window.fbq("init", META_PIXEL_ID);
}

/** Fire a Meta standard event. No-op unless the pixel is enabled + loaded. */
export function metaTrack(event: string, params?: Record<string, unknown>): void {
  try {
    if (!metaEnabled() || !window.fbq) return;
    window.fbq("track", event, params || {});
  } catch {
    /* never break the page */
  }
}

/** Map our internal analytics events → Meta standard events (skip the ones the
 *  pixel component already handles, like pageview). */
const EVENT_MAP: Record<string, string> = {
  reserve_start: "InitiateCheckout",
  register: "Lead",
  voucher_buy: "Purchase",
};

/** Forward an internal event to Meta if it maps to a standard event. */
export function metaForward(event: string, meta?: Record<string, unknown>): void {
  const std = EVENT_MAP[event];
  if (std) metaTrack(std, meta);
}
