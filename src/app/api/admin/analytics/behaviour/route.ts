import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/analytics/behaviour?days=30 — first-party visitor-behaviour
 * aggregates from analytics_events. Team-only (middleware gates /api/admin).
 * Fail-open: returns { available:false } if migration 038 isn't applied.
 * Everything is pseudonymous — no identity is stored or returned.
 */

type Ev = {
  ts: string;
  session_id: string;
  visitor_id: string | null;
  event: string;
  path: string | null;
  referrer_host: string | null;
  device: string | null;
  experience_slug: string | null;
  country: string | null;
  authed: boolean | null;
};

const empty = {
  available: false,
  range: { days: 30, from: null as string | null },
  totals: { pageviews: 0, sessions: 0, visitors: 0, pagesPerSession: 0, bounceRate: 0, newPct: 0 },
  live: { activeVisitors: 0, viewsToday: 0, sessionsToday: 0 },
  members: { member: 0, guest: 0 },
  series: [] as { date: string; views: number }[],
  topPages: [] as { path: string; views: number }[],
  entryPages: [] as { path: string; sessions: number }[],
  exitPages: [] as { path: string; sessions: number }[],
  topSources: [] as { source: string; sessions: number }[],
  countries: [] as { country: string; sessions: number }[],
  devices: [] as { device: string; sessions: number }[],
  funnel: { expViews: 0, reserveStart: 0, register: 0 },
};

export async function GET(req: NextRequest) {
  const days = Math.min(180, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const fromISO = new Date(Date.now() - days * 86400000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  let events: Ev[] = [];
  try {
    const { data, error } = await db
      .from("analytics_events")
      .select("ts, session_id, visitor_id, event, path, referrer_host, device, experience_slug, country, authed")
      .gte("ts", fromISO)
      .order("ts", { ascending: true })
      .limit(100000);
    if (error) return NextResponse.json({ ...empty, range: { days, from: fromISO } });
    events = (data || []) as Ev[];
  } catch {
    return NextResponse.json({ ...empty, range: { days, from: fromISO } });
  }

  const views = events.filter((e) => e.event === "pageview");

  // Earliest event per visitor (for new-vs-returning within the window).
  const visitorFirst: Record<string, number> = {};
  for (const e of events) {
    if (!e.visitor_id) continue;
    const t = Date.parse(e.ts);
    if (visitorFirst[e.visitor_id] == null || t < visitorFirst[e.visitor_id]) visitorFirst[e.visitor_id] = t;
  }

  // Build a per-session profile.
  type S = { device: string; source: string; country: string | null; authed: boolean; visitor: string | null; first: number; last: number; entry: string | null; exit: string | null; views: number };
  const sess: Record<string, S> = {};
  for (const e of events) {
    const t = Date.parse(e.ts);
    let s = sess[e.session_id];
    if (!s) {
      s = sess[e.session_id] = {
        device: e.device || "unknown", source: e.referrer_host || "direct", country: e.country || null,
        authed: !!e.authed, visitor: e.visitor_id, first: t, last: t, entry: null, exit: null, views: 0,
      };
    }
    s.last = Math.max(s.last, t);
    if (e.event === "pageview") {
      if (!s.entry) s.entry = e.path || "(unknown)";
      s.exit = e.path || "(unknown)";
      s.views++;
    }
  }

  const sessionList = Object.values(sess);
  const sessions = sessionList.length;
  const pageviews = views.length;
  const visitors = new Set(events.map((e) => e.visitor_id).filter(Boolean)).size;
  const bounced = sessionList.filter((s) => s.views <= 1).length;
  const returningSessions = sessionList.filter((s) => s.visitor && visitorFirst[s.visitor] < s.first).length;

  // Live (last 5 min) + today (UTC).
  const now = Date.now();
  const fiveMin = now - 5 * 60000;
  const todayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  const activeVisitors = new Set(events.filter((e) => Date.parse(e.ts) >= fiveMin).map((e) => e.session_id)).size;
  const viewsToday = views.filter((v) => Date.parse(v.ts) >= todayStart).length;
  const sessionsToday = sessionList.filter((s) => s.first >= todayStart).length;

  // Daily series (fill zero days).
  const byDay: Record<string, number> = {};
  for (const v of views) byDay[v.ts.slice(0, 10)] = (byDay[v.ts.slice(0, 10)] || 0) + 1;
  const series: { date: string; views: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
    series.push({ date: d, views: byDay[d] || 0 });
  }

  // Counters.
  const pageC: Record<string, number> = {};
  for (const v of views) pageC[v.path || "(unknown)"] = (pageC[v.path || "(unknown)"] || 0) + 1;
  const entryC: Record<string, number> = {};
  const exitC: Record<string, number> = {};
  const srcC: Record<string, number> = {};
  const devC: Record<string, number> = {};
  const ctryC: Record<string, number> = {};
  let member = 0, guest = 0;
  for (const s of sessionList) {
    if (s.entry) entryC[s.entry] = (entryC[s.entry] || 0) + 1;
    if (s.exit) exitC[s.exit] = (exitC[s.exit] || 0) + 1;
    srcC[s.source] = (srcC[s.source] || 0) + 1;
    devC[s.device] = (devC[s.device] || 0) + 1;
    if (s.country) ctryC[s.country] = (ctryC[s.country] || 0) + 1;
    if (s.authed) member++; else guest++;
  }

  const sortTop = (m: Record<string, number>, n = 10) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);

  return NextResponse.json({
    available: true,
    range: { days, from: fromISO },
    totals: {
      pageviews, sessions, visitors,
      pagesPerSession: sessions ? Math.round((pageviews / sessions) * 10) / 10 : 0,
      bounceRate: sessions ? Math.round((bounced / sessions) * 100) : 0,
      newPct: sessions ? Math.round(((sessions - returningSessions) / sessions) * 100) : 0,
    },
    live: { activeVisitors, viewsToday, sessionsToday },
    members: { member, guest },
    series,
    topPages: sortTop(pageC).map(([path, views]) => ({ path, views })),
    entryPages: sortTop(entryC, 6).map(([path, s]) => ({ path, sessions: s })),
    exitPages: sortTop(exitC, 6).map(([path, s]) => ({ path, sessions: s })),
    topSources: sortTop(srcC, 8).map(([source, s]) => ({ source, sessions: s })),
    countries: sortTop(ctryC, 8).map(([country, s]) => ({ country, sessions: s })),
    devices: sortTop(devC).map(([device, s]) => ({ device, sessions: s })),
    funnel: {
      expViews: new Set(events.filter((e) => e.event === "pageview" && e.experience_slug).map((e) => e.session_id)).size,
      reserveStart: new Set(events.filter((e) => e.event === "reserve_start").map((e) => e.session_id)).size,
      register: new Set(events.filter((e) => e.event === "register").map((e) => e.session_id)).size,
    },
  });
}
