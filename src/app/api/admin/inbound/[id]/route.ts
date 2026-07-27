import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { softDelete } from "@/lib/archive";

const EDITABLE = [
  "reference", "mode", "incoterm", "container_no", "carrier", "forwarder",
  "etd", "eta", "ata", "customs_cleared_at", "notes",
] as const;

// GET /api/admin/inbound/:id — shipment bundle (lines with PO + variant context, costs)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;

  const [shipment, lines, costs] = await Promise.all([
    db.from("hw_inbound_shipments").select("*").eq("id", id).single(),
    db.from("hw_inbound_lines")
      .select("*, hw_po_lines(id,po_id,qty_ordered,qty_shipped,qty_received,unit_cost, hw_purchase_orders(id,po_number,currency), hw_variants(id,name,sku,weight_g,box_l_mm,box_w_mm,box_h_mm,hw_products(id,name)))")
      .eq("shipment_id", id).order("created_at"),
    db.from("hw_shipment_costs").select("*").eq("shipment_id", id).order("created_at"),
  ]);
  if (shipment.error) return NextResponse.json({ error: shipment.error.message }, { status: 404 });

  return NextResponse.json({ ...shipment.data, lines: lines.data ?? [], costs: costs.data ?? [] });
}

// PATCH /api/admin/inbound/:id — meta fields (status has its own route)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) if (k in body) update[k] = body[k] === "" ? null : body[k];

  const { data, error } = await db.from("hw_inbound_shipments").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/inbound/:id — archive (not after goods moved)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const { data: s } = await db.from("hw_inbound_shipments").select("status").eq("id", id).single();
  if (s && !["booked"].includes(s.status)) {
    return NextResponse.json({ error: "Only booked shipments can be archived — stock already moved on this one." }, { status: 409 });
  }
  const res = await softDelete(db, "hw_inbound_shipments", id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
