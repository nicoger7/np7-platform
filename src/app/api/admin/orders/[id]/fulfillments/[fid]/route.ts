import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { logOrderEvent, recalcFulfillmentStatus } from "@/lib/hardware/orders-server";
import { getLocationsByCode, recordMovement } from "@/lib/hardware/ops-server";

// POST /api/admin/orders/:id/fulfillments/:fid — { action: "ship"|"deliver"|"cancel", tracking_number?, carrier? }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; fid: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id, fid } = await params;
  const body = await request.json();

  const { data: f } = await db.from("hw_fulfillments")
    .select("*, hw_fulfillment_lines(id,order_line_id,quantity)").eq("id", fid).eq("order_id", id).single();
  if (!f) return NextResponse.json({ error: "not found" }, { status: 404 });

  const bump = async (col: "quantity_shipped" | "quantity_delivered" | "quantity_fulfilled", sign: 1 | -1) => {
    for (const fl of f.hw_fulfillment_lines ?? []) {
      const { data: l } = await db.from("hw_order_lines").select(`id,${col}`).eq("id", fl.order_line_id).single();
      if (l) await db.from("hw_order_lines").update({ [col]: Math.max(0, l[col] + sign * fl.quantity) }).eq("id", fl.order_line_id);
    }
  };

  if (body.action === "ship") {
    if (f.status !== "pending") return NextResponse.json({ error: "Already shipped." }, { status: 409 });
    const { data, error } = await db.from("hw_fulfillments").update({
      status: "shipped", shipped_at: new Date().toISOString(),
      carrier: body.carrier ?? f.carrier, tracking_number: body.tracking_number ?? f.tracking_number,
      tracking_url: body.tracking_url ?? f.tracking_url,
    }).eq("id", fid).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await bump("quantity_shipped", 1);
    await logOrderEvent(db, id, "fulfillment_shipped", "admin", { fulfillment_id: fid, tracking: data.tracking_number });
    await recalcFulfillmentStatus(db, id);
    return NextResponse.json(data);
  }

  if (body.action === "deliver") {
    if (f.status === "canceled") return NextResponse.json({ error: "Fulfillment was canceled." }, { status: 409 });
    const { data, error } = await db.from("hw_fulfillments").update({
      status: "delivered", delivered_at: new Date().toISOString(),
      shipped_at: f.shipped_at ?? new Date().toISOString(),
    }).eq("id", fid).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (f.status === "pending") await bump("quantity_shipped", 1);
    await bump("quantity_delivered", 1);
    await logOrderEvent(db, id, "fulfillment_delivered", "admin", { fulfillment_id: fid });
    await recalcFulfillmentStatus(db, id);
    return NextResponse.json(data);
  }

  if (body.action === "cancel") {
    if (f.status !== "pending") {
      return NextResponse.json({ error: "Only packed (not yet shipped) fulfillments can be canceled — shipped goods come back as a return." }, { status: 409 });
    }
    // Reverse the consumption: CUSTOMER → source location, line counters back down.
    const locations = await getLocationsByCode(db);
    const customer = locations["CUSTOMER"];
    for (const fl of f.hw_fulfillment_lines ?? []) {
      const { data: l } = await db.from("hw_order_lines").select("variant_id").eq("id", fl.order_line_id).single();
      if (l?.variant_id && f.location_id) {
        await recordMovement(db, {
          variant_id: l.variant_id, from: customer.id, to: f.location_id, qty: fl.quantity,
          reason: "adjustment", ref_type: "fulfillment_cancel", ref_id: fid,
          note: "fulfillment canceled before shipping", actor: "admin",
        });
      }
    }
    await bump("quantity_fulfilled", -1);
    const { data, error } = await db.from("hw_fulfillments").update({ status: "canceled" }).eq("id", fid).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await logOrderEvent(db, id, "fulfillment_canceled", "admin", { fulfillment_id: fid });
    await recalcFulfillmentStatus(db, id);
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
