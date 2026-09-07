import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { INFRASTRUCTURE_TAGS, infraTally } from "@/lib/spotguide";

/**
 * POST /api/portal/spotguide/infra — one-tap "yes, that's here" on a single
 * on-site facility. Body: { spotId, tag }. Toggles that tag on the member's own
 * spot_ratings row and returns the refreshed crowd tally.
 *
 * Why not /rate: that endpoint upserts the WHOLE row, so a one-tap confirm sent
 * through it would wipe the member's stars, level and windrose — and un-ticking
 * your last tag would be rejected as "no input". This writes the one column.
 *
 * A tag is accepted if it's in the shared vocab OR already on the spot's own
 * list — NP7 types free-form facilities in admin ("Hotel on site", "Café"), and
 * a chip a rider can see is a chip a rider must be able to confirm.
 */
export async function POST(request: NextRequest) {
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return NextResponse.json({ error: "Please sign in to confirm." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const spotId = (body.spotId ?? "").trim();
  const tag = (body.tag ?? "").trim();
  if (!spotId || !tag) return NextResponse.json({ error: "Missing spot or tag." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: spot } = await db.from("spots").select("infrastructure").eq("id", spotId).maybeSingle();
  if (!spot) return NextResponse.json({ error: "Unknown spot." }, { status: 404 });
  const known = (INFRASTRUCTURE_TAGS as readonly string[]).includes(tag)
    || (Array.isArray(spot.infrastructure) ? spot.infrastructure : []).includes(tag);
  if (!known) return NextResponse.json({ error: "Unknown facility." }, { status: 400 });

  const { data: row } = await db.from("spot_ratings")
    .select("infrastructure").eq("spot_id", spotId).eq("contact_id", user.contactId).maybeSingle();
  const had: string[] = Array.isArray(row?.infrastructure) ? row.infrastructure : [];
  const on = !had.includes(tag);
  const next = on ? [...had, tag] : had.filter((t) => t !== tag);

  // Only the one column: on conflict PostgREST updates exactly what's sent, so
  // the member's stars/level/conditions/windrose stay untouched.
  const { error } = await db.from("spot_ratings").upsert(
    { spot_id: spotId, contact_id: user.contactId, infrastructure: next, updated_at: new Date().toISOString() },
    { onConflict: "spot_id,contact_id" }
  );
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Spotguide isn't live yet." }, { status: 503 });
    return NextResponse.json({ error: "Could not save your confirmation." }, { status: 500 });
  }

  const { data: rows } = await db.from("spot_ratings").select("infrastructure").eq("spot_id", spotId);
  return NextResponse.json({ ok: true, on, mine: next, tally: infraTally(rows ?? []) });
}
