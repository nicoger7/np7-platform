import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { softDelete } from "@/lib/archive";
import { logOrderEvent } from "@/lib/hardware/orders-server";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/orders/:id — the full bundle
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;

  const [order, lines, txs, events, fulfillments, reservations] = await Promise.all([
    db.from("hw_orders").select("*, contacts(id,name,email)").eq("id", id).single(),
    db.from("hw_order_lines").select("*").eq("order_id", id).order("created_at"),
    db.from("hw_order_transactions").select("*").eq("order_id", id).order("created_at"),
    db.from("hw_order_events").select("*").eq("order_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("hw_fulfillments").select("*, hw_fulfillment_lines(id,order_line_id,quantity), hw_stock_locations(code,name)").eq("order_id", id).order("created_at"),
    db.from("hw_reservations").select("id,qty,order_line_id, hw_stock_locations(code)").not("order_line_id", "is", null),
  ]);
  if (order.error) return NextResponse.json({ error: order.error.message }, { status: 404 });

  const lineIds = new Set((lines.data ?? []).map((l: { id: string }) => l.id));
  return NextResponse.json({
    ...order.data,
    lines: lines.data ?? [],
    transactions: txs.data ?? [],
    events: events.data ?? [],
    fulfillments: fulfillments.data ?? [],
    reservations: (reservations.data ?? []).filter((r: { order_line_id: string }) => lineIds.has(r.order_line_id)),
  });
}

// PATCH /api/admin/orders/:id — meta edits (addresses lock once fulfillment starts)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  const { data: order } = await db.from("hw_orders").select("fulfillment_status").eq("id", id).single();
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["email", "phone", "notes", "risk_status", "contact_id"] as const) {
    if (k in body) update[k] = body[k] === "" ? null : body[k];
  }
  if ("shipping_address" in body) {
    // Blueprint edge case: free edit only while nothing has been fulfilled.
    if (order.fulfillment_status !== "unfulfilled") {
      return NextResponse.json({ error: "Shipping address is locked — goods already left. Handle via the carrier." }, { status: 409 });
    }
    update.shipping_address = body.shipping_address;
    await logOrderEvent(db, id, "address_updated", "admin");
  }
  if ("billing_address" in body) update.billing_address = body.billing_address;

  const { data, error } = await db.from("hw_orders").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if ("risk_status" in body) await logOrderEvent(db, id, "risk_status_set", "admin", { to: body.risk_status });
  return NextResponse.json(data);
}

// DELETE /api/admin/orders/:id — archive; only canceled orders leave the books
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const { data: order } = await db.from("hw_orders").select("status").eq("id", id).single();
  if (order && order.status !== "canceled") {
    return NextResponse.json({ error: "Cancel the order first — only canceled orders can be archived." }, { status: 409 });
  }
  const res = await softDelete(db, "hw_orders", id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
