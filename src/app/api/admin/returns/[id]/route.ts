import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { logOrderEvent, recalcFulfillmentStatus, recalcPaymentStatus } from "@/lib/hardware/orders-server";
import { getLocationsByCode, recordMovement } from "@/lib/hardware/ops-server";

// GET /api/admin/returns/:id — return + lines + order money context
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;

  const { data: ret, error } = await db.from("hw_returns")
    .select("*, hw_orders(id,display_number,email,currency,grand_total,shipping_gross,payment_status), hw_return_lines(*, hw_order_lines(id,sku,title,variant_title,quantity,unit_price_gross,variant_id))")
    .eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const { data: txs } = await db.from("hw_order_transactions").select("type,amount").eq("order_id", ret.hw_orders.id);
  const captured = (txs ?? []).filter((t: { type: string }) => t.type === "capture").reduce((a: number, t: { amount: number }) => a + t.amount, 0);
  const refunded = -(txs ?? []).filter((t: { type: string }) => t.type === "refund").reduce((a: number, t: { amount: number }) => a + t.amount, 0);

  // Suggested refund: returned line value − deduction (+ outbound shipping on a full-order withdrawal).
  const lineValue = (ret.hw_return_lines ?? []).reduce(
    (a: number, l: { quantity: number; hw_order_lines: { unit_price_gross: number } | null }) =>
      a + l.quantity * (l.hw_order_lines?.unit_price_gross ?? 0), 0);

  return NextResponse.json({ ...ret, money: { captured, refunded, remaining: captured - refunded, suggested_refund: lineValue } });
}

// POST /api/admin/returns/:id — actions.
// { action: "approve" | "reject" | "mark_received" | "resolve", ... }
// resolve: { refund_amount_eur?, deduction_amount_eur?, deduction_reason?, restock_location? }
//   1) restocks inspected lines (a_stock→location, b_stock→BSTOCK, scrap→LOSS)
//   2) records the refund in the money ledger  3) closes the return.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();

  const { data: ret } = await db.from("hw_returns")
    .select("*, hw_orders(id,currency), hw_return_lines(*, hw_order_lines(id,variant_id,quantity_returned))")
    .eq("id", id).single();
  if (!ret) return NextResponse.json({ error: "not found" }, { status: 404 });
  const orderId = ret.hw_orders.id;
  const now = new Date().toISOString();

  if (body.action === "approve") {
    if (ret.status !== "requested") return NextResponse.json({ error: "Not in requested state." }, { status: 409 });
    await db.from("hw_returns").update({ status: "approved", updated_at: now }).eq("id", id);
    await logOrderEvent(db, orderId, "return_approved", "admin", { return_id: id });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reject") {
    if (["resolved", "rejected"].includes(ret.status)) return NextResponse.json({ error: "Already closed." }, { status: 409 });
    await db.from("hw_returns").update({ status: "rejected", notes: body.reason ?? ret.notes, resolved_at: now, updated_at: now }).eq("id", id);
    await logOrderEvent(db, orderId, "return_rejected", "admin", { return_id: id, reason: body.reason ?? null });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "mark_received") {
    if (!["approved", "in_transit", "requested"].includes(ret.status)) {
      return NextResponse.json({ error: "Not awaiting arrival." }, { status: 409 });
    }
    await db.from("hw_returns").update({ status: "received", updated_at: now }).eq("id", id);
    await logOrderEvent(db, orderId, "return_received", "admin", { return_id: id });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "resolve") {
    if (ret.status !== "received") {
      return NextResponse.json({ error: "Mark the goods received (and inspect them) before resolving." }, { status: 409 });
    }
    const uninspected = (ret.hw_return_lines ?? []).filter((l: { condition: string | null }) => !l.condition);
    if (uninspected.length) {
      return NextResponse.json({ error: "Every line needs an inspected condition first." }, { status: 409 });
    }

    // 1) Restock through the stock ledger.
    const locations = await getLocationsByCode(db);
    const customer = locations["CUSTOMER"];
    const sellable = locations[body.restock_location || "HQ"];
    for (const l of ret.hw_return_lines ?? []) {
      const variantId = l.hw_order_lines?.variant_id;
      if (!variantId) continue;
      const target = l.condition === "a_stock" ? sellable : l.condition === "b_stock" ? locations["BSTOCK"] : locations["LOSS"];
      await recordMovement(db, {
        variant_id: variantId, from: customer.id, to: target.id, qty: l.quantity,
        reason: "return", ref_type: "return_line", ref_id: l.id,
        note: l.condition, actor: "admin",
      });
      await db.from("hw_return_lines").update({ restock: l.condition !== "scrap", restocked_at: now }).eq("id", l.id);
      await db.from("hw_order_lines").update({
        quantity_returned: (l.hw_order_lines?.quantity_returned ?? 0) + l.quantity,
      }).eq("id", l.hw_order_lines.id);
    }

    // 2) Refund via the money ledger (guarded against over-refund).
    const refundCents = Math.round(Number(body.refund_amount_eur ?? 0) * 100);
    const deductionCents = Math.round(Number(body.deduction_amount_eur ?? 0) * 100);
    let refundTxId: string | null = null;
    if (refundCents > 0) {
      const { data: txs } = await db.from("hw_order_transactions").select("type,amount").eq("order_id", orderId);
      const captured = (txs ?? []).filter((t: { type: string }) => t.type === "capture").reduce((a: number, t: { amount: number }) => a + t.amount, 0);
      const refunded = -(txs ?? []).filter((t: { type: string }) => t.type === "refund").reduce((a: number, t: { amount: number }) => a + t.amount, 0);
      if (refundCents > captured - refunded) {
        return NextResponse.json({ error: `Refund exceeds remaining captured money (€${((captured - refunded) / 100).toFixed(2)}).` }, { status: 409 });
      }
      const { data: tx } = await db.from("hw_order_transactions").insert({
        order_id: orderId, type: "refund", amount: -refundCents, currency: ret.hw_orders.currency,
        provider: body.provider || "bank_transfer", reason: `return ${id}`, actor: "admin",
      }).select().single();
      refundTxId = tx?.id ?? null;
    }

    await db.from("hw_returns").update({
      status: "resolved", resolved_at: now, updated_at: now,
      refund_amount: refundCents || null, deduction_amount: deductionCents,
      deduction_reason: body.deduction_reason || null, refund_transaction_id: refundTxId,
    }).eq("id", id);
    await logOrderEvent(db, orderId, "return_resolved", "admin", {
      return_id: id, refund: refundCents, deduction: deductionCents,
    });
    await recalcPaymentStatus(db, orderId);
    await recalcFulfillmentStatus(db, orderId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
