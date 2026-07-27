import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { logOrderEvent, releaseOrderReservations } from "@/lib/hardware/orders-server";

// POST /api/admin/orders/:id/status — { action: "cancel" | "complete" }
// Cancel guards (blueprint §1 edge cases): nothing shipped, nothing still paid.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  const { data: order } = await db.from("hw_orders")
    .select("status,payment_status,fulfillment_status").eq("id", id).single();
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.action === "cancel") {
    if (order.status !== "pending") {
      return NextResponse.json({ error: "Only pending orders can be canceled." }, { status: 409 });
    }
    if (!["unfulfilled", "partially_fulfilled", "fulfilled"].includes(order.fulfillment_status)) {
      return NextResponse.json({ error: "Goods already shipped — handle this as a return, not a cancellation." }, { status: 409 });
    }
    if (["paid", "partially_refunded"].includes(order.payment_status)) {
      return NextResponse.json({ error: "Money is still captured — record the full refund first, then cancel." }, { status: 409 });
    }
    const released = await releaseOrderReservations(db, id);
    const paymentStatus = order.payment_status === "awaiting" ? "canceled" : order.payment_status;
    const { data, error } = await db.from("hw_orders").update({
      status: "canceled", payment_status: paymentStatus,
      canceled_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logOrderEvent(db, id, "order_canceled", "admin", { reservations_released: released, note: body.note ?? null });
    return NextResponse.json(data);
  }

  if (body.action === "complete") {
    if (order.status !== "pending") {
      return NextResponse.json({ error: "Order is not pending." }, { status: 409 });
    }
    if (order.fulfillment_status !== "delivered") {
      return NextResponse.json({ error: "Complete only after delivery (and ideally after the 14-day withdrawal window)." }, { status: 409 });
    }
    const { data, error } = await db.from("hw_orders").update({
      status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logOrderEvent(db, id, "order_completed", "admin");
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
