import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const client = createAdminClient();
  const { searchParams } = new URL(request.url);
  const experienceId = searchParams.get("experience_id");

  let query = client
    .from("todos")
    .select("*, team_members:assignee(id, name), exp_experiences:experience_id(id, title)")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (experienceId) query = query.eq("experience_id", experienceId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const client = createAdminClient();
  const body = await request.json();
  const { data, error } = await client.from("todos").insert(body).select("*, team_members:assignee(id, name), exp_experiences:experience_id(id, title)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
