import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const { searchParams } = new URL(request.url);
  const experienceId = searchParams.get("experience_id");
  const editionId = searchParams.get("edition_id");

  let query = client
    .from("exp_costs")
    .select("*, exp_experiences(id, title)")
    .order("date", { ascending: false });

  if (experienceId) query = query.eq("experience_id", experienceId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (editionId) query = (query as any).eq("edition_id", editionId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const body = await request.json();
  const { data, error } = await client.from("exp_costs").insert(body).select("*, exp_experiences(id, title)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
