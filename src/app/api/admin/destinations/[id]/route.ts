import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

const COLS = [
  "name", "slug", "region", "country", "hero_image", "tagline", "intro",
  "wind_probability", "wind_season", "wind_speed", "best_season", "conditions",
  "skill_levels", "gallery", "partners", "status", "sort_order",
];

// GET /api/admin/destinations/:id — destination + the trips that point to it
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const { data: destination, error } = await db.from("destinations").select("*").eq("id", id).maybeSingle();
  if (error || !destination) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: trips } = await db
    .from("exp_experiences")
    .select("id, title, slug, status")
    .eq("destination_id", id)
    .order("title");
  return NextResponse.json({ destination, trips: trips ?? [] });
}

// PATCH /api/admin/destinations/:id
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of COLS) if (k in body) patch[k] = body[k];
  const { data, error } = await db.from("destinations").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/destinations/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const { error } = await db.from("destinations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
