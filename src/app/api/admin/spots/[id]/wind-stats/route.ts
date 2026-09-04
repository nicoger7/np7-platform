import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { fetchWindStatsBoth } from "@/lib/wind-stats";
import { requireAdminGate } from "@/lib/admin-auth";
/**
 * POST /api/admin/spots/:id/wind-stats — (re)compute the spot's wind climatology
 * from Open-Meteo (free, no key).
 *   { profile:'standard' }    → sample at the pin (default)
 *   { profile:'accelerated' } → sample a ring offshore & use the windiest point
 *                               (venturi/thermal spots the model shadows at the coast)
 *   { mode:'off' }            → clear the stats (rely on windrose/ratings)
 * The chosen profile is stored on the spot so the weekly cron keeps using it.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
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

  const { data: spot } = await db.from("spots").select("lat, lng").eq("id", id).maybeSingle();
  if (!spot) return NextResponse.json({ error: "Spot not found" }, { status: 404 });
  if (spot.lat == null || spot.lng == null) return NextResponse.json({ error: "Add map coordinates first." }, { status: 400 });

  const profile = body?.profile === "accelerated" ? "accelerated" : "standard";
  let stats;
  try {
    stats = await fetchWindStatsBoth(spot.lat, spot.lng, profile);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not fetch wind data." }, { status: 502 });
  }

  const { error } = await db.from("spots").update({ wind_stats: stats, wind_stats_at: now, wind_profile: profile, updated_at: now }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, wind_stats: stats, wind_stats_at: now, wind_profile: profile });
}
