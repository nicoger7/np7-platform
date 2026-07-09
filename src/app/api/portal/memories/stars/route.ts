import { NextRequest, NextResponse } from "next/server";
import { requirePortalApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

/**
 * Member-picked "keepers" — the photos/videos a participant wants kept forever
 * (they survive the retention purge — photos kept a year, videos 3 months). Same memory_stars table the admin uses, but
 * scoped + ownership-checked to the member's own booking. Admins can still fill
 * gaps for anyone who doesn't curate.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db() { return createAdminClient() as any; }

async function ownedBooking(bookingId: string, contactId: string) {
  const { data } = await db().from("exp_bookings").select("id, edition_id").eq("id", bookingId).eq("contact_id", contactId).maybeSingle();
  return data as { id: string; edition_id: string | null } | null;
}

// GET /api/portal/memories/stars?bookingId=  → the member's keepers for that trip
export async function GET(request: NextRequest) {
  const auth = await requirePortalApi();
  if (!auth.ok) return auth.res;
  const bookingId = request.nextUrl.searchParams.get("bookingId");
  if (!bookingId) return NextResponse.json({ error: "bookingId required" }, { status: 400 });
  const booking = await ownedBooking(bookingId, auth.user.contactId);
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await db().from("memory_stars").select("kind, ref").eq("booking_id", bookingId);
  if (error) {
    if (/memory_stars/.test(error.message) || error.code === "42P01") return NextResponse.json({ photos: [], videos: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as { kind: string; ref: string }[];
  return NextResponse.json({
    photos: rows.filter((r) => r.kind === "photo").map((r) => r.ref),
    videos: rows.filter((r) => r.kind === "video").map((r) => r.ref),
  });
}

// POST { bookingId, kind, ref, starred }  → set/unset one keeper (owner only)
export async function POST(request: NextRequest) {
  const auth = await requirePortalApi();
  if (!auth.ok) return auth.res;
  const { bookingId, kind, ref, starred } = await request.json().catch(() => ({}));
  if (!bookingId || !kind || !ref || (kind !== "photo" && kind !== "video")) {
    return NextResponse.json({ error: "bookingId, kind (photo|video) and ref are required" }, { status: 400 });
  }
  const booking = await ownedBooking(bookingId, auth.user.contactId);
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const admin = db();
  if (starred === false) {
    // A member can only clear a keeper tied to their own booking.
    const { error } = await admin.from("memory_stars").delete().eq("kind", kind).eq("ref", ref).eq("booking_id", bookingId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, starred: false });
  }
  const { error } = await admin.from("memory_stars")
    .upsert({ edition_id: booking.edition_id, booking_id: bookingId, kind, ref }, { onConflict: "kind,ref" });
  if (error) {
    if (/memory_stars/.test(error.message) || error.code === "42P01") return NextResponse.json({ ok: true, starred: true, pending: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, starred: true });
}
