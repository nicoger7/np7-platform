// Server-side order writers (API routes only). Every state change goes through
// these so the hw_order_events trail stays complete — emails/3PL will consume
// events later, never poll mutable state.

import { EU_COUNTRIES, deriveFulfillmentStatus, derivePaymentStatus, type PaymentStatus } from "./orders";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function logOrderEvent(db: Db, orderId: string, type: string, actor = "admin", payload: Record<string, unknown> = {}) {
  await db.from("hw_order_events").insert({ order_id: orderId, type, actor, payload });
}

/** Destination VAT (blueprint §3.2): DE domestic 19, EU → hw_tax_rates (OSS), else export 0. */
export async function resolveTax(db: Db, country: string): Promise<{ rate: number; treatment: "domestic" | "eu_oss" | "export" }> {
  const c = (country || "DE").toUpperCase();
  if (c === "DE") return { rate: 19, treatment: "domestic" };
  if (!EU_COUNTRIES.has(c)) return { rate: 0, treatment: "export" };
  const { data } = await db.from("hw_tax_rates").select("rate").eq("country", c).single();
  return { rate: data ? Number(data.rate) : 19, treatment: "eu_oss" };
}

/** Re-derive payment_status from the ledger; writes an event when it changes. */
export async function recalcPaymentStatus(db: Db, orderId: string, actor = "admin") {
  const [{ data: order }, { data: txs }] = await Promise.all([
    db.from("hw_orders").select("payment_status,grand_total").eq("id", orderId).single(),
    db.from("hw_order_transactions").select("type,amount").eq("order_id", orderId),
  ]);
  if (!order) return;
  const next = derivePaymentStatus(txs ?? [], order.grand_total, order.payment_status as PaymentStatus);
  if (next !== order.payment_status) {
    await db.from("hw_orders").update({ payment_status: next, updated_at: new Date().toISOString() }).eq("id", orderId);
    await logOrderEvent(db, orderId, "payment_status_changed", actor, { from: order.payment_status, to: next });
  }
}

/** Re-derive fulfillment_status from line quantities; event on change. */
export async function recalcFulfillmentStatus(db: Db, orderId: string, actor = "admin") {
  const [{ data: order }, { data: lines }] = await Promise.all([
    db.from("hw_orders").select("fulfillment_status").eq("id", orderId).single(),
    db.from("hw_order_lines").select("quantity,quantity_fulfilled,quantity_shipped,quantity_delivered,quantity_returned,requires_shipping").eq("order_id", orderId),
  ]);
  if (!order || !lines?.length) return;
  const next = deriveFulfillmentStatus(lines);
  if (next !== order.fulfillment_status) {
    await db.from("hw_orders").update({ fulfillment_status: next, updated_at: new Date().toISOString() }).eq("id", orderId);
    await logOrderEvent(db, orderId, "fulfillment_status_changed", actor, { from: order.fulfillment_status, to: next });
  }
}

/** Latest landed €/unit per variant (newest receipt wins) — COGS on the sale movement. */
export async function latestLandedCosts(db: Db, variantIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!variantIds.length) return map;
  const { data } = await db.from("hw_receipts")
    .select("variant_id,unit_landed_cost,received_at")
    .in("variant_id", variantIds)
    .order("received_at", { ascending: false });
  for (const r of data ?? []) {
    if (r.unit_landed_cost != null && !map.has(r.variant_id)) map.set(r.variant_id, Number(r.unit_landed_cost));
  }
  return map;
}

/** Release every reservation held for an order (cancel path). */
export async function releaseOrderReservations(db: Db, orderId: string) {
  const { data: lines } = await db.from("hw_order_lines").select("id").eq("order_id", orderId);
  const ids = (lines ?? []).map((l: { id: string }) => l.id);
  if (!ids.length) return 0;
  const { data: reservations } = await db.from("hw_reservations").select("id").in("order_line_id", ids);
  for (const r of reservations ?? []) {
    await db.rpc("hw_release_reservation", { p_reservation: r.id });
  }
  return (reservations ?? []).length;
}
