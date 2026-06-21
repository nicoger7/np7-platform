import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/analytics/behaviour?days=30 — first-party visitor-behaviour
 * aggregates from analytics_events (pageviews, sessions, sources, devices, a
 * daily series and the view→reserve→register funnel). Team-only (middleware
 * gates /api/admin). Fail-open: returns empty if migration 038 isn't applied.
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
};

const empty = {
  available: false,
  range: { days: 30, from: null as string | null },
  totals: { pageviews: 0, sessions: 0, visitors: 0, pagesPerSession: 0 },
  series: [] as { date: string; views: number }[],
  topPages: [] as { path: string; views: number }[],
  topSources: [] as { source: string; sessions: number }[],
  devices: [] as { device: string; sessions: number }[],
  funnel: { expViews: 0, reserveStart: 0, register: 0 },
};

export async function GET(req: NextRequest) {
  const days = Math.min(180, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const fromDate = new Date(Date.now() - days * 86400000);
  const fromISO = fromDate.toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  let events: Ev[] = [];
  try {
    const { data, error } = await db
      .from("analytics_events")
      .select("ts, session_id, visitor_id, event, path, referrer_host, device, experience_slug")
      .gte("ts", fromISO)
      .order("ts", { ascending: true })
      .limit(100000);
    if (error) return NextResponse.json({ ...empty, range: { days, from: fromISO } });
    events = (data || []) as Ev[];
  } catch {
    return NextResponse.json({ ...empty, range: { days, from: fromISO } });
  }

  const views = events.filter((e) => e.event === "pageview");

  // Per-session entry info (device + entry source), from each session's first event.
  const sessionInfo: Record<string, { device: string; source: string }> = {};
  for (const e of events) {
    if (!sessionInfo[e.session_id]) {
      sessionInfo[e.session_id] = {
        device: e.device || "unknown",
        source: e.referrer_host || "direct",
      };
    }
  }

  const sessions = Object.keys(sessionInfo).length;
  const visitors = new Set(events.map((e) => e.visitor_id).filter(Boolean)).size;
  const pageviews = views.length;

  // Daily series (fill zero days).
  const byDay: Record<string, number> = {};
  for (const v of views) {
    const d = v.ts.slice(0, 10);
    byDay[d] = (byDay[d] || 0) + 1;
  }
  const series: { date: string; views: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    series.push({ date: d, views: byDay[d] || 0 });
  }

  // Top pages by views.
  const pageCounts: Record<string, number> = {};
  for (const v of views) {
    const p = v.path || "(unknown)";
    pageCounts[p] = (pageCounts[p] || 0) + 1;
  }
  const topPages = Object.entries(pageCounts)
    .map(([path, v]) => ({ path, views: v }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  // Sessions per source + device.
  const srcCounts: Record<string, number> = {};
  const devCounts: Record<string, number> = {};
  for (const s of Object.values(sessionInfo)) {
    srcCounts[s.source] = (srcCounts[s.source] || 0) + 1;
    devCounts[s.device] = (devCounts[s.device] || 0) + 1;
  }
  const topSources = Object.entries(srcCounts)
    .map(([source, n]) => ({ source, sessions: n }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 8);
  const devices = Object.entries(devCounts)
    .map(([device, n]) => ({ device, sessions: n }))
    .sort((a, b) => b.sessions - a.sessions);

  // Funnel (unique sessions at each step).
  const sessionsWith = (pred: (e: Ev) => boolean) =>
    new Set(events.filter(pred).map((e) => e.session_id)).size;
  const funnel = {
    expViews: sessionsWith((e) => e.event === "pageview" && !!e.experience_slug),
    reserveStart: sessionsWith((e) => e.event === "reserve_start"),
    register: sessionsWith((e) => e.event === "register"),
  };

  return NextResponse.json({
    available: true,
    range: { days, from: fromISO },
    totals: {
      pageviews,
      sessions,
      visitors,
      pagesPerSession: sessions ? Math.round((pageviews / sessions) * 10) / 10 : 0,
    },
    series,
    topPages,
    topSources,
    devices,
    funnel,
  });
}
