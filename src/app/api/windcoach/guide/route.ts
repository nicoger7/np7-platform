import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase";

/**
 * POST /api/windcoach/guide — wind.coach pushes a participant's training guide
 * (integration brief §3). HMAC-authed with the shared WINDCOACH_WEBHOOK_SECRET,
 * idempotent on the guide id, and matching is never guessed: email + trip
 * window must agree on exactly ONE booking, otherwise the guide parks in the
 * review queue for a human.
 *
 * The signature check runs on the RAW body — parse-then-restringify would
 * break byte-equality for perfectly valid payloads.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.WINDCOACH_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Integration not configured." }, { status: 503 });

  const raw = await request.text();
  const theirs = request.headers.get("x-windcoach-signature") ?? "";
  const ours = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(theirs, "utf8");
  const b = Buffer.from(ours, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Body is not JSON." }, { status: 422 }); }

  const key = String(body?.idempotency_key ?? "").trim();
  const email = String(body?.participant?.email ?? "").trim().toLowerCase();
  if (!key) return NextResponse.json({ error: "idempotency_key required." }, { status: 422 });
  if (!email) return NextResponse.json({ error: "participant.email required." }, { status: 422 });
  const focusPoints = Array.isArray(body?.guide?.focus_points) ? body.guide.focus_points : [];
  if (!focusPoints.length) return NextResponse.json({ error: "guide.focus_points must be a non-empty array." }, { status: 422 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Replays are success, not conflict-to-debug: at-least-once delivery means
  // the sender WILL retry; 409 tells it the first attempt landed.
  const { data: dupe } = await db.from("windcoach_guides").select("id,status").eq("idempotency_key", key).maybeSingle();
  if (dupe) return NextResponse.json({ status: dupe.status, duplicate: true }, { status: 409 });

  // ── Match: email → contact → that contact's bookings inside the trip window ──
  const tripStart = typeof body?.trip?.start === "string" ? body.trip.start : null;
  const tripEnd = typeof body?.trip?.end === "string" ? body.trip.end : null;
  let bookingId: string | null = null;
  let contactId: string | null = null;
  const { data: contacts } = await db.from("contacts").select("id").ilike("email", email);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactIds = ((contacts ?? []) as any[]).map((c) => c.id);
  if (contactIds.length) {
    contactId = contactIds[0];
    const { data: bookings } = await db
      .from("exp_bookings")
      .select("id, contact_id, edition_id, exp_editions(date_start, date_end)")
      .in("contact_id", contactIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inWindow = ((bookings ?? []) as any[]).filter((bk) => {
      const s = bk.exp_editions?.date_start, e = bk.exp_editions?.date_end;
      if (!s || !e || !tripStart || !tripEnd) return false;
      return s <= tripEnd && tripStart <= e; // overlapping windows
    });
    if (inWindow.length === 1) { bookingId = inWindow[0].id; contactId = inWindow[0].contact_id; }
  }

  const { data: row, error } = await db
    .from("windcoach_guides")
    .insert({
      idempotency_key: key,
      booking_id: bookingId,
      contact_id: contactId,
      email,
      name: body?.participant?.name ?? null,
      trip_label: body?.trip?.label ?? null,
      trip_start: tripStart,
      trip_end: tripEnd,
      focus_points: focusPoints,
      coach_note: body?.guide?.coach_note ?? null,
      source_pdf_url: body?.guide?.pdf_url ?? null,
      generated_at: body?.guide?.generated_at ?? null,
      status: bookingId ? "stored" : "review",
    })
    .select("id,status")
    .single();
  if (error) {
    // unique-violation race between the dupe check and the insert = a replay
    if (/duplicate key/i.test(error.message)) return NextResponse.json({ status: "stored", duplicate: true }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ status: row.status });
}
