import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { softDelete } from "@/lib/archive";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = createAdminClient();
  const { id } = await params;
  const { data, error } = await client.from("vendors").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();
  const { data, error } = await client
    .from("vendors")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = createAdminClient();
  const { id } = await params;
  const { ok, error } = await softDelete(client, "vendors", id);
  if (!ok) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ success: true });
}
