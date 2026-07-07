import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// PATCH /api/admin/coaches/:id — edit a library coach (affects everywhere it's used)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["name", "role", "bio", "image_url", "cutout_url", "whatsapp_link"]) {
    if (k in body) patch[k] = body[k];
  }
  const doUpdate = (p: Record<string, unknown>) => client.from("exp_coaches").update(p).eq("id", id).select("*").single();
  let { data, error } = await doUpdate(patch);
  if (error && /column|schema cache|does not exist/i.test(error.message)) {
    const { whatsapp_link: _omit, ...rest } = patch; void _omit; // migration 027 not applied
    ({ data, error } = await doUpdate(rest));
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/coaches/:id — remove from the library (cascades to assignments)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const { error } = await client.from("exp_coaches").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
