import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { revalidateDestinationById } from "@/lib/revalidate-public";
import { COMMUNITY_VERIFY_THRESHOLD } from "@/lib/spotguide";
import { getStanding } from "@/lib/spotguide-trust";

/**
 * POST /api/portal/spotguide/verify-destination — cross-member verification of a
 * rider-proposed AREA (draft destination). Body: { destinationId, kind, note? }.
 * 3 member confirms (or one from a local specialist/moderator) publish the area —
 * the second path besides "its first spot got verified" (spotguide-trust).
 * Flags are collected for the NP7 contributions queue; nothing auto-hides.
 * A member can't verify their own proposal.
 */
export async function POST(request: NextRequest) {
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return NextResponse.json({ error: "Please sign in to verify." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const destinationId = (body.destinationId ?? "").trim();
  const kind = body.kind === "flag" ? "flag" : "confirm";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 600) : null;
  if (!destinationId) return NextResponse.json({ error: "Missing destination." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: dest } = await db.from("destinations").select("id, spotguide_status, submitted_by").eq("id", destinationId).maybeSingle();
  if (!dest || !dest.submitted_by) return NextResponse.json({ error: "Destination not found." }, { status: 404 });
  if (dest.spotguide_status === "published") return NextResponse.json({ ok: true, published: true });
  if (dest.submitted_by === user.contactId) return NextResponse.json({ error: "You can't verify your own proposal." }, { status: 403 });

  const { error } = await db.from("destination_verifications").upsert(
    { destination_id: destinationId, contact_id: user.contactId, kind, note },
    { onConflict: "destination_id,contact_id" }
  );
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Area verification isn't live yet." }, { status: 503 });
    return NextResponse.json({ error: "Could not record that." }, { status: 500 });
  }

  const { data: rows } = await db.from("destination_verifications").select("contact_id, kind").eq("destination_id", destinationId);
  const confirms = new Set((rows ?? []).filter((r: { kind: string }) => r.kind === "confirm").map((r: { contact_id: string }) => r.contact_id)).size;
  const flags = new Set((rows ?? []).filter((r: { kind: string }) => r.kind === "flag").map((r: { contact_id: string }) => r.contact_id)).size;

  let published = false;
  if (kind === "confirm") {
    const st = await getStanding(db, user.contactId, destinationId);
    if (confirms >= COMMUNITY_VERIFY_THRESHOLD || st.moderator || st.specialist) {
      await db.from("destinations").update({ spotguide_status: "published", updated_at: new Date().toISOString() }).eq("id", destinationId);
      published = true;
    }
  }
  // the 3rd confirm publishes a rider-proposed area — it has to appear now
  if (published) await revalidateDestinationById(db, destinationId, { alsoMagazine: true });
  return NextResponse.json({ ok: true, confirms, flags, published });
}
