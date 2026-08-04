import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { sanitizeFlightInfo, upsertFlightNote } from "@/lib/flights";

export const dynamic = "force-dynamic";

/**
 * Travel details, edited from the admin side.
 *
 * The member portal has always been able to write these; the admin could only
 * read them. But guests tell us their flights by WhatsApp and by email far more
 * often than they fill in a form, and there was nowhere to put that — so the
 * arrivals list stayed empty for people who had already told us.
 *
 * Deliberately the same shape and the same columns as the portal's own PUT:
 * flight_info holds the detail, fly_in/fly_out mirror the dates for the list
 * views and the Notion sync. One field, written by both sides, so "syncing"
 * is not a mechanism anyone has to maintain — the member sees an admin edit
 * and the admin sees a member edit because there is only one answer stored.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;

  const info = sanitizeFlightInfo(await request.json().catch(() => ({})));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const base = { fly_in: info.arrivalDate || null, fly_out: info.departureDate || null, updated_at: new Date().toISOString() };
  let { error } = await db.from("exp_bookings").update({ ...base, flight_info: info }).eq("id", id);
  if (error && /column|schema cache|does not exist/i.test(error.message)) {
    const { data: cur } = await db.from("exp_bookings").select("notes").eq("id", id).maybeSingle();
    ({ error } = await db.from("exp_bookings").update({ ...base, notes: upsertFlightNote(cur?.notes, info) }).eq("id", id));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, flights: info });
}
