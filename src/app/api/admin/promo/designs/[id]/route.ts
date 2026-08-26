import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// PUT /api/admin/promo/designs/[id] — update a saved design
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const body = await request.json();
  const { data, error } = await client
    .from("exp_promo_designs")
    .update({ name: body.name, format: body.format, state: body.state, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/promo/designs/[id] — archive (soft delete, house rule)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { error } = await client
    .from("exp_promo_designs")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
