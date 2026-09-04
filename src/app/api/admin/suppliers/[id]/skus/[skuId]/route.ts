import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
const EDITABLE = [
  "supplier_item_code", "unit_cost", "currency", "moq", "order_multiple",
  "lead_time_days", "incoterm", "preferential_origin", "valid_from", "valid_to", "notes",
] as const;
const NUMERIC = new Set(["unit_cost", "moq", "order_multiple", "lead_time_days"]);

// PATCH /api/admin/suppliers/:id/skus/:skuId
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; skuId: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id, skuId } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) {
    if (!(k in body)) continue;
    const v = body[k];
    update[k] = v === "" || v == null ? null : NUMERIC.has(k) ? Number(v) : v;
  }
  const { data, error } = await db.from("hw_supplier_skus").update(update)
    .eq("id", skuId).eq("supplier_id", id)
    .select("*, hw_variants(id,name,sku,hw_products(id,name))").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/suppliers/:id/skus/:skuId
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; skuId: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id, skuId } = await params;
  const { error } = await db.from("hw_supplier_skus").delete().eq("id", skuId).eq("supplier_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
