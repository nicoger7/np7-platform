import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// PATCH /api/admin/purchasing/:id/milestones/:mid
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; mid: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id, mid } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = {};
  for (const k of ["kind", "label", "planned_date", "actual_date", "note"]) if (k in body) update[k] = body[k] || null;
  if ("sort_order" in body) update.sort_order = Number(body.sort_order) || 0;

  const { data, error } = await db.from("hw_po_milestones").update(update).eq("id", mid).eq("po_id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/purchasing/:id/milestones/:mid
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; mid: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id, mid } = await params;
  const { error } = await db.from("hw_po_milestones").delete().eq("id", mid).eq("po_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
