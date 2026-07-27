import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { toCents } from "@/lib/hardware/orders";
import { logOrderEvent, recalcPaymentStatus } from "@/lib/hardware/orders-server";

// POST /api/admin/orders/:id/transactions — append to the money ledger.
// Body: { type: "capture"|"refund", amount_eur, provider?, provider_ref?, reason? }
// Refunds are stored NEGATIVE; payment_status is derived, never set by hand.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  const type = body.type as string;
  const amountAbs = Math.abs(toCents(body.amount_eur ?? 0));
  if (!["capture", "refund"].includes(type) || !amountAbs) {
    return NextResponse.json({ error: "type (capture|refund) and a non-zero amount are required" }, { status: 400 });
  }

  const [{ data: order }, { data: txs }] = await Promise.all([
    db.from("hw_orders").select("grand_total,currency,status").eq("id", id).single(),
    db.from("hw_order_transactions").select("type,amount").eq("order_id", id),
  ]);
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  const captured = (txs ?? []).filter((t: { type: string }) => t.type === "capture").reduce((a: number, t: { amount: number }) => a + t.amount, 0);
  const refunded = -(txs ?? []).filter((t: { type: string }) => t.type === "refund").reduce((a: number, t: { amount: number }) => a + t.amount, 0);
  if (type === "refund" && amountAbs > captured - refunded) {
    return NextResponse.json({ error: `Refund exceeds what's left — €${((captured - refunded) / 100).toFixed(2)} captured remains.` }, { status: 409 });
  }

  const { data, error } = await db.from("hw_order_transactions").insert({
    order_id: id, type, amount: type === "refund" ? -amountAbs : amountAbs,
    currency: order.currency, provider: body.provider || "manual",
    provider_ref: body.provider_ref || null, reason: body.reason || null, actor: "admin",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logOrderEvent(db, id, type === "refund" ? "refund_recorded" : "payment_recorded", "admin", {
    amount: data.amount, provider: data.provider, reason: data.reason,
  });
  await recalcPaymentStatus(db, id);
  return NextResponse.json(data, { status: 201 });
}
