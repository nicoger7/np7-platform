import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { fetchWindStats } from "@/lib/wind-stats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Refreshes spot wind climatology (Open-Meteo). Climate normals barely move, so
 * this only tops up spots that have coordinates but missing/old stats — a few
 * per run to stay well within limits. Wire in vercel.json (e.g. weekly).
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}` || new URL(req.url).searchParams.get("secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const cutoff = new Date(Date.now() - 180 * 86400000).toISOString(); // refresh if older than ~6 months
  const { data: candidates, error } = await db
    .from("spots")
    .select("id, lat, lng, wind_stats_at, wind_stats")
    .not("lat", "is", null)
    .or(`wind_stats_at.is.null,wind_stats_at.lt.${cutoff}`)
    .limit(25);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Never overwrite a manual "NP7 · local knowledge" override — those exist
  // precisely because the model reads the spot wrong (Canary/Tarifa acceleration).
  const spots = (candidates ?? [])
    .filter((s: { wind_stats: { source?: string } | null }) => !String(s.wind_stats?.source ?? "").startsWith("NP7"))
    .slice(0, 5);

  let updated = 0;
  for (const s of spots) {
    try {
      const stats = await fetchWindStats(s.lat, s.lng);
      const now = new Date().toISOString();
      await db.from("spots").update({ wind_stats: stats, wind_stats_at: now }).eq("id", s.id);
      updated++;
    } catch { /* skip a failing location, try again next run */ }
  }
  return NextResponse.json({ ok: true, checked: spots?.length ?? 0, updated });
}
