import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
// PUT /api/admin/promo/designs/[id] — update a saved design
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
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

/**
 * PATCH — change ONE field without resending the artwork.
 *
 * Renaming from the gallery must not require shipping the whole state back:
 * a client with a stale copy would silently overwrite edits made elsewhere,
 * and a rename is not an edit to the graphic.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 120);
  if (Object.keys(patch).length === 1) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  const { data, error } = await client
    .from("exp_promo_designs").update(patch).eq("id", id).select("id,name").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/promo/designs/[id] — archive (soft delete, house rule)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
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
