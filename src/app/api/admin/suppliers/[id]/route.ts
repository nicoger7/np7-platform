import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { softDelete } from "@/lib/archive";
import { requireAdminGate } from "@/lib/admin-auth";
const EDITABLE = [
  "name", "country", "currency", "default_incoterm", "default_payment_terms",
  "contact_name", "contact_email", "contact_phone", "website", "notes",
] as const;

// GET /api/admin/suppliers/:id — supplier + catalog (variant + product names joined)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;

  const [{ data: supplier, error }, { data: skus }] = await Promise.all([
    db.from("hw_suppliers").select("*").eq("id", id).single(),
    db.from("hw_supplier_skus")
      .select("*, hw_variants(id,name,sku,hw_products(id,name))")
      .eq("supplier_id", id).order("created_at"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ ...supplier, skus: skus ?? [] });
}

// PATCH /api/admin/suppliers/:id
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) if (k in body) update[k] = body[k] === "" ? null : body[k];

  const { data, error } = await db.from("hw_suppliers").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/suppliers/:id — archive (soft delete)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const res = await softDelete(db, "hw_suppliers", id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
