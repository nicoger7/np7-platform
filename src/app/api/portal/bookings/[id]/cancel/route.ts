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
  const user = await getPortalUser().catch(() => null);
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

  return NextResponse.json({ ok: true });
}
