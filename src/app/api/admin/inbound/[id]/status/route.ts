import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { SHIPMENT_TRANSITIONS, type ShipmentStatus } from "@/lib/hardware/ops";
import { getLocationsByCode, recordMovement } from "@/lib/hardware/ops-server";
import { requireAdminGate } from "@/lib/admin-auth";
// POST /api/admin/inbound/:id/status — { to }
// booked → in_transit is the FOB moment: goods become OUR stock on the water
// (supplier → TRANSIT movements, PO lines marked shipped, PO → shipped).
// "received" is NOT reachable here — the /receive endpoint books stock + landed cost.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  const to = body.to as ShipmentStatus;

  const { data: shipment, error } = await db.from("hw_inbound_shipments").select("id,status").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const allowed = SHIPMENT_TRANSITIONS[shipment.status as ShipmentStatus] ?? [];
  if (!allowed.includes(to)) {
    return NextResponse.json({ error: `Cannot go from ${shipment.status} to ${to}.` }, { status: 409 });
  }

  if (to === "in_transit") {
    const { data: lines } = await db.from("hw_inbound_lines")
      .select("id,qty, hw_po_lines(id,po_id,variant_id,qty_shipped)").eq("shipment_id", id);
    if (!lines?.length) {
      return NextResponse.json({ error: "Add shipment lines before marking in transit." }, { status: 409 });
    }
    const locations = await getLocationsByCode(db);
    const poIds = new Set<string>();
    for (const l of lines) {
      const poLine = l.hw_po_lines;
      if (!poLine) continue;
      await recordMovement(db, {
        variant_id: poLine.variant_id, from: locations["SUPPLIER"].id, to: locations["TRANSIT"].id,
        qty: l.qty, reason: "in_transit", ref_type: "inbound_line", ref_id: l.id, actor: "admin",
      });
      await db.from("hw_po_lines").update({ qty_shipped: (poLine.qty_shipped ?? 0) + l.qty }).eq("id", poLine.id);
      poIds.add(poLine.po_id);
    }
    // Best-effort: walk the touched POs to "shipped" with an audit event.
    for (const poId of poIds) {
      const { data: po } = await db.from("hw_purchase_orders").select("status").eq("id", poId).single();
      if (po && ["confirmed", "in_production", "ready_to_ship"].includes(po.status)) {
        await db.from("hw_purchase_orders").update({
          status: "shipped",
          ex_factory_actual: new Date().toISOString().slice(0, 10),
          updated_at: new Date().toISOString(),
        }).eq("id", poId);
        await db.from("hw_po_status_events").insert({
          po_id: poId, from_status: po.status, to_status: "shipped", actor: "system", note: "Inbound shipment departed",
        });
      }
    }
  }

  const update: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
  if (to === "cleared") update.customs_cleared_at = new Date().toISOString().slice(0, 10);
  const { data, error: upErr } = await db.from("hw_inbound_shipments").update(update).eq("id", id).select().single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  return NextResponse.json(data);
}
