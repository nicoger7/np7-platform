import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// GET /api/admin/destinations — list
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db.from("destinations").select("*").order("sort_order").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
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
  return NextResponse.json(data, { status: 201 });
}
