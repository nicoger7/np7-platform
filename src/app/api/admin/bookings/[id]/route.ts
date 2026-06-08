import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/bookings/:id — get booking with all related data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const [booking, payments, addons, tasks, hotelRooms] = await Promise.all([
    client
      .from("exp_bookings")
      .select(
        "*, contacts(name, email, phone, country, level, tshirt_size, diet_allergies), exp_experiences(title, slug), exp_editions(year, date_start, date_end), exp_packages(name, price)"
      )
      .eq("id", id)
      .single(),
    client
      .from("exp_payments")
      .select("*")
      .eq("booking_id", id)
      .order("date", { ascending: false }),
    client.from("exp_booking_addons").select("*, exp_components(*)").eq("booking_id", id),
    client
      .from("exp_tasks")
      .select("*")
      .eq("booking_id", id)
      .order("due_date"),
    client.from("exp_hotel_rooms").select("*").eq("booking_id", id),
  ]);

  if (booking.error) {
    return NextResponse.json(
      { error: booking.error.message },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ...booking.data,
    payments: payments.data || [],
    addons: addons.data || [],
    tasks: tasks.data || [],
    hotel_rooms: hotelRooms.data || [],
  });
}

// PATCH /api/admin/bookings/:id — update booking (status change, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  const { data, error } = await client
    .from("exp_bookings")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

// DELETE /api/admin/bookings/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const { error } = await client.from("exp_bookings").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
