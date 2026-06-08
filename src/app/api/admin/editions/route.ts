import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/editions — list editions (optionally filtered by experience_id or year)
export async function GET(request: NextRequest) {
  const client = createAdminClient();
  const { searchParams } = new URL(request.url);
  const experienceId = searchParams.get("experience_id");
  const year = searchParams.get("year");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (client as any)
    .from("exp_editions")
    .select(`*, exp_experiences(id, title, slug, location, hero_image)`)
    .order("year", { ascending: false });

  if (experienceId) query = query.eq("experience_id", experienceId);
  if (year) query = query.eq("year", parseInt(year, 10));

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// POST /api/admin/editions — create a new edition
export async function POST(request: NextRequest) {
  const client = createAdminClient();
  const body = await request.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = client as any;

  // Auto-generate slug and experience_code from the parent experience.
  //   slug = "<experience-slug>-<year>"
  //   experience_code = "<EXPERIENCE-CODE>-<year>"
  if (body.experience_id && body.year) {
    const { data: exp } = await adminClient
      .from("exp_experiences")
      .select("slug, code, currency, whatsapp_group_link")
      .eq("id", body.experience_id)
      .single();

    if (exp) {
      if (!body.slug && exp.slug) body.slug = `${exp.slug}-${body.year}`;
      if (!body.experience_code && exp.code)
        body.experience_code = `${exp.code}-${body.year}`;
      if (body.currency == null) body.currency = exp.currency || "EUR";
    }
  }

  const { data, error } = await adminClient
    .from("exp_editions")
    .insert(body)
    .select(`*, exp_experiences(id, title, slug, location)`)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
