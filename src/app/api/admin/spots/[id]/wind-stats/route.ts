import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { fetchWindStats, manualWindStats } from "@/lib/wind-stats";

/**
 * POST /api/admin/spots/:id/wind-stats — set the spot's wind climatology.
 *   {}                              → auto: compute from coords (Open-Meteo, free)
 *   { mode:'manual', monthly:[…12] } → manual "% planing days" per month (for
 *                                      acceleration spots the model under-reads)
 *   { mode:'off' }                   → clear the stats (rely on windrose/ratings)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const now = new Date().toISOString();

  if (body?.mode === "off") {
    const { error } = await db.from("spots").update({ wind_stats: null, wind_stats_at: now, updated_at: now }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, wind_stats: null, wind_stats_at: now });
  }

  let stats;
  if (body?.mode === "manual") {
    const monthly = Array.isArray(body.monthly) ? body.monthly.slice(0, 12).map(Number) : [];
    stats = manualWindStats(monthly);
  } else {
    const { data: spot } = await db.from("spots").select("lat, lng").eq("id", id).maybeSingle();
    if (!spot) return NextResponse.json({ error: "Spot not found" }, { status: 404 });
    if (spot.lat == null || spot.lng == null) return NextResponse.json({ error: "Add map coordinates first." }, { status: 400 });
    try {
      stats = await fetchWindStats(spot.lat, spot.lng);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Could not fetch wind data." }, { status: 502 });
    }
  }

  const { error } = await db.from("spots").update({ wind_stats: stats, wind_stats_at: now, updated_at: now }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, wind_stats: stats, wind_stats_at: now });
}
