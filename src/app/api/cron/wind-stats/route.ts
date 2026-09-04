import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase";
import { fetchWindStatsBoth } from "@/lib/wind-stats";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Spots refreshed per run. Five fitted a 60-second budget; at 5 a week a
 * 30-spot backfill takes six weeks, which is how a model change quietly fails
 * to reach the pages it was made for. Each accelerated read is a multi-point
 * historical query, so this is paced, not unbounded — and once every spot is
 * current the query selects nothing and the run costs nothing.
 */
const BATCH = 12;

/**
 * Refreshes spot wind climatology (Open-Meteo). Climate normals barely move, so
 * this only tops up spots that have coordinates but missing/old stats — a few
 * per run to stay well within limits. Wire in vercel.json (e.g. weekly).
 */

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  // nullsFirst: without an ORDER the db hands back arbitrary rows, and in
  // production that starved the never-fetched spots for nights on end while
  // the same fresh trio got refetched. Oldest need goes first, always.
  const { data: candidates, error } = await q.order("wind_stats_at", { ascending: true, nullsFirst: true }).limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Never overwrite a hand-entered "NP7 · …" override.
  const spots = (candidates ?? [])
    .filter((s: { wind_stats: { source?: string } | null }) => !String(s.wind_stats?.source ?? "").startsWith("NP7"))
    .slice(0, BATCH);

  let updated = 0;
  for (const s of spots) {
    try {
      // Store BOTH model reads (main = the spot's chosen profile) so riders can
      // toggle between the coastal and offshore reads on demand.
      // Accelerated is the DEFAULT for a spot, not the exception.
      //
      // The shoreline read is taken at one pixel, and a windsurf spot is by
      // definition somewhere the wind accelerates — a venturi, a thermal, a
      // headland. Sampling that single point under-reads every one of them, and
      // a pin a kilometre inland under-reads catastrophically (El Médano: 89%
      // at the beach, 40% three kilometres in). The accelerated model rings the
      // pin offshore and keeps the best planing score, which absorbs both.
      //
      // The trade is real and worth naming: for a genuinely sheltered spot the
      // ring can find wind the rider on the beach will not get. `wind_profile`
      // stays honoured, so a spot proven to over-read can be pinned back to
      // 'standard' — and both model reads are stored either way.
      const stats = await fetchWindStatsBoth(s.lat, s.lng, s.wind_profile === "standard" ? "standard" : "accelerated");
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
    const { data: dests } = await dq.order("wind_stats_at", { ascending: true, nullsFirst: true }).limit(3);
    for (const d of (dests ?? []) as { id: string; lat: number; lng: number; wind_stats_at: string | null }[]) {
      // Belt and braces: whatever the filter matched, never re-fetch a row
      // that is already fresh — that budget belongs to the starving ones.
      if (!force && d.wind_stats_at && d.wind_stats_at >= cutoff) continue;
      try {
        const stats = await fetchWindStatsBoth(d.lat, d.lng, "accelerated");
        await db.from("destinations").update({ wind_stats: stats, wind_stats_at: new Date().toISOString() }).eq("id", d.id);
        destUpdated++;
      } catch { /* next run */ }
    }
  }

  return NextResponse.json({ ok: true, checked: spots?.length ?? 0, updated, destUpdated });
}
