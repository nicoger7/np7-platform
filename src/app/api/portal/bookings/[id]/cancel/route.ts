import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

/**
 * Member-initiated cancellation REQUEST. We don't auto-cancel or auto-refund —
 * refunds/credit vouchers are handled by the team — so this just records the
 * request (a timestamped note on the booking) for the team to action. Ownership
 * is checked against the signed-in member.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getPortalUser({ allowPreview: false }).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: booking } = await db.from("exp_bookings").select("id, contact_id, notes").eq("id", id).maybeSingle();
  if (!booking || booking.contact_id !== user.contactId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const paidNote = typeof body.paid === "number" ? ` · paid so far: €${body.paid}` : "";
  const note = `[CANCELLATION REQUESTED ${stamp} by member${paidNote}]`;
  const notes = booking.notes ? `${booking.notes}\n${note}` : note;
  const { error } = await db.from("exp_bookings").update({ notes }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  /*
   * WHEN they asked, in a column the team-alert sweep can read (migration 265).
   * The note above stays the human record; a note cannot be swept, and this is
   * the guest action with the most money at stake, so the team is told about
   * it (Nico, 28 Sep 2026).
   *
   * Only the FIRST request is stamped: pressing the button twice is one
   * request, and the first is the moment that counts. A separate write, and
   * its failure ignored, because the request itself is already saved: until
   * the migration lands the column does not exist and this simply does
   * nothing.
   */
  const { error: stampErr } = await db.from("exp_bookings")
    .update({ cancellation_requested_at: new Date().toISOString() })
    .eq("id", id).is("cancellation_requested_at", null);
  if (stampErr) console.warn(`[cancel] request saved, time not stamped for ${id}:`, stampErr.message ?? stampErr);

  return NextResponse.json({ ok: true });
}
