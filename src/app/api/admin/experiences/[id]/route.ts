import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/experiences/:id — get experience with editions
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = client as any;

  const [experience, editions, packages, costs, bookings] = await Promise.all([
    client.from("exp_experiences").select("*").eq("id", id).single(),
    adminClient
      .from("exp_editions")
      .select("*")
      .eq("experience_id", id)
      .order("year", { ascending: false }),
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
    editions: editions.data || [],
    packages: packages.data || [],
    costs: costs.data || [],
    bookings: bookings.data || [],
  });
}

// PATCH /api/admin/experiences/:id — update an experience (template fields only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  // Sanitize: only allow template-level fields (no year-specific columns)
  const allowed = [
    "title", "slug", "location", "location_country", "description",
    "whats_included", "hero_image", "gallery", "cancellation_policy",
    "status", "currency", "timezone", "hotel", "airport_code",
    "whatsapp_group_link", "notes", "active_status", "location_lat",
    "location_lng", "total_fixed_costs", "notion_id",
  ];
  const sanitized = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  );

  const { data, error } = await client
    .from("exp_experiences")
    .update({ ...sanitized, updated_at: new Date().toISOString() })
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
