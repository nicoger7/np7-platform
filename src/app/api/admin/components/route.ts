import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/components — list components
export async function GET(request: NextRequest) {
  const client = createAdminClient();
  const { searchParams } = new URL(request.url);
  const experienceId = searchParams.get("experience_id");
  const category = searchParams.get("category");
  const globalOnly = searchParams.get("global");

  let query = client
    .from("exp_components")
    .select("*, exp_experiences(id, title)")
    .order("category")
    .order("name");

  if (experienceId) {
    // Show global + experience-specific
    query = query.or(`is_global.eq.true,experience_id.eq.${experienceId}`);
  }
  if (globalOnly === "true") {
    query = query.eq("is_global", true);
  }
  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/admin/components — create a component
export async function POST(request: NextRequest) {
  const client = createAdminClient();
  const body = await request.json();

  const { data, error } = await client
    .from("exp_components")
    .insert(body)
    .select("*, exp_experiences(id, title)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
