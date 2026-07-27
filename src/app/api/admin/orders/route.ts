import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { notArchived } from "@/lib/archive";
import { computeLine, toCents } from "@/lib/hardware/orders";
import { logOrderEvent, resolveTax } from "@/lib/hardware/orders-server";
import { getLocationsByCode } from "@/lib/hardware/ops-server";

// GET /api/admin/orders — list with filters + line summaries
export async function GET(request: NextRequest) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const body = await request.json();
  if (!body.email || !Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "email and at least one line are required" }, { status: 400 });
  }

  const variantIds = body.lines.map((l: { variant_id: string }) => l.variant_id).filter(Boolean);
  const { data: variants } = await db.from("hw_variants")
    .select("id,sku,name,rrp,hw_products(name,price)").in("id", variantIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map(((variants ?? []) as any[]).map((v) => [v.id, v]));

  const country = (body.country || "DE").toUpperCase();
  const tax = await resolveTax(db, country);

  // Build snapshotted lines (gross-first, VAT from destination).
  type LineIn = { variant_id: string; quantity: number; unit_price_eur?: string | number };
  const lines = [];
  let subtotalNet = 0, taxTotal = 0, grandTotal = 0;
  for (const l of body.lines as LineIn[]) {
    const v = byId.get(l.variant_id);
    if (!v) return NextResponse.json({ error: "unknown variant on a line" }, { status: 400 });
    const qty = Math.max(1, Number(l.quantity) || 1);
    const grossDefault = v.rrp ?? v.hw_products?.price ?? 0;
    const unitGross = l.unit_price_eur != null && l.unit_price_eur !== "" ? toCents(l.unit_price_eur) : toCents(grossDefault);
    if (!unitGross) return NextResponse.json({ error: `${v.sku} has no price — set an RRP or type one.` }, { status: 400 });
    const t = computeLine(qty, unitGross, tax.rate);
    subtotalNet += t.totalNet; taxTotal += t.taxAmount; grandTotal += t.totalGross;
    lines.push({
      variant_id: v.id, sku: v.sku, title: v.hw_products?.name ?? v.name, variant_title: v.name,
      quantity: qty, unit_price_net: t.unitNet, unit_price_gross: unitGross,
      tax_rate: tax.rate, tax_amount: t.taxAmount, total_gross: t.totalGross,
    });
  }

  const { data: order, error } = await db.from("hw_orders").insert({
    email: body.email, contact_id: body.contact_id ?? null, phone: body.phone ?? null,
    tax_country: country, tax_treatment: tax.treatment,
    tax_breakdown: [{ rate: tax.rate, net: subtotalNet, tax: taxTotal }],
    subtotal_net: subtotalNet, tax_total: taxTotal, grand_total: grandTotal,
    shipping_address: body.shipping_address ?? null, billing_address: body.billing_address ?? null,
    notes: body.notes ?? null, sales_channel: "admin",
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const withOrder = lines.map((l) => ({ ...l, order_id: order.id }));
  const { data: insertedLines, error: lineErr } = await db.from("hw_order_lines").insert(withOrder).select();
  if (lineErr) {
    await db.from("hw_orders").delete().eq("id", order.id);
    return NextResponse.json({ error: lineErr.message }, { status: 400 });
  }
  await logOrderEvent(db, order.id, "order_created", "admin", { channel: "admin", grand_total: grandTotal });

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
