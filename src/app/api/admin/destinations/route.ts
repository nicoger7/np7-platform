import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { revalidateSpotguide } from "@/lib/revalidate-public";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// GET /api/admin/destinations — list, enriched with how many experiences link to
// each place (its "Experience hat"). A place with 0 links is spotguide-only.
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("destinations").select("*").order("sort_order").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const dests = data ?? [];
  const { data: exps } = await db
    .from("exp_experiences").select("destination_id").not("destination_id", "is", null).is("archived_at", null);
  const counts: Record<string, number> = {};
  for (const e of exps ?? []) { const id = e.destination_id as string | null; if (id) counts[id] = (counts[id] ?? 0) + 1; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json(dests.map((d: any) => ({ ...d, experienceCount: counts[d.id] ?? 0 })));
}

// POST /api/admin/destinations — create
export async function POST(request: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const base = slugify(body.name);
  const { data, error } = await db
    .from("destinations")
    .insert({ name: body.name, slug: body.slug || base, region: body.region || null, country: body.country || null, status: body.status || "draft" })
    .select("*")
    .single();
  if (error) {
    if (/destinations|does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json({ error: "Run migration 022 first." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  revalidateSpotguide(data?.slug ?? null, { alsoMagazine: true });
  return NextResponse.json(data, { status: 201 });
}
