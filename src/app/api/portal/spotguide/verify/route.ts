import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { COMMUNITY_VERIFY_THRESHOLD } from "@/lib/spotguide";
import { getStanding, publishDestinationIfEarned } from "@/lib/spotguide-trust";

/**
 * POST /api/portal/spotguide/verify — cross-member verification of a pending,
 * member-submitted spot. Body: { spotId, kind: 'confirm'|'flag', category?, note? }.
 *   category 'location' (default) — the spot's existence/pin: 3 confirms → public,
 *                                    3 flags → hidden for NP7 review. (spot_verifications)
 *   category 'level' | 'conditions' — advisory per-field confirm/flag; doesn't
 *                                    change publishing. (spot_field_verifications)
 * A member can't verify their own submission.
 */
export async function POST(request: NextRequest) {
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return NextResponse.json({ error: "Please sign in to verify." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const spotId = (body.spotId ?? "").trim();
  const kind = body.kind === "flag" ? "flag" : "confirm";
  const category = ["level", "conditions"].includes(body.category) ? body.category : "location";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 600) : null;
  if (!spotId) return NextResponse.json({ error: "Missing spot." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: spot } = await db.from("spots").select("id, destination_id, submitted_by, verification, source").eq("id", spotId).maybeSingle();
  if (!spot) return NextResponse.json({ error: "Spot not found." }, { status: 404 });
  if (spot.submitted_by === user.contactId) return NextResponse.json({ error: "You can't verify your own spot." }, { status: 403 });

  // Per-field (level/conditions) — advisory only, own table.
  if (category !== "location") {
    const { error } = await db.from("spot_field_verifications").upsert(
      { spot_id: spotId, contact_id: user.contactId, field: category, kind },
      { onConflict: "spot_id,contact_id,field" }
    );
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Spotguide isn't live yet." }, { status: 503 });
      return NextResponse.json({ error: "Could not record that." }, { status: 500 });
    }
    const { data: rows } = await db.from("spot_field_verifications").select("contact_id, kind").eq("spot_id", spotId).eq("field", category);
    const c = new Set((rows ?? []).filter((r: { kind: string }) => r.kind === "confirm").map((r: { contact_id: string }) => r.contact_id)).size;
    const f = new Set((rows ?? []).filter((r: { kind: string }) => r.kind === "flag").map((r: { contact_id: string }) => r.contact_id)).size;
    return NextResponse.json({ ok: true, category, confirms: c, flags: f });
  }

  const { error } = await db.from("spot_verifications").upsert(
    { spot_id: spotId, contact_id: user.contactId, kind, note },
    { onConflict: "spot_id,contact_id" }
  );
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Spotguide isn't live yet." }, { status: 503 });
    return NextResponse.json({ error: "Could not record that." }, { status: 500 });
  }

  // Recount both sides.
  const { data: rows } = await db.from("spot_verifications").select("contact_id, kind").eq("spot_id", spotId);
  const confirms = new Set((rows ?? []).filter((r: { kind: string }) => r.kind === "confirm").map((r: { contact_id: string }) => r.contact_id)).size;
  const flags = new Set((rows ?? []).filter((r: { kind: string }) => r.kind === "flag").map((r: { contact_id: string }) => r.contact_id)).size;
  let verification = spot.verification;
  let hidden = false;

  if (kind === "confirm" && spot.verification === "pending") {
    // Auto-promote once it clears the threshold — or instantly if THIS confirm is
    // from a trusted local specialist/moderator.
    const st = await getStanding(db, user.contactId, spot.destination_id);
    if (confirms >= COMMUNITY_VERIFY_THRESHOLD || st.moderator || st.specialist) {
      await db.from("spots").update({ verification: "community", updated_at: new Date().toISOString() }).eq("id", spotId);
      verification = "community";
      await publishDestinationIfEarned(db, spot.destination_id); // rider place goes live off its first verified spot

    }
  } else if (kind === "flag" && spot.verification === "pending") {
    // Enough members say it's wrong → pull it from the public queue for NP7 review
    // (mirrors photo moderation). It's not deleted — admin decides.
    if (flags >= COMMUNITY_VERIFY_THRESHOLD) {
      await db.from("spots").update({ status: "hidden", updated_at: new Date().toISOString() }).eq("id", spotId);
      hidden = true;
    }
  }
  return NextResponse.json({ ok: true, category: "location", confirms, flags, verification, hidden });
}
