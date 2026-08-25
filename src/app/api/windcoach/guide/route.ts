import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/windcoach/guide — wind.coach pushes a participant's training guide
 * (integration brief §3, contract frozen 2026-08-25). HMAC-SHA256 over the RAW
 * body, idempotent on idempotency_key, and matching is never guessed: email +
 * trip window must agree on exactly ONE booking, otherwise the guide parks in
 * the review queue for a human.
 *
 * Contract responses, exactly:
 *   200 {"status":"stored"}              matched to a booking
 *   200 {"status":"queued_for_review"}   not unambiguously matchable
 *   401                                  bad signature OR secret not configured
 *   409                                  idempotency_key already seen
 *   422                                  schema problem, offending field NAMED
 *
 * v1 tolerances (do not tighten): guide.pdf_url may be absent or present;
 * focus_points[].image_urls may be empty or filled; block `kind` values we do
 * not know must still pass; focus_points[].key is wind.coach's book id and is
 * stored verbatim.
 *
 * The signature check runs on the RAW text — parse-then-restringify would
 * break byte-equality for perfectly valid payloads.
 */

/** DB status → contract wire status. The queue is called "review" internally. */
const wire = (s: string) => (s === "stored" ? "stored" : "queued_for_review");

function fail422(field: string, why: string) {
  return NextResponse.json({ error: `${field}: ${why}` }, { status: 422 });
}

export async function POST(request: NextRequest) {
  const secret = process.env.WINDCOACH_WEBHOOK_SECRET;
  const raw = await request.text();
  // Fail closed as an auth failure, per contract: no secret, no service.
  if (!secret) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const theirs = request.headers.get("x-windcoach-signature") ?? "";
  const ours = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(theirs, "utf8");
  const b = Buffer.from(ours, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = JSON.parse(raw); } catch { return fail422("body", "not valid JSON"); }

  const key = String(body?.idempotency_key ?? "").trim();
  if (!key) return fail422("idempotency_key", "required");
  const email = String(body?.participant?.email ?? "").trim().toLowerCase();
  if (!email) return fail422("participant.email", "required");

  const focusPoints = body?.guide?.focus_points;
  if (!Array.isArray(focusPoints) || focusPoints.length === 0) {
    return fail422("guide.focus_points", "must be a non-empty array");
  }
  for (let i = 0; i < focusPoints.length; i++) {
    const fp = focusPoints[i];
    const at = `guide.focus_points[${i}]`;
    if (!fp || typeof fp !== "object") return fail422(at, "must be an object");
    if (typeof fp.key !== "string" || !fp.key.trim()) return fail422(`${at}.key`, "required string");
    if (typeof fp.title !== "string" || !fp.title.trim()) return fail422(`${at}.title`, "required string");
    if (fp.summary != null && typeof fp.summary !== "string") return fail422(`${at}.summary`, "must be a string");
    if (!Array.isArray(fp.blocks)) return fail422(`${at}.blocks`, "must be an array");
    for (let j = 0; j < fp.blocks.length; j++) {
      const bl = fp.blocks[j];
      const bat = `${at}.blocks[${j}]`;
      if (!bl || typeof bl !== "object") return fail422(bat, "must be an object");
      // Unknown `kind` values are ALLOWED (forward compatibility); they must
      // simply be strings. Same for text.
      if (typeof bl.kind !== "string" || !bl.kind.trim()) return fail422(`${bat}.kind`, "required string");
      if (typeof bl.text !== "string") return fail422(`${bat}.text`, "required string");
    }
    if (fp.image_urls != null) {
      if (!Array.isArray(fp.image_urls)) return fail422(`${at}.image_urls`, "must be an array");
      for (let j = 0; j < fp.image_urls.length; j++) {
        if (typeof fp.image_urls[j] !== "string") return fail422(`${at}.image_urls[${j}]`, "must be a string");
      }
    }
  }
  if (body?.guide?.pdf_url != null && typeof body.guide.pdf_url !== "string") {
    return fail422("guide.pdf_url", "must be a string when present");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Replays are success, not conflict-to-debug: at-least-once delivery means
  // the sender WILL retry; 409 tells it the first attempt landed.
  const { data: dupe } = await db.from("windcoach_guides").select("id,status").eq("idempotency_key", key).maybeSingle();
  if (dupe) return NextResponse.json({ status: wire(dupe.status), duplicate: true }, { status: 409 });

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
    // Unique-violation race between the dupe check and the insert = a replay.
    // Re-read the winner so the 409 reports its real status.
    if (/duplicate key/i.test(error.message)) {
      const { data: winner } = await db.from("windcoach_guides").select("status").eq("idempotency_key", key).maybeSingle();
      return NextResponse.json({ status: wire(winner?.status ?? "review"), duplicate: true }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ status: wire(row.status) });
}
