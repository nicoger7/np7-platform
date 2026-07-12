import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { softDelete } from "@/lib/archive";

// GET /api/admin/hotel-rooms/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = { ...body, updated_at: new Date().toISOString() };
  // "Hotel confirmed" refers to specific dates — changing check-in/out without
  // explicitly re-confirming resets the flag (the hotel OK'd the OLD dates).
  if (("check_in" in body || "check_out" in body) && !("hotel_confirmed" in body)) {
    const { data: cur } = await client.from("exp_hotel_rooms").select("check_in, check_out").eq("id", id).maybeSingle();
    const changed = cur && (("check_in" in body && body.check_in !== cur.check_in) || ("check_out" in body && body.check_out !== cur.check_out));
    if (changed) { patch.hotel_confirmed = false; patch.hotel_confirmed_at = null; }
  }
  if ("hotel_confirmed" in body) patch.hotel_confirmed_at = body.hotel_confirmed ? new Date().toISOString() : null;

  const { data, error } = await client
    .from("exp_hotel_rooms")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

// DELETE /api/admin/hotel-rooms/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const { ok, error } = await softDelete(client, "exp_hotel_rooms", id);

  if (!ok) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
