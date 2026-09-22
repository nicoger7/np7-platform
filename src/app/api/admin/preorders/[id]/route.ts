import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";

const EDITABLE = [
  "season", "audience", "label", "opens_on", "closes_on", "discount_pct",
  "deposit_kind", "deposit_value", "balance_due", "ships_from", "note", "status",
] as const;

/** PATCH /api/admin/preorders/:id — edit a window, or open and close it. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of EDITABLE) if (key in body) patch[key] = body[key];
  if (patch.ships_from === "") patch.ships_from = null;

  const opens = (patch.opens_on ?? body.opens_on) as string | undefined;
  const closes = (patch.closes_on ?? body.closes_on) as string | undefined;
  if (opens && closes && closes < opens) {
    return NextResponse.json({ error: "A window cannot close before it opens" }, { status: 400 });
  }

  const { data, error } = await db.from("hw_preorder_windows").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** DELETE /api/admin/preorders/:id — archives it, like everything else here. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;

  const { data: orders } = await db.from("hw_orders").select("id").eq("preorder_window_id", id).limit(1);
  if ((orders ?? []).length) {
    return NextResponse.json({ error: "Orders were placed in this window. Close it instead of archiving it." }, { status: 400 });
  }
  const { error } = await db.from("hw_preorder_windows")
    .update({ archived_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
