import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { softDelete } from "@/lib/archive";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/hotel-rooms/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const { id } = await params;

  const { data, error } = await client
    .from("exp_hotel_rooms")
    .select(
      "*, exp_bookings(id, name, status, contacts(name, email)), exp_experiences(id, title)"
    )
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

// PATCH /api/admin/hotel-rooms/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  // How many people the room sleeps belongs to the PHYSICAL room — a double is
  // a double every week — so it is pulled out of the week-row patch and written
  // through to exp_rooms below.
  const { sleeps, ...rest } = body;

  // "The hotel took this one back" only ever applies to a room we have NOT
  // sold: once a guest books, NP7 blocks the room at the hotel, so it cannot be
  // pulled. Releasing an occupied room would leave a paid guest with nowhere to
  // sleep and no signal anywhere, so it is refused.
  if (rest.released_at) {
    const { data: cur } = await client
      .from("exp_hotel_rooms").select("booking_id, extra_booking_ids").eq("id", id).maybeSingle();
    if (cur?.booking_id || (cur?.extra_booking_ids ?? []).length) {
      return NextResponse.json(
        { error: "This room has a guest in it. We block a room at the hotel the moment it's booked, so it can't be taken back — move the guest first if it really is gone." },
        { status: 409 }
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = { ...rest, updated_at: new Date().toISOString() };
  // "Hotel confirmed" refers to specific dates — changing check-in/out without
  // explicitly re-confirming resets the flag (the hotel OK'd the OLD dates).
  if (("check_in" in body || "check_out" in body) && !("hotel_confirmed" in body)) {
    const { data: cur } = await client.from("exp_hotel_rooms").select("check_in, check_out").eq("id", id).maybeSingle();
    const changed = cur && (("check_in" in body && body.check_in !== cur.check_in) || ("check_out" in body && body.check_out !== cur.check_out));
    if (changed) { patch.hotel_confirmed = false; patch.hotel_confirmed_at = null; }
  }
  if ("hotel_confirmed" in body) patch.hotel_confirmed_at = body.hotel_confirmed ? new Date().toISOString() : null;
  // Taking a room back frees it: it drops out of every bed count, and leaving it
  // "assigned" would read as ours-and-occupied on the Rooms tab.
  if (rest.released_at && !("status" in rest)) patch.status = "available";

  const { data, error } = await client
    .from("exp_hotel_rooms")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (data?.room_id && sleeps !== undefined) {
    const n = sleeps === null || sleeps === "" ? null : Number(sleeps);
    if (n === null || (Number.isFinite(n) && n >= 1)) {
      await client.from("exp_rooms").update({ sleeps: n }).eq("id", data.room_id);
    }
  }

  return NextResponse.json(data);
}

// DELETE /api/admin/hotel-rooms/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const { id } = await params;

  const { ok, error } = await softDelete(client, "exp_hotel_rooms", id);

  if (!ok) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
