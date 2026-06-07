import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/experiences/:id — get experience with packages + costs
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const [experience, packages, costs, bookings] = await Promise.all([
    client.from("exp_experiences").select("*").eq("id", id).single(),
    client
      .from("exp_packages")
      .select("*")
      .eq("experience_id", id)
      .order("sort_order"),
    client
      .from("exp_costs")
      .select("*")
      .eq("experience_id", id)
      .order("created_at"),
    client
      .from("exp_bookings")
      .select("*, contacts(name, email, phone)")
      .eq("experience_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (experience.error) {
    return NextResponse.json(
      { error: experience.error.message },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ...experience.data,
    packages: packages.data || [],
    costs: costs.data || [],
    bookings: bookings.data || [],
  });
}

// PATCH /api/admin/experiences/:id — update an experience
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  const { data, error } = await client
    .from("exp_experiences")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

// DELETE /api/admin/experiences/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const { error } = await client
    .from("exp_experiences")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
