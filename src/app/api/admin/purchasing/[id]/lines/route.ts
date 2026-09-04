import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
const LINE_SELECT = "*, hw_variants(id,name,sku,weight_g,box_l_mm,box_w_mm,box_h_mm,hw_products(id,name))";

// POST /api/admin/purchasing/:id/lines — add a line (cost autofilled from the
// supplier catalog when not given)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  if (!body.variant_id || !body.qty_ordered) {
    return NextResponse.json({ error: "variant_id and qty_ordered are required" }, { status: 400 });
  }

  const { data: po } = await db.from("hw_purchase_orders").select("supplier_id,status").eq("id", id).single();
  if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });
  if (["received", "closed", "cancelled"].includes(po.status)) {
    return NextResponse.json({ error: `Cannot add lines to a ${po.status} PO.` }, { status: 409 });
  }

  let unitCost = body.unit_cost === "" || body.unit_cost == null ? null : Number(body.unit_cost);
  let supplierSkuId: string | null = null;
  if (unitCost == null) {
    const { data: offer } = await db.from("hw_supplier_skus").select("id,unit_cost")
      .eq("supplier_id", po.supplier_id).eq("variant_id", body.variant_id)
      .order("valid_from", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    if (offer) { unitCost = offer.unit_cost; supplierSkuId = offer.id; }
  }

  const { data, error } = await db.from("hw_po_lines").insert({
    po_id: id,
    variant_id: body.variant_id,
    supplier_sku_id: supplierSkuId,
    qty_ordered: Number(body.qty_ordered),
    unit_cost: unitCost,
    notes: body.notes || null,
  }).select(LINE_SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
