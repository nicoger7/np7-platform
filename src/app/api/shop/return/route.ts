import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { logOrderEvent } from "@/lib/hardware/orders-server";
import { sendEmail } from "@/lib/email/send";

// POST /api/shop/return — the customer's withdrawal/return declaration
// (entered from the order page or the withdrawal button). Public, keyed by the
// order's public_token. Creates a `requested` return; the ack email is the
// legally required durable-medium confirmation.
// Body: { token, lines: [{ order_line_id, quantity, reason_code }], message? }
export async function POST(request: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await request.json().catch(() => null);
  if (!body?.token || !Array.isArray(body.lines) || !body.lines.length) {
    return NextResponse.json({ error: "Pick at least one item to return." }, { status: 400 });
  }

  const { data: order } = await db.from("hw_orders")
    .select("id,display_number,email,status,public_token")
    .eq("public_token", body.token).single();
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  // Returnable per line = shipped − already returned − already requested in open returns.
  const [{ data: orderLines }, { data: openReturns }] = await Promise.all([
    db.from("hw_order_lines").select("id,sku,title,variant_title,quantity,quantity_shipped,quantity_returned").eq("order_id", order.id),
    db.from("hw_returns").select("id,status, hw_return_lines(order_line_id,quantity)").eq("order_id", order.id).in("status", ["requested", "approved", "in_transit", "received"]),
  ]);
  const pending = new Map<string, number>();
  for (const r of openReturns ?? []) {
    for (const l of r.hw_return_lines ?? []) pending.set(l.order_line_id, (pending.get(l.order_line_id) ?? 0) + l.quantity);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineById = new Map(((orderLines ?? []) as any[]).map((l) => [l.id, l]));

  const cleanLines: { order_line_id: string; quantity: number; reason_code: string | null }[] = [];
  for (const l of body.lines as { order_line_id: string; quantity: number; reason_code?: string }[]) {
    const ol = lineById.get(l.order_line_id);
    const qty = Number(l.quantity) || 0;
    if (!ol || qty <= 0) continue;
    const returnable = ol.quantity_shipped - ol.quantity_returned - (pending.get(ol.id) ?? 0);
    if (qty > returnable) {
      return NextResponse.json({ error: `${ol.title}: only ${Math.max(0, returnable)} can still be returned.` }, { status: 409 });
    }
    cleanLines.push({ order_line_id: ol.id, quantity: qty, reason_code: l.reason_code || null });
  }
  if (!cleanLines.length) return NextResponse.json({ error: "Nothing returnable selected." }, { status: 400 });

  // Defect reasons enter the warranty track; everything else is a withdrawal.
  const type = cleanLines.some((l) => l.reason_code === "defect") ? "warranty" : "withdrawal";
  const { data: ret, error } = await db.from("hw_returns").insert({
    order_id: order.id, type, channel: body.channel === "withdrawal_button" ? "withdrawal_button" : "portal",
    customer_message: (body.message || "").slice(0, 2000) || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await db.from("hw_return_lines").insert(cleanLines.map((l) => ({ ...l, return_id: ret.id })));

  await logOrderEvent(db, order.id, "return_requested", "customer", {
    return_id: ret.id, type, units: cleanLines.reduce((a, l) => a + l.quantity, 0),
  });

  // Durable-medium acknowledgement (suppressed pre-launch by the lifecycle guard).
  const items = cleanLines.map((l) => {
    const ol = lineById.get(l.order_line_id);
    return `${l.quantity}× ${ol.title}${ol.variant_title ? ` ${ol.variant_title}` : ""}`;
  }).join(", ");
  // Withdrawals get the formal Eingangsbestätigung; warranty claims their own ack.
  const templateKey = type === "withdrawal" ? "withdrawal_received" : "hw_return_received";
  await sendEmail({
    to: order.email,
    templateKey,
    division: "hardware",
    dedupeKey: `${templateKey}:${ret.id}`,
    vars: {
      firstName: order.email.split("@")[0],
      orderNumber: `#${order.display_number}`,
      items,
      declaredDate: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
      orderLink: `https://www.np-seven.com/orders/${order.public_token}`,
    },
  });

  return NextResponse.json({ ok: true, return_id: ret.id }, { status: 201 });
}
