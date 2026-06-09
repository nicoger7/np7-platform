import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/payments/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const { data, error } = await client
    .from("exp_payments")
    .select("*, exp_bookings(name, status), contacts(name), vendors(name), exp_experiences(title)")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// PATCH /api/admin/payments/:id
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();
  const { data, error } = await client
    .from("exp_payments")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/payments/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const { error } = await client.from("exp_payments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
