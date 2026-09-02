/**
 * Meta (Facebook) Pixel — OFF by default and double-gated so it can never fire
 * until it's deliberately switched on:
 *
 *   1. NEXT_PUBLIC_META_PIXEL_ID must be set (no id → the script never loads), AND
 *   2. the visitor must have given MARKETING consent (np7_consent_marketing="yes").
 *
 * The cookie banner (components/shared/cookie-consent.tsx) offers a separate
 * Marketing toggle (default off) that sets that key and fires "np7-consent", so
 * the only switch left is the env var. Pixel id: dataset 1169038255308964 in
 * the NP7 GmbH portfolio (set in Vercel prod+preview on 2026-09-02).
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

/**
 * Fire a Meta standard event. No-op unless the pixel is enabled + loaded.
 *
 * `eventId` is Meta's deduplication key. Sending the same id from the browser
 * and (later) from the server-side Conversions API makes Meta count the
 * conversion once instead of twice. Passing it now costs nothing and means CAPI
 * can be switched on later without re-instrumenting every call site.
 */
export function metaTrack(event: string, params?: Record<string, unknown>, eventId?: string): void {
  try {
    if (!metaEnabled() || !window.fbq) return;
    if (eventId) window.fbq("track", event, params || {}, { eventID: eventId });
    else window.fbq("track", event, params || {});
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

/** The Meta standard event an internal event maps to, or null if it isn't a conversion. */
export function metaStandardEvent(event: string): string | null {
  return EVENT_MAP[event] ?? null;
}

/**
 * Translate our internal event meta into the params Meta actually understands.
 * Only fields that help optimisation, never anything identifying: no name, no
 * email, no free text a visitor typed.
 */
function metaParams(std: string, meta?: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (!meta) return p;
  if (std === "Purchase") {
    // A Purchase without a value teaches Meta's optimiser nothing.
    const value = Number(meta.amount);
    if (Number.isFinite(value) && value > 0) p.value = value;
    p.currency = typeof meta.currency === "string" && meta.currency ? meta.currency : "EUR";
  }
  if (typeof meta.experience === "string") p.content_name = meta.experience;
  if (typeof meta.package === "string") p.content_ids = [meta.package];
  if (typeof meta.source === "string") p.content_category = meta.source;
  return p;
}

/** Forward an internal event to Meta if it maps to a standard event. */
export function metaForward(event: string, meta?: Record<string, unknown>, eventId?: string): void {
  const std = EVENT_MAP[event];
  if (std) metaTrack(std, metaParams(std, meta), eventId);
}
