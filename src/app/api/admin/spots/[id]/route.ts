import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { fetchWindStatsBoth } from "@/lib/wind-stats";
import { summariseRatings, tallyForecastVotes, SPOT_CRITERIA_KEYS } from "@/lib/spotguide";
import { publishDestinationIfEarned } from "@/lib/spotguide-trust";
import { revalidateSpotguide } from "@/lib/revalidate-public";

const COLS = [
  "name", "slug", "lat", "lng", "level", "levels", "conditions", "wind_window",
  "infrastructure", "np7_forecast_models", "hero_image", "hero_focus", "gallery", "summary",
  "description", "np7_ratings", "status", "verification", "sort_order",
];

// GET /api/admin/spots/:id — spot + its member-rating summary + forecast tally
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const { data: spot, error } = await db.from("spots").select("*").eq("id", id).maybeSingle();
  if (error || !spot) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: ratings }, { data: votes }, { data: verifs }, { data: dest }] = await Promise.all([
    db.from("spot_ratings").select("ratings").eq("spot_id", id),
    db.from("spot_forecast_votes").select("model").eq("spot_id", id),
    db.from("spot_verifications").select("kind").eq("spot_id", id),
    db.from("destinations").select("id, name, slug").eq("id", spot.destination_id).maybeSingle(),
  ]);

  return NextResponse.json({
    spot,
    destination: dest ?? null,
    memberRatings: summariseRatings(ratings ?? [], SPOT_CRITERIA_KEYS),
    forecastTally: tallyForecastVotes(votes ?? []),
    confirms: (verifs ?? []).filter((v: { kind: string }) => v.kind === "confirm").length,
    flags: (verifs ?? []).filter((v: { kind: string }) => v.kind === "flag").length,
  });
}

// PATCH /api/admin/spots/:id
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  // Snapshot the pin + stats source so we can detect a moved pin and avoid
  // clobbering a manual "NP7 · local knowledge" override.
  const { data: before } = await db.from("spots").select("lat, lng, wind_stats, wind_profile").eq("id", id).maybeSingle();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of COLS) if (k in body) patch[k] = body[k];
  // Approving a spot publishes it. The two are one decision to whoever clicks
  // "Publish · community tier", but the button only ever sent `verification` —
  // so a DRAFT spot got its public verification and stayed invisible, which is
  // exactly what happened to four spots Nico approved. Public visibility needs
  // status='published' AND a public verification (see spotguide-data.ts).
  // Guarded: an explicit status in the same request wins, so Hide
  // ({status:'hidden'}) is untouched and can never be undone by this.
  if (!("status" in body) && (body.verification === "community" || body.verification === "np7")) {
    patch.status = "published";
  }
  let { data, error } = await db.from("spots").update(patch).eq("id", id).select("*").single();
  // tolerate the levels column not existing yet (migration 082): drop it and retry
  if (error && /\blevels\b/i.test(error.message) && "levels" in patch) {
    delete patch.levels;
    ({ data, error } = await db.from("spots").update(patch).eq("id", id).select("*").single());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // A moderation DECISION (verify / approve / hide) resolves any open rider
  // flags — otherwise `flagged` keeps pulling the spot back into the review
  // queue forever, no matter what the admin chose. Riders can always re-flag
  // later, which correctly resurfaces it.
  if ("verification" in body || "status" in body) {
    await db.from("spot_verifications").delete().eq("spot_id", id).eq("kind", "flag");
  }

  // Verifying a spot (community/np7) auto-publishes its rider-proposed draft place.
  if (data && (data.verification === "community" || data.verification === "np7")) {
    await publishDestinationIfEarned(db, data.destination_id);
  }

  // Pin moved → refresh the wind climatology for the new location (background),
  // unless the current stats are a protected manual override.
  const moved = ("lat" in body && body.lat !== before?.lat) || ("lng" in body && body.lng !== before?.lng);
  const isManual = String(before?.wind_stats?.source ?? "").startsWith("NP7");
  if (moved && !isManual && data.lat != null && data.lng != null) {
    const { lat, lng } = data;
    const accelerated = (data.wind_profile ?? before?.wind_profile) === "accelerated";
    after(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bg = createAdminClient() as any;
        const stats = await fetchWindStatsBoth(lat, lng, accelerated ? "accelerated" : "standard");
        await bg.from("spots").update({ wind_stats: stats, wind_stats_at: new Date().toISOString() }).eq("id", id);
      } catch { /* the wind-stats cron will retry */ }
    });
  }
  // A spot edit changes its destination's public page (and the counts on the
  // index), both ISR'd — resolve the slug so only that page is invalidated.
  // A publish/verify decision can add or remove a spot from the guide, which is
  // structural enough to reach the magazine's destination clusters.
  const { data: dest } = await db.from("destinations").select("slug").eq("id", data.destination_id).maybeSingle();
  revalidateSpotguide(dest?.slug ?? null, {
    alsoMagazine: "status" in body || "verification" in body || "name" in body || "slug" in body,
  });
  return NextResponse.json(data);
}

// DELETE /api/admin/spots/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  // read the parent destination before the row goes, so its page can refresh
  const { data: gone } = await db.from("spots").select("destination_id").eq("id", id).maybeSingle();
  const { error } = await db.from("spots").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: dest } = gone?.destination_id
    ? await db.from("destinations").select("slug").eq("id", gone.destination_id).maybeSingle()
    : { data: null as { slug?: string | null } | null };
  revalidateSpotguide(dest?.slug ?? null, { alsoMagazine: true });
  return NextResponse.json({ success: true });
}
