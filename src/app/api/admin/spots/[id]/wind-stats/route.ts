import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { fetchWindStats } from "@/lib/wind-stats";

// POST /api/admin/spots/:id/wind-stats — compute + cache wind climatology from
// the spot's coordinates (Open-Meteo ERA5, free). ~10s for a 10-year fetch.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const { data: spot } = await db.from("spots").select("id, lat, lng").eq("id", id).maybeSingle();
  if (!spot) return NextResponse.json({ error: "Spot not found" }, { status: 404 });
  if (spot.lat == null || spot.lng == null) return NextResponse.json({ error: "Add map coordinates first." }, { status: 400 });

  let stats;
  try {
    stats = await fetchWindStats(spot.lat, spot.lng);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not fetch wind data." }, { status: 502 });
  }

  const now = new Date().toISOString();
  const { error } = await db.from("spots").update({ wind_stats: stats, wind_stats_at: now, updated_at: now }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, wind_stats: stats, wind_stats_at: now });
}
