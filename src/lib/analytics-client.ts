/**
 * Client-side analytics. First-party + consent-gated: nothing is sent unless the
 * visitor accepted analytics in the cookie banner (np7_consent = "all"). Ids are
 * random first-party tokens stored locally — no PII, no third-party scripts.
 */

import { hasAnalyticsConsent } from "@/components/shared/cookie-consent";
import { metaForward } from "@/lib/meta-pixel";

const VID_KEY = "np7_vid"; // stable-ish visitor id (localStorage)
const SID_KEY = "np7_sid"; // per-tab session id (sessionStorage)

function rid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function visitorId(): string | null {
  try {
    let v = localStorage.getItem(VID_KEY);
    if (!v) { v = rid(); localStorage.setItem(VID_KEY, v); }
    return v;
  } catch {
    return null;
  }
}

function sessionId(): string {
  try {
    let s = sessionStorage.getItem(SID_KEY);
    if (!s) { s = rid(); sessionStorage.setItem(SID_KEY, s); }
    return s;
  } catch {
    return "anon";
  }
}

/** Member vs guest, WITHOUT any identity — just whether a Supabase auth cookie
 *  is present. Used for an aggregate member/guest split only. */
function isAuthed(): boolean {
  try {
    return /sb-[^=]*-auth-token/.test(document.cookie);
  } catch {
    return false;
  }
}

function device(): "mobile" | "tablet" | "desktop" {
  const w = typeof window !== "undefined" ? window.innerWidth : 1280;
  if (w < 768) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

/** Pull the experience slug from /experience/<slug> (funnel context). */
function experienceSlug(path: string): string | undefined {
  const m = path.match(/^\/experience\/([^/]+)/);
  if (!m) return undefined;
  const slug = m[1];
  // ignore non-experience sub-routes
  if (["gift", "legal"].includes(slug)) return undefined;
  return slug;
}

/**
 * Record an event. No-op without analytics consent. Best-effort, never throws.
 * Uses sendBeacon so it survives page navigation.
 */
export function track(event: string, meta?: Record<string, unknown>): void {
  try {
    if (typeof window === "undefined") return;
    if (window.top !== window.self) return; // never track inside an iframe (e.g. the admin heatmap preview)
    // Forward conversions to Meta — self-gated on its OWN marketing consent, so
    // it stays independent of first-party analytics consent (and is inert until
    // a Pixel id + marketing consent both exist).
    metaForward(event, meta);
    if (!hasAnalyticsConsent()) return;
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const payload = {
      event,
      sessionId: sessionId(),
      visitorId: visitorId(),
      path,
      referrer: document.referrer || undefined,
      utmSource: params.get("utm_source") || undefined,
      utmMedium: params.get("utm_medium") || undefined,
      utmCampaign: params.get("utm_campaign") || undefined,
      device: device(),
      experienceSlug: experienceSlug(path),
      authed: isAuthed(),
      meta: meta || undefined,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    if (navigator.sendBeacon && navigator.sendBeacon("/api/track", blob)) return;
    fetch("/api/track", { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  } catch {
    /* analytics must never break the page */
  }
}

/** Convenience for the automatic pageview. */
export function trackPageview(): void {
  track("pageview");
}
