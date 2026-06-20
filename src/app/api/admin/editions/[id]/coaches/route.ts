import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/editions/:id/coaches — guides assigned to this edition (with library coach embedded)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const { data, error } = await client
    .from("exp_edition_coaches")
    .select("*, exp_coaches(id, name, role, bio, image_url)")
    .eq("edition_id", id)
    .order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/admin/editions/:id/coaches — assign an existing coach (coach_id) or
// create a new library coach (name/role/bio/image_url) and assign it.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  let coachId: string | undefined = body.coach_id;
  if (!coachId) {
    if (!body.name) return NextResponse.json({ error: "coach_id or name required" }, { status: 400 });
    const { data: coach, error: cErr } = await client
      .from("exp_coaches")
      .insert({ name: body.name, role: body.role || null, bio: body.bio || null, image_url: body.image_url || null })
      .select("id")
      .single();
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 });
    coachId = coach.id;
  }

  // next sort_order
  const { data: existing } = await client
    .from("exp_edition_coaches")
    .select("sort_order")
    .eq("edition_id", id)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSort = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await client
    .from("exp_edition_coaches")
    .insert({ edition_id: id, coach_id: coachId, sort_order: nextSort })
    .select("*, exp_coaches(id, name, role, bio, image_url)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/admin/editions/:id/coaches — update a link's overrides / sort_order
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  if (!body.coach_id) return NextResponse.json({ error: "coach_id required" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  for (const k of ["sort_order", "name_override", "role_override", "bio_override", "image_override"]) {
    if (k in body) patch[k] = body[k] === "" ? null : body[k];
  }
  const { data, error } = await client
    .from("exp_edition_coaches")
    .update(patch)
    .eq("edition_id", id)
    .eq("coach_id", body.coach_id)
    .select("*, exp_coaches(id, name, role, bio, image_url)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/editions/:id/coaches?coach_id= — unassign from this edition
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const coachId = new URL(request.url).searchParams.get("coach_id");
  if (!coachId) return NextResponse.json({ error: "coach_id required" }, { status: 400 });
  const { error } = await client
    .from("exp_edition_coaches")
    .delete()
    .eq("edition_id", id)
    .eq("coach_id", coachId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
