import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
// PATCH /api/admin/purchasing/:id/lines/:lineId — qty/cost/notes
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id, lineId } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = {};
  if ("qty_ordered" in body) update.qty_ordered = Number(body.qty_ordered);
  if ("unit_cost" in body) update.unit_cost = body.unit_cost === "" || body.unit_cost == null ? null : Number(body.unit_cost);
  if ("notes" in body) update.notes = body.notes || null;

  const { data, error } = await db.from("hw_po_lines").update(update)
    .eq("id", lineId).eq("po_id", id)
    .select("*, hw_variants(id,name,sku,weight_g,box_l_mm,box_w_mm,box_h_mm,hw_products(id,name))").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE — only while nothing was shipped/received against the line
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id, lineId } = await params;
  const { data: line } = await db.from("hw_po_lines").select("qty_shipped,qty_received").eq("id", lineId).single();
  if (line && (line.qty_shipped > 0 || line.qty_received > 0)) {
    return NextResponse.json({ error: "Line already has shipped or received stock — adjust instead of deleting." }, { status: 409 });
  }
  const { error } = await db.from("hw_po_lines").delete().eq("id", lineId).eq("po_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
