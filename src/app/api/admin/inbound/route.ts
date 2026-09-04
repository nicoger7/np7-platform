import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { notArchived } from "@/lib/archive";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/inbound — inbound shipments with unit + cost totals
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let q = db.from("hw_inbound_shipments").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const shipments = notArchived(data) as { id: string }[];

  const ids = shipments.map((s: { id: string }) => s.id);
  const units = new Map<string, number>();
  const costs = new Map<string, number>();
  if (ids.length) {
    const [{ data: lines }, { data: costRows }] = await Promise.all([
      db.from("hw_inbound_lines").select("shipment_id,qty").in("shipment_id", ids),
      db.from("hw_shipment_costs").select("shipment_id,amount,fx_rate").in("shipment_id", ids),
    ]);
    for (const l of lines ?? []) units.set(l.shipment_id, (units.get(l.shipment_id) ?? 0) + l.qty);
    for (const c of costRows ?? []) costs.set(c.shipment_id, (costs.get(c.shipment_id) ?? 0) + Number(c.amount) * (Number(c.fx_rate) || 1));
  }
  return NextResponse.json(shipments.map((s: { id: string }) => ({
    ...s, units: units.get(s.id) ?? 0, costs_eur: costs.get(s.id) ?? 0,
  })));
}

// POST /api/admin/inbound — create a shipment
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await request.json();
  if (!body.reference) return NextResponse.json({ error: "reference is required" }, { status: 400 });

  const { data, error } = await db.from("hw_inbound_shipments").insert({
    reference: String(body.reference),
    mode: body.mode || "sea",
    incoterm: body.incoterm || null,
    container_no: body.container_no || null,
    carrier: body.carrier || null,
    forwarder: body.forwarder || null,
    etd: body.etd || null,
    eta: body.eta || null,
    notes: body.notes || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
