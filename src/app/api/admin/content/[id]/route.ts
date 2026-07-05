import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// The [id] segment is the experience_id that this content belongs to.

type ProgramItem = { title: string; description: string };
type FaqItem = { q: string; a: string };
type Review = { name: string; country: string; quote: string; rating: number; image: string };

const EMPTY = {
  location_about: "",
  week_info: "",
  daily_program: [] as ProgramItem[],
  highlights: [] as string[],
  faq: [] as FaqItem[],
  hero_image: "",
  hero_video_url: "",
  hero_video_start: null as number | null,
  hero_video_end: null as number | null,
  gallery: [] as string[],
  reviews: [] as Review[],
  no_wind_program: "",
  wind_probability: "",
  wind_range: "",
  packing_list: "",
  pre_trip_note: "",
};

// Coerce a hero-video timestamp to a non-negative integer second count (or null).
function toSeconds(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Until migration 013 is applied, treat the missing table/columns as "empty".
function isMissing(message?: string | null) {
  return !!message && /(exp_content|hero_image|hero_video_url|gallery|reviews|column)/i.test(message) && /(does not exist|schema cache|relation|column)/i.test(message);
}

// GET /api/admin/content/:experienceId — content + the experience's tile image
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;
  const { id } = await params;

  const [{ data: content, error }, { data: exp }] = await Promise.all([
    db.from("exp_content").select("*").eq("experience_id", id).maybeSingle(),
    db.from("exp_experiences").select("hero_image,title,slug").eq("id", id).maybeSingle(),
  ]);

  if (error && !isMissing(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Tolerant: `tile_auto` (migration 069) may not exist yet — treat as off.
  const { data: exAuto } = await db.from("exp_experiences").select("tile_auto").eq("id", id).maybeSingle();

  return NextResponse.json({
    experience_id: id,
    ...EMPTY,
    ...(content ?? {}),
    tile_image: exp?.hero_image ?? "",
    tile_auto: !!exAuto?.tile_auto,
    _title: exp?.title ?? "",
    _slug: exp?.slug ?? "",
  });
}

// PUT /api/admin/content/:experienceId — upsert content (+ mirror tile to the experience)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;
  const { id } = await params;
  const body = await request.json();

  const program: ProgramItem[] = Array.isArray(body.daily_program)
    ? body.daily_program
        .map((p: ProgramItem) => ({ title: String(p?.title ?? ""), description: String(p?.description ?? "") }))
        .filter((p: ProgramItem) => p.title.trim() || p.description.trim())
    : [];
  const faq: FaqItem[] = Array.isArray(body.faq)
    ? body.faq
        .map((f: FaqItem) => ({ q: String(f?.q ?? ""), a: String(f?.a ?? "") }))
        .filter((f: FaqItem) => f.q.trim() || f.a.trim())
    : [];
  const highlights: string[] = Array.isArray(body.highlights)
    ? body.highlights.map((h: unknown) => String(h ?? "")).filter((h: string) => h.trim())
    : [];
  const gallery: string[] = Array.isArray(body.gallery)
    ? body.gallery.map((g: unknown) => String(g ?? "")).filter((g: string) => g.trim())
    : [];
  const reviews: Review[] = Array.isArray(body.reviews)
    ? body.reviews
        .map((r: Partial<Review>) => ({
          name: String(r?.name ?? ""),
          country: String(r?.country ?? ""),
          quote: String(r?.quote ?? ""),
          rating: Math.max(1, Math.min(5, Number(r?.rating) || 5)),
          image: String(r?.image ?? ""),
        }))
        .filter((r: Review) => r.quote.trim() || r.name.trim())
    : [];

  const row = {
    experience_id: id,
    location_about: typeof body.location_about === "string" ? body.location_about : "",
    week_info: typeof body.week_info === "string" ? body.week_info : "",
    daily_program: program,
    highlights,
    faq,
    hero_image: typeof body.hero_image === "string" ? body.hero_image : "",
    hero_video_url: typeof body.hero_video_url === "string" ? body.hero_video_url : "",
    hero_video_start: toSeconds(body.hero_video_start),
    hero_video_end: toSeconds(body.hero_video_end),
    gallery,
    reviews,
    no_wind_program: typeof body.no_wind_program === "string" ? body.no_wind_program : "",
    wind_probability: typeof body.wind_probability === "string" ? body.wind_probability : "",
    wind_range: typeof body.wind_range === "string" ? body.wind_range : "",
    packing_list: typeof body.packing_list === "string" ? body.packing_list : "",
    pre_trip_note: typeof body.pre_trip_note === "string" ? body.pre_trip_note : "",
    updated_at: new Date().toISOString(),
  };

  let { data, error } = await db
    .from("exp_content")
    .upsert(row, { onConflict: "experience_id" })
    .select()
    .single();

  // Pre-migration-051 fallback: if the pre-trip columns don't exist yet, retry
  // without them so content still saves.
  if (error && /(packing_list|pre_trip_note)/.test(error.message || "")) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { packing_list: _p, pre_trip_note: _n, ...rest } = row;
    ({ data, error } = await db.from("exp_content").upsert(rest, { onConflict: "experience_id" }).select().single());
  }

  // Pre-migration-018 fallback: if the timestamp columns don't exist yet,
  // retry without them so content still saves.
  if (error && /hero_video_(start|end)/.test(error.message || "")) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { hero_video_start: _s, hero_video_end: _e, ...rest } = row;
    ({ data, error } = await db
      .from("exp_content")
      .upsert(rest, { onConflict: "experience_id" })
      .select()
      .single());
  }

  if (error) {
    if (isMissing(error.message)) {
      return NextResponse.json(
        { error: "Run migration 012/013 in the Supabase SQL editor first (exp_content table + media columns)." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Mirror the tile image onto the experience (the listing card / experiences admin).
  if (typeof body.tile_image === "string") {
    await db.from("exp_experiences").update({ hero_image: body.tile_image }).eq("id", id);
  }
  // Auto-brand toggle (migration 069). Tolerant: ignore if the column is absent.
  if (typeof body.tile_auto === "boolean") {
    await db.from("exp_experiences").update({ tile_auto: body.tile_auto }).eq("id", id);
  }

  return NextResponse.json(data);
}
