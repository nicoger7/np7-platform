import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/analytics/heatmap — click points for a page, for the visual
 * heatmap overlay. Team-only (middleware gates /api/admin). First-party +
 * consent-gated (the events only exist if the visitor accepted analytics).
 *
 *  - no `path`  → the list of pages that have click data (for the selector)
 *  - with `path`→ the click points {x, y, t} for that page (+ optional device/type)
 *
 * x = xpct (viewport %), y = yd (page-relative %, falls back to ypct for events
 * captured before the page-Y upgrade). Pseudonymous — coordinates only, no PII.
 */

const CLICK_EVENTS = ["click", "dead_click", "rage_click"];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const days = Math.min(180, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const path = url.searchParams.get("path");
  const device = url.searchParams.get("device"); // desktop | mobile | tablet
  const type = url.searchParams.get("type");     // click | dead_click | rage_click
  const fromISO = new Date(Date.now() - days * 86400000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // No path → return the pages that have click data, so the UI can offer a picker.
  if (!path) {
    try {
      const { data } = await db
        .from("analytics_events")
        .select("path")
        .in("event", CLICK_EVENTS)
        .gte("ts", fromISO)
        .limit(100000);
      const c: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const e of (data || []) as any[]) if (e.path) c[e.path] = (c[e.path] || 0) + 1;
      const pages = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([p, clicks]) => ({ path: p, clicks }));
      return NextResponse.json({ available: true, pages });
    } catch {
      return NextResponse.json({ available: false, pages: [] });
    }
  }

  const events = type && CLICK_EVENTS.includes(type) ? [type] : CLICK_EVENTS;
  try {
    let q = db
      .from("analytics_events")
      .select("event, device, meta")
      .eq("path", path)
      .in("event", events)
      .gte("ts", fromISO)
      .limit(20000);
    if (device) q = q.eq("device", device);
    const { data } = await q;
    const points: { x: number; y: number; t: string }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of (data || []) as any[]) {
      const m = (e.meta || {}) as Record<string, unknown>;
      const x = Number(m.xpct);
      const y = Number(m.yd ?? m.ypct);
      if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100) {
        points.push({ x, y, t: e.event });
      }
    }
    return NextResponse.json({
      available: true, path, device: device || "all", type: type || "all",
      count: points.length, points: points.slice(0, 6000),
    });
  } catch {
    return NextResponse.json({ available: false, points: [] });
  }
}
