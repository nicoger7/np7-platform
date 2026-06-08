import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/bookings/:id/addons — list add-ons for a booking
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const { data, error } = await client
    .from("exp_booking_addons")
    .select("*, exp_components(id, name, category, unit_cost)")
    .eq("booking_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/admin/bookings/:id/addons — add an add-on to a booking
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  const { data, error } = await client
    .from("exp_booking_addons")
    .insert({
      booking_id: id,
      component_id: body.component_id || null,
      label: body.label,
      price: body.price || null,
      notes: body.notes || null,
    })
    .select("*, exp_components(id, name, category, unit_cost)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}

// DELETE /api/admin/bookings/:id/addons — remove an add-on
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const addonId = searchParams.get("addon_id");

  if (!addonId) {
    return NextResponse.json(
      { error: "addon_id is required" },
      { status: 400 }
    );
  }

  const { error } = await client
    .from("exp_booking_addons")
    .delete()
    .eq("id", addonId)
    .eq("booking_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
