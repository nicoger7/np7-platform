import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { createOrderCore, logOrderEvent } from "@/lib/hardware/orders-server";
import { getLocationsByCode } from "@/lib/hardware/ops-server";
import { fmtCents } from "@/lib/hardware/orders";
import { sendEmail } from "@/lib/email/send";

import { rateLimited, LIMITS } from "@/lib/rate-limit";
// POST /api/shop/checkout — the web shop's order placement (bank transfer v1;
// Stripe joins as a payment step once keys exist). Public. Server-side pricing
// only, and stock MUST reserve (HQ then 3PL) — the shop never oversells.
// Body: { email, phone?, shipping_address{...country}, billing_address?, notes?,
//         lines: [{variant_id, quantity}], accept_terms: true }
export async function POST(request: NextRequest) {
  const tooMany = await rateLimited(request, { name: "shop-checkout", policy: LIMITS.signup });
  if (tooMany) return tooMany;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await request.json().catch(() => null);
  if (!body?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const ship = body.shipping_address ?? {};
  if (!ship.name || !ship.line1 || !ship.postal_code || !ship.city || !ship.country) {
    return NextResponse.json({ error: "Complete the shipping address." }, { status: 400 });
  }
  if (!Array.isArray(body.lines) || !body.lines.length) {
    return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
  }
  if (body.accept_terms !== true) {
    return NextResponse.json({ error: "Please accept the terms and the withdrawal policy." }, { status: 400 });
  }

  // Stock check BEFORE creating anything — honest errors per line.
  const locations = await getLocationsByCode(db);
  const sellable = [locations["HQ"], locations["3PL"]].filter(Boolean);
  const variantIds = body.lines.map((l: { variant_id: string }) => l.variant_id);
  const { data: levels } = await db.from("hw_stock_levels")
    .select("variant_id,location_id,on_hand,reserved").in("variant_id", variantIds);
  const availableAt = (variantId: string, locId: string) => {
    const lv = (levels ?? []).find((x: { variant_id: string; location_id: string }) => x.variant_id === variantId && x.location_id === locId);
    return lv ? lv.on_hand - lv.reserved : 0;
  };
  for (const l of body.lines as { variant_id: string; quantity: number }[]) {
    const total = sellable.reduce((a, loc) => a + availableAt(l.variant_id, loc.id), 0);
    if (Number(l.quantity) > total) {
      return NextResponse.json({ error: "Not enough stock for one of your items — adjust the quantity in your cart." }, { status: 409 });
    }
  }

  const created = await createOrderCore(db, {
    email: String(body.email).trim(), phone: body.phone ?? null,
    country: String(ship.country), channel: "web",
    lines: body.lines, notes: body.notes ?? null,
    shipping_address: ship, billing_address: body.billing_address ?? ship,
    allowPriceOverride: false,
  });
  if (created.error !== undefined) return NextResponse.json({ error: created.error }, { status: created.status });
  const { order, lines } = created;

  // Reserve per line, HQ first then 3PL. A race that empties stock between the
  // check and here rolls the whole order back — no half-reserved orders.
  for (const l of lines) {
    let remaining = l.quantity;
    for (const loc of sellable) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, availableAt(l.variant_id, loc.id));
      if (take <= 0) continue;
      const { data: resId } = await db.rpc("hw_reserve_stock", {
        p_variant: l.variant_id, p_location: loc.id, p_qty: take,
        p_order_line: l.id, p_checkout: null, p_expires: null,
      });
      if (resId) remaining -= take;
    }
    if (remaining > 0) {
      await db.from("hw_orders").delete().eq("id", order.id);   // cascades lines + reservations
      return NextResponse.json({ error: "Someone was faster — an item just sold out. Your card was not charged." }, { status: 409 });
    }
  }
  await logOrderEvent(db, order.id, "stock_reserved", "system", { channel: "web" });

  await sendEmail({
    to: order.email,
    templateKey: "hw_order_confirmation",
    division: "hardware",
    dedupeKey: `hw_order_confirmation:${order.id}`,
    vars: {
      firstName: String(ship.name).split(" ")[0],
      orderNumber: `#${order.display_number}`,
      total: fmtCents(order.grand_total),
      orderLink: `https://www.np-seven.com/orders/${order.public_token}`,
      paymentReference: `NP7-${order.display_number}`,
    },
  });

  return NextResponse.json({ ok: true, token: order.public_token, number: order.display_number }, { status: 201 });
}
