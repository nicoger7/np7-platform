import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { SPOT_CRITERIA_KEYS, DESTINATION_CRITERIA_KEYS, summariseRatings } from "@/lib/spotguide";

/**
 * POST /api/portal/spotguide/rate — a logged-in member rates a spot or a
 * destination (one row per member, upserted). Body:
 *   { target: 'spot'|'destination', id, ratings: { key: 1..5 }, comment? }
 * Returns the refreshed member-average summary.
 */
export async function POST(request: NextRequest) {
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return NextResponse.json({ error: "Please sign in to rate." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const target = body.target === "destination" ? "destination" : "spot";
  const id = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const keys = target === "spot" ? SPOT_CRITERIA_KEYS : DESTINATION_CRITERIA_KEYS;
  const ratings: Record<string, number> = {};
  for (const k of keys) {
    const n = Math.round(Number((body.ratings ?? {})[k]));
    if (n >= 1 && n <= 5) ratings[k] = n;
  }
  if (Object.keys(ratings).length === 0) return NextResponse.json({ error: "Pick at least one rating." }, { status: 400 });
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 1200) : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const table = target === "spot" ? "spot_ratings" : "destination_ratings";
  const fk = target === "spot" ? "spot_id" : "destination_id";

  const { error } = await db.from(table).upsert(
    { [fk]: id, contact_id: user.contactId, ratings, comment, updated_at: new Date().toISOString() },
    { onConflict: `${fk},contact_id` }
  );
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Spotguide isn't live yet." }, { status: 503 });
    return NextResponse.json({ error: "Could not save your rating." }, { status: 500 });
  }

  const { data: rows } = await db.from(table).select("ratings").eq(fk, id);
  return NextResponse.json({ ok: true, summary: summariseRatings(rows ?? [], keys), mine: ratings });
}
