import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
import {
  getLocationsByCode, recordMovement, recalcPoReceiptStatus,
  allocateCosts, type AllocLine,
} from "@/lib/hardware/ops-server";

// POST /api/admin/inbound/:id/receive — book the container into stock.
// Allocates the cost worksheet over the lines (duty by value, freight by
// volume/weight — each row's own basis), writes receipts with landed unit
// cost, moves stock TRANSIT→target (or SUPPLIER→target if it never was
// marked in transit), updates PO lines + statuses, closes the shipment.
// Body: { location_code?: "HQ", fx_rates?: { USD: 0.92 }, preview?: true }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  const fxRates: Record<string, number> = body.fx_rates ?? {};
  const fxFor = (currency: string) => (currency === "EUR" ? 1 : Number(fxRates[currency]) || 1);

  const [shipment, lines, costRows] = await Promise.all([
    db.from("hw_inbound_shipments").select("*").eq("id", id).single(),
    db.from("hw_inbound_lines")
      .select("*, hw_po_lines(id,po_id,variant_id,qty_ordered,qty_shipped,qty_received,unit_cost, hw_purchase_orders(id,po_number,currency), hw_variants(id,name,sku,weight_g,box_l_mm,box_w_mm,box_h_mm))")
      .eq("shipment_id", id),
    db.from("hw_shipment_costs").select("*").eq("shipment_id", id),
  ]);
  if (shipment.error) return NextResponse.json({ error: shipment.error.message }, { status: 404 });
  if (["received", "closed"].includes(shipment.data.status)) {
    return NextResponse.json({ error: "Shipment is already received." }, { status: 409 });
  }
  const shipLines = lines.data ?? [];
  if (!shipLines.length) return NextResponse.json({ error: "No lines on this shipment." }, { status: 409 });

  // Over-receipt guard before any stock moves.
  for (const l of shipLines) {
    const poLine = l.hw_po_lines;
    if (!poLine) return NextResponse.json({ error: "A line lost its PO reference." }, { status: 409 });
    if (poLine.qty_received + l.qty > poLine.qty_ordered) {
      return NextResponse.json({
        error: `${poLine.hw_variants?.sku ?? "A line"} would exceed its ordered quantity — adjust the PO or the shipment line first.`,
      }, { status: 409 });
    }
  }

  // Allocation metrics per line (EUR value via per-currency fx from the caller).
  const allocLines: AllocLine[] = shipLines.map((l: {
    id: string; qty: number;
    hw_po_lines: { unit_cost: number | null; hw_purchase_orders: { currency: string } | null;
      hw_variants: { weight_g: number | null; box_l_mm: number | null; box_w_mm: number | null; box_h_mm: number | null } | null };
  }) => {
    const poLine = l.hw_po_lines;
    const v = poLine.hw_variants;
    const fx = fxFor(poLine.hw_purchase_orders?.currency ?? "EUR");
    return {
      key: l.id,
      qty: l.qty,
      value_eur: (Number(poLine.unit_cost) || 0) * fx * l.qty,
      weight_g: (v?.weight_g ?? 0) * l.qty,
      volume_mm3: (v?.box_l_mm ?? 0) * (v?.box_w_mm ?? 0) * (v?.box_h_mm ?? 0) * l.qty,
    };
  });
  const costsEur = (costRows.data ?? []).map((c: { amount: number; fx_rate: number; kind: string; allocation_basis: string }) => ({
    amount_eur: Number(c.amount) * (Number(c.fx_rate) || 1),
    basis: c.allocation_basis,
  }));
  const allocated = allocateCosts(costsEur, allocLines);

  const preview = shipLines.map((l: { id: string; qty: number; hw_po_lines: { unit_cost: number | null; hw_purchase_orders: { currency: string } | null; hw_variants: { sku: string; name: string } | null } }) => {
    const base = allocLines.find((a) => a.key === l.id)!;
    const extra = allocated.get(l.id) ?? 0;
    return {
      inbound_line_id: l.id,
      sku: l.hw_po_lines.hw_variants?.sku,
      name: l.hw_po_lines.hw_variants?.name,
      qty: l.qty,
      unit_base_eur: base.value_eur / l.qty || 0,
      unit_allocated_eur: extra / l.qty,
      unit_landed_eur: (base.value_eur + extra) / l.qty,
    };
  });
  if (body.preview) return NextResponse.json({ preview });

  const locations = await getLocationsByCode(db);
  const target = locations[body.location_code || "HQ"];
  if (!target) return NextResponse.json({ error: "target location missing" }, { status: 500 });
  // Goods that were marked in transit sit in TRANSIT; a booked shipment that
  // skipped that step receives straight from the supplier location.
  const source = shipment.data.status === "booked" ? locations["SUPPLIER"] : locations["TRANSIT"];

  const poIds = new Set<string>();
  for (const row of preview) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const l = shipLines.find((s: any) => s.id === row.inbound_line_id) as any;
    const poLine = l.hw_po_lines;
    await recordMovement(db, {
      variant_id: poLine.variant_id, from: source.id, to: target.id, qty: l.qty,
      reason: "po_receipt", ref_type: "inbound_line", ref_id: l.id,
      unit_cost: row.unit_landed_eur || null, actor: "admin",
    });
    await db.from("hw_receipts").insert({
      shipment_id: id, po_line_id: poLine.id, variant_id: poLine.variant_id,
      qty: l.qty, unit_landed_cost: row.unit_landed_eur || null, location_id: target.id,
    });
    await db.from("hw_po_lines").update({
      qty_received: poLine.qty_received + l.qty,
      qty_shipped: Math.max(poLine.qty_shipped ?? 0, poLine.qty_received + l.qty),
    }).eq("id", poLine.id);
    poIds.add(poLine.po_id);
  }
  for (const poId of poIds) await recalcPoReceiptStatus(db, poId);

  await db.from("hw_inbound_shipments").update({
    status: "received", ata: shipment.data.ata ?? new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  return NextResponse.json({ ok: true, received: preview });
}
