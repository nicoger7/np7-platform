import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { softDelete } from "@/lib/archive";

const ALLOWED = ["name", "prefix", "location", "description", "website", "image_url", "images", "maps_url", "notes", "destination_id"];

// PUT /api/admin/centers/:id — update a center (incl. media)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  const sanitized = Object.fromEntries(Object.entries(body).filter(([k]) => ALLOWED.includes(k)));
  // Nothing else stamps updated_at — there is no trigger on this table — and a
  // column that never moves is worse than no column.
  const { data, error } = await db
    .from("centers")
    .update({ ...sanitized, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/centers/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const { ok, error } = await softDelete(db, "centers", id);
  if (!ok) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ success: true });
}
