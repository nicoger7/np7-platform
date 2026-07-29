import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import type { SpecRow, FitSegment } from "@/lib/hardware/types";

const EMPTY = {
  hero_image: null as string | null,
  hero_focus: null as string | null,
  tile_image: null as string | null,
  tile_focus: null as string | null,
  hero_video_url: null as string | null,
  gallery: [] as string[],
  tagline: null as string | null,
  overview: null as string | null,
  highlights: [] as string[],
  spec_rows: [] as SpecRow[],
  find_your_fit: [] as FitSegment[],
};

function isMissing(message?: string | null) {
  return (
    !!message &&
    /hw_product_content|column|does not exist|schema cache/i.test(message)
  );
}

// GET /api/admin/products/:id/content
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;

  const { data, error } = await client
    .from("hw_product_content")
    .select("*")
    .eq("product_id", id)
    .maybeSingle();

  if (error && !isMissing(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    product_id: id,
    ...EMPTY,
    ...(data ?? {}),
  });
}

// PUT /api/admin/products/:id/content — upsert product content
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  // highlights: array of non-empty strings
  const highlights: string[] = Array.isArray(body.highlights)
    ? body.highlights
        .map((h: unknown) => String(h ?? ""))
        .filter((h: string) => h.trim())
    : [];

  // spec_rows: array of {label, value} with at least one non-empty
  const spec_rows: SpecRow[] = Array.isArray(body.spec_rows)
    ? body.spec_rows
        .map((s: Partial<SpecRow>) => ({
          label: String(s?.label ?? ""),
          value: String(s?.value ?? ""),
        }))
        .filter((s: SpecRow) => s.label.trim() || s.value.trim())
    : [];

  // gallery: array of non-empty strings
  const gallery: string[] = Array.isArray(body.gallery)
    ? body.gallery
        .map((g: unknown) => String(g ?? ""))
        .filter((g: string) => g.trim())
    : [];

  // find_your_fit: array of FitSegment
  const find_your_fit: FitSegment[] = Array.isArray(body.find_your_fit)
    ? body.find_your_fit
        .map((f: Partial<FitSegment>) => ({
          id: typeof f?.id === "string" && f.id ? f.id : crypto.randomUUID(),
          chip: String(f?.chip ?? ""),
          tag: String(f?.tag ?? ""),
          title: String(f?.title ?? ""),
          body: String(f?.body ?? ""),
          points: Array.isArray(f?.points)
            ? f.points.map((p: unknown) => String(p ?? ""))
            : [],
          cta: String(f?.cta ?? ""),
          cta_href: String(f?.cta_href ?? ""),
          icon: String(f?.icon ?? "spark"),
          image: String(f?.image ?? ""),
        }))
        .filter((f: FitSegment) => f.title.trim() || f.body.trim())
    : [];

  const row = {
    product_id: id,
    hero_image: typeof body.hero_image === "string" ? body.hero_image : null,
    hero_focus: typeof body.hero_focus === "string" && body.hero_focus.trim() ? body.hero_focus.trim() : null,
    tile_image: typeof body.tile_image === "string" && body.tile_image.trim() ? body.tile_image.trim() : null,
    tile_focus: typeof body.tile_focus === "string" && body.tile_focus.trim() ? body.tile_focus.trim() : null,
    hero_video_url: typeof body.hero_video_url === "string" ? body.hero_video_url : null,
    gallery,
    tagline: typeof body.tagline === "string" ? body.tagline : null,
    overview: typeof body.overview === "string" ? body.overview : null,
    highlights,
    spec_rows,
    find_your_fit,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from("hw_product_content")
    .upsert(row, { onConflict: "product_id" })
    .select()
    .single();

  if (error) {
    if (isMissing(error.message)) {
      return NextResponse.json(
        { error: "Run migration 020 first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
