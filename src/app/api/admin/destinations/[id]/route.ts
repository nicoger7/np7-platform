import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { revalidateSpotguide } from "@/lib/revalidate-public";

const COLS = [
  "name", "slug", "region", "country", "hero_image", "tagline", "intro",
  "wind_probability", "wind_season", "wind_speed", "best_season", "conditions",
  "skill_levels", "gallery", "partners", "status", "sort_order",
  // Spotguide (migration 062): rating track, level range, separate visibility, coords
  "np7_ratings", "level_min", "level_max", "levels", "spotguide_status", "lat", "lng",
  // Hero video (migration 073): looped YouTube segment behind the page header
  "hero_video_url", "hero_video_start", "hero_video_end",
  // Vibe tags (migration 076): powers the spotguide filter
  "tags",
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
  // Spotguide spots under this destination (tolerant — empty before migration 062).
  const { data: spots } = await db
    .from("spots")
    .select("id, name, slug, status, verification, level, hero_image, source")
    .eq("destination_id", id)
    .order("sort_order")
    .order("name");
  return NextResponse.json({ destination, trips: trips ?? [], spots: spots ?? [] });
}

// PATCH /api/admin/destinations/:id
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of COLS) if (k in body) patch[k] = body[k];
  let { data, error } = await db.from("destinations").update(patch).eq("id", id).select("*").single();
  // Tolerant of pre-migration-073: if the hero_video_* columns aren't there yet,
  // drop them and retry so saving a destination never breaks before the paste.
  if (error && /(hero_video_|\btags\b|\blevels\b)/.test(error.message || "")) {
    for (const k of ["hero_video_url", "hero_video_start", "hero_video_end", "tags", "levels"]) delete patch[k];
    ({ data, error } = await db.from("destinations").update(patch).eq("id", id).select("*").single());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // A rename / re-slug / publish-state change also alters the destination names
  // and links that magazine posts render, so those get flushed too; a ratings or
  // photo tweak stays inside the spotguide.
  const structural = ["name", "slug", "spotguide_status", "status", "region", "country"].some((k) => k in body);
  revalidateSpotguide(data?.slug ?? null, { alsoMagazine: structural });
  return NextResponse.json(data);
}

// DELETE /api/admin/destinations/:id
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  // grab the slug while the row still exists, so its page can be invalidated
  const { data: gone } = await db.from("destinations").select("slug").eq("id", id).maybeSingle();
  const { error } = await db.from("destinations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  revalidateSpotguide(gone?.slug ?? null, { alsoMagazine: true });
  return NextResponse.json({ success: true });
}
