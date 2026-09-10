import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
import { cleanKeywords } from "@/lib/flag-store";

// PATCH /api/admin/promo/flags/[id] — change a flag's name, image or keywords
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 60);
  if (typeof body.src === "string" && body.src.trim()) patch.src = body.src.trim();
  if (body.keywords !== undefined) patch.keywords = cleanKeywords(body.keywords);
  if (body.sort !== undefined) patch.sort = Number(body.sort) || 0;
  if (Object.keys(patch).length === 1) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data, error } = await client
    .from("exp_flags").update(patch).eq("id", id).select("id, code, name, src, keywords, sort").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

/**
 * DELETE — archive, the house rule (src/lib/archive.ts).
 *
 * It matters more here than usual: a flag that is deleted outright disappears
 * from every saved design that referenced its image, and a poster made three
 * months ago would quietly lose its drape. Archiving keeps the row, so the URL
 * in the saved state still resolves; it only stops being offered and stops
 * matching new locations.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { error } = await client
    .from("exp_flags").update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
