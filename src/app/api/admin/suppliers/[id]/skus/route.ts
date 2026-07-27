import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// POST /api/admin/suppliers/:id/skus — add a catalog row (variant offer)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  if (!body.variant_id) return NextResponse.json({ error: "variant_id is required" }, { status: 400 });

  const num = (v: unknown) => (v === "" || v == null ? null : Number(v));
  const { data, error } = await db.from("hw_supplier_skus").insert({
    supplier_id: id,
    variant_id: body.variant_id,
    supplier_item_code: body.supplier_item_code || null,
    unit_cost: num(body.unit_cost),
    currency: body.currency || "USD",
    moq: num(body.moq),
    order_multiple: num(body.order_multiple) ?? 1,
    lead_time_days: num(body.lead_time_days),
    incoterm: body.incoterm || null,
    preferential_origin: !!body.preferential_origin,
    valid_from: body.valid_from || null,
    valid_to: body.valid_to || null,
    notes: body.notes || null,
  }).select("*, hw_variants(id,name,sku,hw_products(id,name))").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
