import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// The [id] segment is the experience_id that this content belongs to.

type ProgramItem = { title: string; description: string };
type FaqItem = { q: string; a: string };

const EMPTY = {
  location_about: "",
  week_info: "",
  daily_program: [] as ProgramItem[],
  highlights: [] as string[],
  faq: [] as FaqItem[],
};

// Until the exp_content table is created in Supabase, treat its absence as
// "no content yet" so the admin/front-end keep working.
function isMissingTable(message?: string | null) {
  return !!message && /exp_content/.test(message) && /(does not exist|schema cache|relation)/i.test(message);
}

// GET /api/admin/content/:experienceId — content for one experience (defaults if none)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;
  const { id } = await params;

  const { data, error } = await db
    .from("exp_content")
    .select("*")
    .eq("experience_id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ experience_id: id, ...EMPTY, _tableMissing: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data ?? { experience_id: id, ...EMPTY });
}

// PUT /api/admin/content/:experienceId — upsert the content row
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;
  const { id } = await params;
  const body = await request.json();

  // Sanitize: only the website-content fields, normalised to safe shapes.
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

  const row = {
    experience_id: id,
    location_about: typeof body.location_about === "string" ? body.location_about : "",
    week_info: typeof body.week_info === "string" ? body.week_info : "",
    daily_program: program,
    highlights,
    faq,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from("exp_content")
    .upsert(row, { onConflict: "experience_id" })
    .select()
    .single();

  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json(
        { error: "The exp_content table doesn't exist yet. Run migration 012 in the Supabase SQL editor." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
