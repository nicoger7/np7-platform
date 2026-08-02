import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { fetchWindStatsBoth } from "@/lib/wind-stats";

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
  // ?force=1 refreshes regardless of age (backfills after a data-shape change).
  const force = new URL(req.url).searchParams.get("force") === "1";
  let q = db
    .from("spots")
    .select("id, lat, lng, wind_stats_at, wind_stats, wind_profile")
    .not("lat", "is", null);
  if (!force) q = q.or(`wind_stats_at.is.null,wind_stats_at.lt.${cutoff}`);
  else q = q.or(`wind_stats_at.is.null,wind_stats->alt.is.null`); // force = top up spots missing the alt model
  const { data: candidates, error } = await q.limit(25);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Never overwrite a hand-entered "NP7 · …" override.
  const spots = (candidates ?? [])
    .filter((s: { wind_stats: { source?: string } | null }) => !String(s.wind_stats?.source ?? "").startsWith("NP7"))
    .slice(0, 5);

  let updated = 0;
  for (const s of spots) {
    try {
      // Store BOTH model reads (main = the spot's chosen profile) so riders can
      // toggle between the coastal and offshore reads on demand.
      const stats = await fetchWindStatsBoth(s.lat, s.lng, s.wind_profile === "accelerated" ? "accelerated" : "standard");
      const now = new Date().toISOString();
      await db.from("spots").update({ wind_stats: stats, wind_stats_at: now }).eq("id", s.id);
      updated++;
    } catch { /* skip a failing location, try again next run */ }
  }
  // Destinations too — the experience pages' wind graph reads from here. Same
  // cadence, accelerated primary (the shoreline model under-reads the venturi
  // spots the trips actually run at; the offshore sampling matches reality).
  let destUpdated = 0;
  {
    let dq = db.from("destinations").select("id, lat, lng, wind_stats_at").not("lat", "is", null);
    if (!force) dq = dq.or(`wind_stats_at.is.null,wind_stats_at.lt.${cutoff}`);
    const { data: dests } = await dq.limit(3);
    for (const d of (dests ?? []) as { id: string; lat: number; lng: number }[]) {
      try {
        const stats = await fetchWindStatsBoth(d.lat, d.lng, "accelerated");
        await db.from("destinations").update({ wind_stats: stats, wind_stats_at: new Date().toISOString() }).eq("id", d.id);
        destUpdated++;
      } catch { /* next run */ }
    }
  }

  return NextResponse.json({ ok: true, checked: spots?.length ?? 0, updated, destUpdated });
}
