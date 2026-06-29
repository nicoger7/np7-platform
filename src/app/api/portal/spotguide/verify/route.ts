import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { COMMUNITY_VERIFY_THRESHOLD } from "@/lib/spotguide";

/**
 * POST /api/portal/spotguide/verify — cross-member verification of a pending,
 * member-submitted spot. Body: { spotId, kind: 'confirm'|'flag', note? }.
 * A member can't verify their own submission. Once COMMUNITY_VERIFY_THRESHOLD
 * distinct members confirm, a pending spot flips to community-verified (public).
 */
export async function POST(request: NextRequest) {
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return NextResponse.json({ error: "Please sign in to verify." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const spotId = (body.spotId ?? "").trim();
  const kind = body.kind === "flag" ? "flag" : "confirm";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 600) : null;
  if (!spotId) return NextResponse.json({ error: "Missing spot." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: spot } = await db.from("spots").select("id, submitted_by, verification, source").eq("id", spotId).maybeSingle();
  if (!spot) return NextResponse.json({ error: "Spot not found." }, { status: 404 });
  if (spot.submitted_by === user.contactId) return NextResponse.json({ error: "You can't verify your own spot." }, { status: 403 });

  const { error } = await db.from("spot_verifications").upsert(
    { spot_id: spotId, contact_id: user.contactId, kind, note },
    { onConflict: "spot_id,contact_id" }
  );
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Spotguide isn't live yet." }, { status: 503 });
    return NextResponse.json({ error: "Could not record that." }, { status: 500 });
  }

  // Recount; auto-promote a still-pending spot once it clears the threshold.
  const { data: confirmRows } = await db.from("spot_verifications").select("contact_id").eq("spot_id", spotId).eq("kind", "confirm");
  const confirms = new Set((confirmRows ?? []).map((r: { contact_id: string }) => r.contact_id)).size;
  let verification = spot.verification;
  if (kind === "confirm" && spot.verification === "pending" && confirms >= COMMUNITY_VERIFY_THRESHOLD) {
    await db.from("spots").update({ verification: "community", updated_at: new Date().toISOString() }).eq("id", spotId);
    verification = "community";
  }
  return NextResponse.json({ ok: true, confirms, verification });
}
