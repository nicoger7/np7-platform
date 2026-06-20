import { NextRequest, NextResponse } from "next/server";
import { requirePortalApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

// POST { bookingId, message } — member requests extra hotel nights / different
// flight dates. Recorded on the booking for the team to action from admin.
export async function POST(request: NextRequest) {
  const auth = await requirePortalApi();
  if (!auth.ok) return auth.res;

  const { bookingId, message } = await request.json().catch(() => ({}));
  if (!bookingId) return NextResponse.json({ error: "Missing booking" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: booking } = await db
    .from("exp_bookings").select("id, notes, contact_id")
    .eq("id", bookingId).eq("contact_id", auth.user.contactId).maybeSingle();
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const note = `[${stamp}] EXTRA-NIGHTS / FLIGHT REQUEST from ${auth.user.name}: ${String(message ?? "").slice(0, 500) || "(member requested extra nights / different flight dates)"}`;
  const notes = booking.notes ? `${booking.notes}\n${note}` : note;

  const { error } = await db.from("exp_bookings").update({ notes, updated_at: new Date().toISOString() }).eq("id", bookingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
