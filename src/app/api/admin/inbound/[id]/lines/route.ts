import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/inbound/:id/lines — open PO lines still assignable to shipments
// (for the picker: qty not yet assigned across all shipments, on live POs).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  await params;

  const [{ data: poLines }, { data: assigned }] = await Promise.all([
    db.from("hw_po_lines")
      .select("id,po_id,qty_ordered,qty_received,unit_cost, hw_purchase_orders!inner(id,po_number,status,currency), hw_variants(id,name,sku,hw_products(name))")
      .not("hw_purchase_orders.status", "in", "(draft,closed,cancelled)"),
    db.from("hw_inbound_lines").select("po_line_id,qty"),
  ]);
  const assignedBy = new Map<string, number>();
  for (const a of assigned ?? []) assignedBy.set(a.po_line_id, (assignedBy.get(a.po_line_id) ?? 0) + a.qty);

  const open = (poLines ?? [])
    .map((l: { id: string; qty_ordered: number }) => ({ ...l, qty_unassigned: l.qty_ordered - (assignedBy.get(l.id) ?? 0) }))
    .filter((l: { qty_unassigned: number }) => l.qty_unassigned > 0);
  return NextResponse.json(open);
}

// POST /api/admin/inbound/:id/lines — put PO-line quantities on this shipment
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  if (!body.po_line_id || !body.qty) {
    return NextResponse.json({ error: "po_line_id and qty are required" }, { status: 400 });
  }

  const { data: shipment } = await db.from("hw_inbound_shipments").select("status").eq("id", id).single();
  if (!shipment) return NextResponse.json({ error: "shipment not found" }, { status: 404 });
  if (shipment.status !== "booked") {
    return NextResponse.json({ error: "Lines can only change while the shipment is booked (stock already moved)." }, { status: 409 });
  }

  // Guard against over-assigning a PO line across shipments.
  const [{ data: poLine }, { data: assigned }] = await Promise.all([
    db.from("hw_po_lines").select("id,qty_ordered,qty_received").eq("id", body.po_line_id).single(),
    db.from("hw_inbound_lines").select("qty").eq("po_line_id", body.po_line_id),
  ]);
  if (!poLine) return NextResponse.json({ error: "PO line not found" }, { status: 404 });
  const alreadyAssigned = (assigned ?? []).reduce((a: number, r: { qty: number }) => a + r.qty, 0);
  const qty = Number(body.qty);
  if (qty <= 0 || alreadyAssigned + qty > poLine.qty_ordered) {
    return NextResponse.json({ error: `Only ${poLine.qty_ordered - alreadyAssigned} units of this line are unassigned.` }, { status: 409 });
  }

  const { data, error } = await db.from("hw_inbound_lines").insert({
    shipment_id: id, po_line_id: body.po_line_id, qty,
  }).select("*, hw_po_lines(id,po_id,qty_ordered,qty_shipped,qty_received,unit_cost, hw_purchase_orders(id,po_number,currency), hw_variants(id,name,sku,weight_g,box_l_mm,box_w_mm,box_h_mm,hw_products(id,name)))").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
