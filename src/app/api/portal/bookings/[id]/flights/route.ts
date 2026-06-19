import { NextRequest, NextResponse } from "next/server";
import { requirePortalApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { sanitizeFlightInfo, upsertFlightNote } from "@/lib/flights";

// PUT /api/portal/bookings/:id/flights — member saves/edits their flight details.
// Dates mirror to fly_in/fly_out (admin/Notion view); full detail goes to
// flight_info (migration 025) with a notes-sentinel fallback when that's unapplied.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const info = sanitizeFlightInfo(await request.json().catch(() => ({})));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: booking } = await db.from("exp_bookings").select("id").eq("id", id).eq("contact_id", auth.user.contactId).maybeSingle();
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const base = { fly_in: info.arrivalDate || null, fly_out: info.departureDate || null, updated_at: new Date().toISOString() };

  let { error } = await db.from("exp_bookings").update({ ...base, flight_info: info }).eq("id", id);
  if (error && /column|schema cache|does not exist/i.test(error.message)) {
    // pre-migration 025 — stash the full detail in a notes sentinel instead
    const { data: cur } = await db.from("exp_bookings").select("notes").eq("id", id).maybeSingle();
    const notes = upsertFlightNote(cur?.notes, info);
    ({ error } = await db.from("exp_bookings").update({ ...base, notes }).eq("id", id));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, flights: info });
}
