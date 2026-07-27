import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getLocationsByCode, recordMovement, recalcPoReceiptStatus } from "@/lib/hardware/ops-server";

// POST /api/admin/purchasing/:id/receive — DIRECT receipt against PO lines
// (air parcels, samples — no inbound shipment / landed-cost worksheet).
// Body: { lines: [{ po_line_id, qty }], location_code?: "HQ", fx_rate?: 1 }
// Landed unit cost = unit_cost × fx (no freight/duty allocation on this path).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  const reqLines: { po_line_id: string; qty: number }[] = Array.isArray(body.lines) ? body.lines : [];
  if (!reqLines.length) return NextResponse.json({ error: "lines are required" }, { status: 400 });
  const fx = Number(body.fx_rate) || 1;

  const locations = await getLocationsByCode(db);
  const target = locations[body.location_code || "HQ"];
  const supplier = locations["SUPPLIER"];
  if (!target || !supplier) return NextResponse.json({ error: "stock locations missing" }, { status: 500 });

  const { data: poLines, error } = await db.from("hw_po_lines")
    .select("id,variant_id,qty_ordered,qty_shipped,qty_received,unit_cost").eq("po_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const byId = new Map((poLines ?? []).map((l: { id: string }) => [l.id, l]));

  const received: { po_line_id: string; qty: number; unit_landed_cost: number | null }[] = [];
  for (const r of reqLines) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const line = byId.get(r.po_line_id) as any;
    const qty = Number(r.qty);
    if (!line || !qty || qty <= 0) continue;
    const remaining = line.qty_ordered - line.qty_received;
    if (qty > remaining) {
      return NextResponse.json({ error: `Line has only ${remaining} left to receive.` }, { status: 409 });
    }
    const unitLanded = line.unit_cost != null ? Number(line.unit_cost) * fx : null;

    await recordMovement(db, {
      variant_id: line.variant_id, from: supplier.id, to: target.id, qty,
      reason: "po_receipt", ref_type: "po_line", ref_id: line.id,
      unit_cost: unitLanded, actor: "admin",
    });
    await db.from("hw_receipts").insert({
      po_line_id: line.id, variant_id: line.variant_id, qty,
      unit_landed_cost: unitLanded, location_id: target.id,
      notes: body.note || null,
    });
    await db.from("hw_po_lines").update({
      qty_received: line.qty_received + qty,
      qty_shipped: Math.max(line.qty_shipped ?? 0, line.qty_received + qty),
    }).eq("id", line.id);
    received.push({ po_line_id: line.id, qty, unit_landed_cost: unitLanded });
  }

  await recalcPoReceiptStatus(db, id);
  return NextResponse.json({ ok: true, received });
}
