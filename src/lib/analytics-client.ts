/**
 * Client-side analytics. First-party + consent-gated: nothing is sent unless the
 * visitor accepted analytics in the cookie banner (np7_consent = "all"). Ids are
 * random first-party tokens stored locally — no PII, no third-party scripts.
 */

import { hasAnalyticsConsent } from "@/components/shared/cookie-consent";
import { metaForward } from "@/lib/meta-pixel";
import { hasAuthCookie } from "@/lib/has-auth-cookie";

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
const isAuthed = hasAuthCookie;

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

/* ── Batching ──────────────────────────────────────────────────────────────
   One beacon per event meant an engaged visitor fired 20–100+ server function
   invocations (pageview + scroll depths + up to 80 clicks + dead clicks +
   page_time). /api/track has always accepted `{ events: [...] }`, so events are
   queued here and posted together — the same rows, a fraction of the calls.

   Consent is still checked at ENTRY, in track(), never at flush time: nothing
   un-consented may ever reach the queue.                                     */

const MAX_PER_POST = 20; // /api/track's EVENTS_MAX — it silently drops the rest
const BATCH_AT = 10;     // flush early once this many pile up
const FLUSH_MS = 2000;   // …and at worst the oldest event waits this long

type Payload = Record<string, unknown>;
/** the payload plus WHEN it was queued, so the server can reconstruct each
 *  event's own timestamp instead of stamping the whole batch with one instant */
type Queued = { payload: Payload; at: number };
let queue: Queued[] = [];
let timer: number | null = null;
/** the page is going away (or hidden) — nothing may sit in the queue */
let leaving = false;

function post(batch: Queued[]): void {
  if (!batch.length) return;
  const now = Date.now();
  // `age` is a duration measured entirely on this device — immune to clock skew
  const events = batch.map((q) => ({ ...q.payload, age: Math.max(0, now - q.at) }));
  const body = JSON.stringify({ events });
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon && navigator.sendBeacon("/api/track", blob)) return;
  } catch {
    /* fall through to fetch */
  }
  fetch("/api/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
}

function flush(): void {
  if (timer !== null) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const pending = queue;
  queue = [];
  for (let i = 0; i < pending.length; i += MAX_PER_POST) post(pending.slice(i, i + MAX_PER_POST));
}

function enqueue(payload: Payload): void {
  queue.push({ payload, at: Date.now() });
  if (leaving || document.visibilityState === "hidden" || queue.length >= BATCH_AT) { flush(); return; }
  if (timer === null) timer = window.setTimeout(flush, FLUSH_MS);
}

// Registered on module load — i.e. BEFORE the tracker component's own pagehide
// handler — so `leaving` is already true when that handler emits its final
// page_time event, and that event goes out immediately instead of being queued
// into a page that no longer exists.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { leaving = true; flush(); });
  window.addEventListener("pageshow", () => { leaving = false; });  // restored from the back/forward cache
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { leaving = true; flush(); }
    else leaving = false;                                            // tab back in front — resume batching
  });
}

/**
 * Record an event. No-op without analytics consent. Best-effort, never throws.
 * Queued and sent in batches via sendBeacon, so it survives page navigation.
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
    enqueue(payload);
  } catch {
    /* analytics must never break the page */
  }
}

/** Convenience for the automatic pageview. */
export function trackPageview(): void {
  track("pageview");
}
