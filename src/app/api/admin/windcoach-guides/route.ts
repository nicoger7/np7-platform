import { NextRequest, NextResponse } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
/**
 * Admin review queue for wind.coach guides (table: windcoach_guides, migration 154).
 *
 * GET  — the queue: every guide newest-first. Each 'review' guide carries a small
 *        set of candidate bookings (contacts matched case-insensitively on the
 *        guide's email, with their bookings + edition/experience context).
 *        ?q=<term> switches to manual booking search instead: contacts matched
 *        ilike on name OR email, flattened to their bookings.
 * POST — { action: "attach", guide_id, booking_id } links a guide to a booking
 *        (verifies the booking exists, copies its contact_id, status 'stored');
 *        { action: "detach", guide_id } sends it back to review (booking_id and
 *        the booking-derived contact_id cleared).
 *
 * windcoach_guides is service-role only (RLS with no policies), so everything
 * goes through createAdminClient() behind the requireTeamApi() guard.
 */

const CONTACT_BOOKINGS_SELECT =
  "id, name, email, exp_bookings(id, name, status, exp_experiences(title), exp_editions(label, date_start, date_end))";

type EditionOut = { label: string | null; date_start: string | null; date_end: string | null };
export type CandidateBooking = {
  booking_id: string;
  booking_name: string | null;
  booking_status: string | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  experience_title: string | null;
  edition: EditionOut | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenBooking(b: any, contact: any): CandidateBooking {
  return {
    booking_id: b.id,
    booking_name: b.name ?? null,
    booking_status: b.status ?? null,
    contact_id: contact?.id ?? b.contact_id ?? null,
    contact_name: contact?.name ?? null,
    contact_email: contact?.email ?? null,
    experience_title: b.exp_experiences?.title ?? null,
    edition: b.exp_editions
      ? {
          label: b.exp_editions.label ?? null,
          date_start: b.exp_editions.date_start ?? null,
          date_end: b.exp_editions.date_end ?? null,
        }
      : null,
  };
}

/** Escape LIKE wildcards so a literal email/term matches itself, not a pattern. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Manual booking search for the attach box: contacts by name OR email.
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (q) {
    // Commas/parens would break the PostgREST or() filter syntax — blank them out.
    const term = escapeLike(q.replace(/[,()]/g, " ").trim());
    if (!term) return NextResponse.json({ bookings: [] });
    const { data, error } = await db
      .from("contacts")
      .select(CONTACT_BOOKINGS_SELECT)
      .or(`name.ilike.%${term}%,email.ilike.%${term}%`)
      .limit(10);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const bookings: CandidateBooking[] = (data ?? []).flatMap(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => (c.exp_bookings ?? []).map((b: any) => flattenBooking(b, c))
    );
    return NextResponse.json({ bookings });
  }

  const { data: guides, error } = await db
    .from("windcoach_guides")
    .select(
      "id, status, email, name, trip_label, trip_start, trip_end, focus_points, coach_note, generated_at, created_at, booking_id, " +
        "exp_bookings(id, name, status, contact_id, contacts(id, name, email), exp_experiences(title), exp_editions(label, date_start, date_end))"
    )
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out = [];
  for (const g of guides ?? []) {
    // Candidate bookings for unmatched guides: same email, case-insensitive.
    let candidates: CandidateBooking[] = [];
    if (g.status === "review" && g.email) {
      const { data: cs } = await db
        .from("contacts")
        .select(CONTACT_BOOKINGS_SELECT)
        .ilike("email", escapeLike(g.email))
        .limit(5);
      candidates = (cs ?? []).flatMap(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c: any) => (c.exp_bookings ?? []).map((b: any) => flattenBooking(b, c))
      );
    }
    const b = g.exp_bookings;
    out.push({
      id: g.id,
      status: g.status,
      email: g.email,
      name: g.name,
      trip_label: g.trip_label,
      trip_start: g.trip_start,
      trip_end: g.trip_end,
      focus_points: Array.isArray(g.focus_points) ? g.focus_points : [],
      coach_note: g.coach_note,
      generated_at: g.generated_at,
      created_at: g.created_at,
      booking_id: g.booking_id,
      booking: b ? flattenBooking(b, b.contacts) : null,
      candidates,
    });
  }
  return NextResponse.json({ guides: out });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const body = await request.json().catch(() => null);
  const action = body?.action;
  const guideId = typeof body?.guide_id === "string" ? body.guide_id : "";
  if (!guideId || (action !== "attach" && action !== "detach")) {
    return NextResponse.json({ error: "action ('attach' or 'detach') and guide_id required" }, { status: 400 });
  }

  if (action === "attach") {
    const bookingId = typeof body?.booking_id === "string" ? body.booking_id : "";
    if (!bookingId) return NextResponse.json({ error: "booking_id required" }, { status: 400 });

    const { data: booking, error: bErr } = await db
      .from("exp_bookings")
      .select("id, contact_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    const { data, error } = await db
      .from("windcoach_guides")
      .update({
        booking_id: booking.id,
        contact_id: booking.contact_id ?? null,
        status: "stored",
        updated_at: new Date().toISOString(),
      })
      .eq("id", guideId)
      .select("id, status, booking_id, contact_id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    return NextResponse.json({ ok: true, guide: data });
  }

  // detach — back to the review queue. contact_id is cleared too: it was derived
  // from the (now rejected) booking, and candidates are recomputed from the email.
  const { data, error } = await db
    .from("windcoach_guides")
    .update({ booking_id: null, contact_id: null, status: "review", updated_at: new Date().toISOString() })
    .eq("id", guideId)
    .select("id, status, booking_id, contact_id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Guide not found" }, { status: 404 });
  return NextResponse.json({ ok: true, guide: data });
}
