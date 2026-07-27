import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { softDelete } from "@/lib/archive";

const EDITABLE = [
  "currency", "incoterm", "order_date", "ex_factory_planned", "ex_factory_actual",
  "expected_receipt_date", "payment_terms", "notes",
] as const;

// GET /api/admin/purchasing/:id — the full PO bundle for the detail page
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;

  const [po, lines, payments, milestones, qc, events] = await Promise.all([
    db.from("hw_purchase_orders").select("*, hw_suppliers(id,name,country,currency)").eq("id", id).single(),
    db.from("hw_po_lines").select("*, hw_variants(id,name,sku,weight_g,box_l_mm,box_w_mm,box_h_mm,hw_products(id,name))").eq("po_id", id).order("created_at"),
    db.from("hw_po_payments").select("*").eq("po_id", id).order("planned_date", { ascending: true, nullsFirst: false }),
    db.from("hw_po_milestones").select("*").eq("po_id", id).order("sort_order").order("planned_date"),
    db.from("hw_qc_inspections").select("*").eq("po_id", id).order("date", { ascending: true, nullsFirst: false }),
    db.from("hw_po_status_events").select("*").eq("po_id", id).order("created_at", { ascending: false }),
  ]);
  if (po.error) return NextResponse.json({ error: po.error.message }, { status: 404 });

  // Receipts for this PO's lines (needs the line ids first).
  const lineIds = (lines.data ?? []).map((l: { id: string }) => l.id);
  const { data: receiptRows } = lineIds.length
    ? await db.from("hw_receipts").select("*").in("po_line_id", lineIds).order("received_at", { ascending: false })
    : { data: [] };

  return NextResponse.json({
    ...po.data,
    lines: lines.data ?? [],
    payments: payments.data ?? [],
    milestones: milestones.data ?? [],
    qc: qc.data ?? [],
    events: events.data ?? [],
    receipts: receiptRows ?? [],
  });
}

// PATCH /api/admin/purchasing/:id — meta fields only (status has its own route)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) if (k in body) update[k] = body[k] === "" ? null : body[k];

  const { data, error } = await db.from("hw_purchase_orders").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/purchasing/:id — archive (drafts/cancelled only)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const { data: po } = await db.from("hw_purchase_orders").select("status").eq("id", id).single();
  if (po && !["draft", "cancelled"].includes(po.status)) {
    return NextResponse.json({ error: "Only draft or cancelled POs can be archived — cancel it first." }, { status: 409 });
  }
  const res = await softDelete(db, "hw_purchase_orders", id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
