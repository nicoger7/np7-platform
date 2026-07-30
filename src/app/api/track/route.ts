import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * First-party analytics ingest. PUBLIC, but the client only ever calls this
 * after the visitor accepts analytics (cookie banner → np7_consent = "all").
 *
 * Privacy: we store no IP and no PII. The full referrer is reduced to its host
 * server-side (query strings can carry personal data) and all fields are length-
 * capped. Fail-open and silent — analytics must never break a page or leak errors.
 */

const EVENTS_MAX = 20;

function clip(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}

function refHost(referrer: unknown): string | null {
  const r = clip(referrer, 400);
  if (!r) return null;
  try {
    return new URL(r).hostname.slice(0, 120) || null;
  } catch {
    return null;
  }
}

const DEVICES = new Set(["mobile", "tablet", "desktop"]);

/**
 * Cross-site mirror: Nico's nicoprien.com admin aggregates web analytics for
 * both properties (site switcher in its dashboard). We forward a copy of every
 * event server-side — the visitor's browser makes zero extra requests, and the
 * one existing consent gate keeps deciding what reaches this route at all.
 * Best-effort: a dead collector must never affect our own tracking.
 */
const MIRROR_ENDPOINT = "https://admin.nicoprien.com/api/public/track";

type Row = ReturnType<typeof buildRow>;

function buildRow(ev: Record<string, unknown>, country: string | null) {
  const device = clip(ev.device, 12);
  let meta: Record<string, unknown> = {};
  if (ev.meta && typeof ev.meta === "object" && !Array.isArray(ev.meta)) {
    // keep meta small + string-ish
    meta = Object.fromEntries(
      Object.entries(ev.meta as Record<string, unknown>)
        .slice(0, 12)
        .map(([k, v]) => [k.slice(0, 40), typeof v === "string" ? v.slice(0, 200) : v])
    );
  }
  return {
    session_id: clip(ev.sessionId, 60) || "anon",
    visitor_id: clip(ev.visitorId, 60),
    event: clip(ev.event, 40) || "pageview",
    path: clip(ev.path, 300),
    referrer_host: refHost(ev.referrer),
    utm_source: clip(ev.utmSource, 80),
    utm_medium: clip(ev.utmMedium, 80),
    utm_campaign: clip(ev.utmCampaign, 120),
    device: device && DEVICES.has(device) ? device : null,
    experience_slug: clip(ev.experienceSlug, 120),
    country: country ? country.slice(0, 2).toUpperCase() : null,
    authed: ev.authed === true,
    ts: occurredAt(ev.age),
    meta,
  };
}

/**
 * When the events arrive batched, letting the column default to now() would
 * stamp every row in the batch with the SAME instant — which destroys the
 * ordering that entry/exit-page and drop-off analysis reads. The client sends
 * `age`: how many ms ago the event happened, measured as a DURATION on the
 * client, so a skewed device clock can't shift the row. Absent or implausible →
 * fall back to now.
 */
function occurredAt(age: unknown): string {
  const ms = typeof age === "number" && Number.isFinite(age) ? age : 0;
  if (ms <= 0 || ms > 30 * 60 * 1000) return new Date().toISOString();
  return new Date(Date.now() - ms).toISOString();
}

async function mirrorToNicoprienAdmin(rows: Row[], referrers: (string | null)[]) {
  await Promise.allSettled(
    rows.map((r, i) => {
      const payload = {
        site: "np-seven",
        event: r.event,
        sessionId: r.session_id,
        visitorId: r.visitor_id,
        path: r.path,
        referrer: referrers[i] || undefined,
        utmSource: r.utm_source || undefined,
        utmMedium: r.utm_medium || undefined,
        utmCampaign: r.utm_campaign || undefined,
        device: r.device || undefined,
        meta: Object.keys(r.meta).length ? r.meta : undefined,
      };
      // text/plain mirrors the collector's own sendBeacon clients
      return fetch(MIRROR_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4000),
      });
    })
  );
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // ignore malformed beacons
  }

  // Coarse country from the edge (Vercel/Cloudflare) — never the IP. Absent locally.
  const country =
    req.headers.get("x-vercel-ip-country") ||
    req.headers.get("cf-ipcountry") ||
    null;

  // A batch of events, or a single event.
  const raw = Array.isArray(body.events) ? body.events : [body];
  const evs = raw.slice(0, EVENTS_MAX).map((e) => (e ?? {}) as Record<string, unknown>);
  const rows = evs.map((ev) => buildRow(ev, country));
  // full referrers only travel to the mirror — our own table stores just the host
  const referrers = evs.map((ev) => clip(ev.referrer, 400));

  if (!rows.length) return NextResponse.json({ ok: true });

  after(async () => {
    try {
      await mirrorToNicoprienAdmin(rows, referrers);
    } catch (e) {
      console.error("[track] mirror to nicoprien admin failed:", e instanceof Error ? e.message : e);
    }
  });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { error } = await db.from("analytics_events").insert(rows);
    // Never fail the visitor's request over analytics — but DO log it. A silently
    // swallowed insert error (a column the table didn't have yet) once killed
    // every tracking write for a month without a single visible symptom.
    if (error) console.error("[track] analytics insert failed:", error.message);
  } catch (e) {
    console.error("[track] analytics insert threw:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true });
}
