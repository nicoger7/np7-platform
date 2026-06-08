import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/editions/:id — single edition with related counts
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = client as any;

  const [edition, bookingCount, packageCount, costCount, roomCount] =
    await Promise.all([
      adminClient
        .from("exp_editions")
        .select(`*, exp_experiences(id, title, slug, location, hero_image, currency)`)
        .eq("id", id)
        .single(),
      adminClient
        .from("exp_bookings")
        .select("id", { count: "exact", head: true })
        .eq("edition_id", id),
      adminClient
        .from("exp_packages")
        .select("id", { count: "exact", head: true })
        .eq("edition_id", id),
      adminClient
        .from("exp_costs")
        .select("id", { count: "exact", head: true })
        .eq("edition_id", id),
      adminClient
        .from("exp_hotel_rooms")
        .select("id", { count: "exact", head: true })
        .eq("edition_id", id),
    ]);

  if (edition.error) {
    return NextResponse.json({ error: edition.error.message }, { status: 404 });
  }

  return NextResponse.json({
    ...edition.data,
    _counts: {
      bookings: bookingCount.count ?? 0,
      packages: packageCount.count ?? 0,
      costs: costCount.count ?? 0,
      rooms: roomCount.count ?? 0,
    },
  });
}

// PUT /api/admin/editions/:id — update edition
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("exp_editions")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(`*, exp_experiences(id, title, slug, location)`)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

// PATCH /api/admin/editions/:id — partial update (alias for PUT)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return PUT(request, { params });
}

// DELETE /api/admin/editions/:id — delete edition
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (client as any)
    .from("exp_editions")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
