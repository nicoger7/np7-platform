import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = createAdminClient();
  const { id } = await params;
  const { data, error } = await client.from("todos").select("*, team_members:assignee(id, name), exp_experiences:experience_id(id, title)").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();
  const { data, error } = await client.from("todos").update({ ...body, updated_at: new Date().toISOString() }).eq("id", id).select("*, team_members:assignee(id, name), exp_experiences:experience_id(id, title)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = createAdminClient();
  const { id } = await params;
  const { error } = await client.from("todos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
