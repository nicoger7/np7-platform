import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { logOrderEvent, latestLandedCosts, recalcFulfillmentStatus } from "@/lib/hardware/orders-server";
import { getLocationsByCode, recordMovement } from "@/lib/hardware/ops-server";

// POST /api/admin/orders/:id/fulfillments — pack goods for an order.
// Creation IS the stock consumption: reservations release, and each unit moves
// location → CUSTOMER ('sale') carrying its latest landed cost (COGS).
// Body: { lines: [{order_line_id, quantity}], location_code?, carrier?, tracking_number?, tracking_url? }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  const reqLines: { order_line_id: string; quantity: number }[] = (body.lines ?? []).filter((l: { quantity: number }) => Number(l.quantity) > 0);
  if (!reqLines.length) return NextResponse.json({ error: "Nothing to fulfill — set quantities." }, { status: 400 });

  const { data: order } = await db.from("hw_orders").select("status,payment_status,risk_status").eq("id", id).single();
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (order.status !== "pending") return NextResponse.json({ error: "Order is not open." }, { status: 409 });
  // The fraud gate from the blueprint: goods never leave while under review.
  if (order.risk_status === "review") return NextResponse.json({ error: "Order is under risk review — clear it before fulfilling." }, { status: 409 });
  if (order.risk_status === "blocked") return NextResponse.json({ error: "Order is blocked." }, { status: 409 });

  const { data: orderLines } = await db.from("hw_order_lines").select("*").eq("order_id", id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineById = new Map(((orderLines ?? []) as any[]).map((l) => [l.id, l]));
  for (const r of reqLines) {
    const l = lineById.get(r.order_line_id);
    if (!l) return NextResponse.json({ error: "unknown order line" }, { status: 400 });
    if (l.quantity_fulfilled + r.quantity > l.quantity) {
      return NextResponse.json({ error: `${l.sku}: only ${l.quantity - l.quantity_fulfilled} left to fulfill.` }, { status: 409 });
    }
  }

  const locations = await getLocationsByCode(db);
  const source = locations[body.location_code || "HQ"];
  const customer = locations["CUSTOMER"];
  if (!source || !customer) return NextResponse.json({ error: "locations missing" }, { status: 500 });

  const { data: fulfillment, error } = await db.from("hw_fulfillments").insert({
    order_id: id, provider: "manual", location_id: source.id,
    carrier: body.carrier || null, tracking_number: body.tracking_number || null,
    tracking_url: body.tracking_url || null, notes: body.notes || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const landed = await latestLandedCosts(db, reqLines.map((r) => lineById.get(r.order_line_id)!.variant_id).filter(Boolean));

  for (const r of reqLines) {
    const l = lineById.get(r.order_line_id)!;
    await db.from("hw_fulfillment_lines").insert({ fulfillment_id: fulfillment.id, order_line_id: l.id, quantity: r.quantity });

    // Release any reservation held for this line (partial-aware), then move stock.
    if (l.variant_id) {
      const { data: reservations } = await db.from("hw_reservations")
        .select("id,qty").eq("order_line_id", l.id).eq("location_id", source.id).order("created_at");
      let released = 0;
      for (const res of reservations ?? []) {
        if (released >= r.quantity) break;
        await db.rpc("hw_release_reservation", { p_reservation: res.id });
        released += res.qty;
      }
      // A reservation bigger than this partial fulfillment — re-hold the remainder.
      if (released > r.quantity) {
        await db.rpc("hw_reserve_stock", {
          p_variant: l.variant_id, p_location: source.id, p_qty: released - r.quantity,
          p_order_line: l.id, p_checkout: null, p_expires: null,
        });
      }
      await recordMovement(db, {
        variant_id: l.variant_id, from: source.id, to: customer.id, qty: r.quantity,
        reason: "sale", ref_type: "fulfillment", ref_id: fulfillment.id,
        unit_cost: landed.get(l.variant_id) ?? null, actor: "admin",
      });
    }
    await db.from("hw_order_lines").update({ quantity_fulfilled: l.quantity_fulfilled + r.quantity }).eq("id", l.id);
  }

  await logOrderEvent(db, id, "fulfillment_created", "admin", {
    fulfillment_id: fulfillment.id, location: source.code,
    units: reqLines.reduce((a, r) => a + r.quantity, 0), tracking: body.tracking_number ?? null,
  });
  await recalcFulfillmentStatus(db, id);
  return NextResponse.json(fulfillment, { status: 201 });
}
