import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { notArchived } from "@/lib/archive";
import { createOrderCore, logOrderEvent } from "@/lib/hardware/orders-server";
import { getLocationsByCode } from "@/lib/hardware/ops-server";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/orders — list with filters + line summaries
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const paymentStatus = searchParams.get("payment_status");
  const fulfillmentStatus = searchParams.get("fulfillment_status");
  const search = searchParams.get("search");

  let q = db.from("hw_orders")
    .select("id,display_number,email,currency,status,payment_status,fulfillment_status,grand_total,sales_channel,risk_status,placed_at,archived_at,contacts(name),hw_order_lines(quantity)")
    .order("placed_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  if (paymentStatus) q = q.eq("payment_status", paymentStatus);
  if (fulfillmentStatus) q = q.eq("fulfillment_status", fulfillmentStatus);
  if (search) {
    q = /^\d+$/.test(search)
      ? q.eq("display_number", Number(search))
      : q.ilike("email", `%${search}%`);
  }
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (notArchived(data) as any[]).map((o) => ({
    ...o,
    units: (o.hw_order_lines ?? []).reduce((a: number, l: { quantity: number }) => a + l.quantity, 0),
    customerName: o.contacts?.name ?? null,
    hw_order_lines: undefined,
    contacts: undefined,
  }));
  return NextResponse.json(rows);
}

// POST /api/admin/orders — admin-entered order (team sales, warranty, phone).
// Body: { email, contact_id?, country, lines: [{variant_id, quantity, unit_price_eur?}],
//         shipping_address?, billing_address?, notes?, reserve?, location_code? }
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await request.json();
  if (!body.email || !Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "email and at least one line are required" }, { status: 400 });
  }

  const created = await createOrderCore(db, {
    email: body.email, phone: body.phone, country: body.country || "DE", channel: "admin",
    lines: body.lines, notes: body.notes, contact_id: body.contact_id,
    shipping_address: body.shipping_address, billing_address: body.billing_address,
    allowPriceOverride: true,
  });
  if (created.error !== undefined) return NextResponse.json({ error: created.error }, { status: created.status });
  const { order, lines: insertedLines } = created;

  // Optional stock reservation — atomic, fails loudly per line instead of overselling.
  const warnings: string[] = [];
  if (body.reserve) {
    const locations = await getLocationsByCode(db);
    const loc = locations[body.location_code || "HQ"];
    for (const l of insertedLines) {
      const { data: resId } = await db.rpc("hw_reserve_stock", {
        p_variant: l.variant_id, p_location: loc.id, p_qty: l.quantity,
        p_order_line: l.id, p_checkout: null, p_expires: null,
      });
      if (!resId) warnings.push(`${l.sku}: not enough free stock in ${loc.code} — nothing reserved.`);
    }
    await logOrderEvent(db, order.id, "stock_reserved", "admin", { location: loc.code, warnings });
  }

  return NextResponse.json({ ...order, warnings }, { status: 201 });
}
