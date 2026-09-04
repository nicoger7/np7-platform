import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { notArchived } from "@/lib/archive";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/purchasing — PO list with supplier name + order value
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let q = db.from("hw_purchase_orders")
    .select("*, hw_suppliers(id,name,country)")
    .order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const pos = notArchived(data) as { id: string }[];

  const ids = pos.map((p: { id: string }) => p.id);
  const totals = new Map<string, { value: number; units: number; received: number }>();
  if (ids.length) {
    const { data: lines } = await db.from("hw_po_lines")
      .select("po_id,qty_ordered,qty_received,unit_cost").in("po_id", ids);
    for (const l of lines ?? []) {
      const t = totals.get(l.po_id) ?? { value: 0, units: 0, received: 0 };
      t.value += (Number(l.unit_cost) || 0) * l.qty_ordered;
      t.units += l.qty_ordered;
      t.received += l.qty_received;
      totals.set(l.po_id, t);
    }
  }
  return NextResponse.json(pos.map((p: { id: string }) => ({
    ...p, ...(totals.get(p.id) ?? { value: 0, units: 0, received: 0 }),
  })));
}

// POST /api/admin/purchasing — create a draft PO (defaults from the supplier)
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await request.json();
  if (!body.supplier_id) return NextResponse.json({ error: "supplier_id is required" }, { status: 400 });

  const { data: supplier } = await db.from("hw_suppliers")
    .select("currency,default_incoterm,default_payment_terms").eq("id", body.supplier_id).single();

  const { data, error } = await db.from("hw_purchase_orders").insert({
    supplier_id: body.supplier_id,
    currency: body.currency || supplier?.currency || "USD",
    incoterm: body.incoterm || supplier?.default_incoterm || null,
    payment_terms: body.payment_terms || supplier?.default_payment_terms || null,
    order_date: body.order_date || new Date().toISOString().slice(0, 10),
    ex_factory_planned: body.ex_factory_planned || null,
    expected_receipt_date: body.expected_receipt_date || null,
    notes: body.notes || null,
  }).select("*, hw_suppliers(id,name,country)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await db.from("hw_po_status_events").insert({ po_id: data.id, from_status: null, to_status: "draft", actor: "admin" });
  return NextResponse.json(data, { status: 201 });
}
