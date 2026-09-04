import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { softDelete } from "@/lib/archive";
import { requireAdminGate } from "@/lib/admin-auth";
const EDITABLE = [
  "name", "sku", "ean", "attributes", "weight_g", "box_l_mm", "box_w_mm", "box_h_mm",
  "hs_code", "customs_description", "country_of_origin", "preferential_origin",
  "customs_value", "serialized", "rrp", "lifecycle", "sort_order", "packaging_weights",
] as const;
const NUMERIC = new Set(["weight_g", "box_l_mm", "box_w_mm", "box_h_mm", "customs_value", "rrp", "sort_order"]);

// PATCH /api/admin/variants/:id
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) {
    if (!(k in body)) continue;
    const v = body[k];
    if (k === "sku" && typeof v === "string") { update[k] = v.trim().toUpperCase(); continue; }
    update[k] = v === "" ? null : NUMERIC.has(k) && v != null ? Number(v) : v;
  }
  const { data, error } = await db.from("hw_variants").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/variants/:id — archive
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const res = await softDelete(db, "hw_variants", id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
