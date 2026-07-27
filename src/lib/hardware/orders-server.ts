// Server-side order writers (API routes only). Every state change goes through
// these so the hw_order_events trail stays complete — emails/3PL will consume
// events later, never poll mutable state.

import { EU_COUNTRIES, computeLine, deriveFulfillmentStatus, derivePaymentStatus, toCents, type PaymentStatus } from "./orders";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type CreateOrderInput = {
  email: string;
  phone?: string | null;
  country: string;
  channel: "admin" | "web";
  lines: { variant_id: string; quantity: number; unit_price_eur?: string | number }[];
  notes?: string | null;
  contact_id?: string | null;
  shipping_address?: Record<string, unknown> | null;
  billing_address?: Record<string, unknown> | null;
  /** Admin may type a price; the web shop NEVER trusts client prices. */
  allowPriceOverride: boolean;
};

/** Shared order creation (admin entry + web checkout): server-side pricing from
 *  the catalog, destination VAT, snapshotted lines, created event. Returns the
 *  order + inserted lines, or an error with an HTTP-ish status. */
export async function createOrderCore(db: Db, input: CreateOrderInput): Promise<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { order: any; lines: any[]; error?: undefined; status?: undefined } | { error: string; status: number; order?: never; lines?: never }
> {
  const variantIds = input.lines.map((l) => l.variant_id).filter(Boolean);
  if (!variantIds.length) return { error: "at least one line is required", status: 400 };
  const { data: variants } = await db.from("hw_variants")
    .select("id,sku,name,rrp,lifecycle,archived_at,hw_products(name,price,status)").in("id", variantIds);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map(((variants ?? []) as any[]).map((v) => [v.id, v]));

  const country = (input.country || "DE").toUpperCase();
  const tax = await resolveTax(db, country);

  const lines = [];
  let subtotalNet = 0, taxTotal = 0, grandTotal = 0;
  for (const l of input.lines) {
    const v = byId.get(l.variant_id);
    if (!v || v.archived_at) return { error: "unknown variant on a line", status: 400 };
    if (input.channel === "web" && (v.hw_products?.status !== "published" || ["discontinued"].includes(v.lifecycle))) {
      return { error: `${v.sku} is not available in the shop.`, status: 409 };
    }
    const qty = Math.max(1, Number(l.quantity) || 1);
    const grossDefault = v.rrp ?? v.hw_products?.price ?? 0;
    const unitGross = input.allowPriceOverride && l.unit_price_eur != null && l.unit_price_eur !== ""
      ? toCents(l.unit_price_eur)
      : toCents(grossDefault);
    if (!unitGross) return { error: `${v.sku} has no price — set an RRP first.`, status: 400 };
    const t = computeLine(qty, unitGross, tax.rate);
    subtotalNet += t.totalNet; taxTotal += t.taxAmount; grandTotal += t.totalGross;
    lines.push({
      variant_id: v.id, sku: v.sku, title: v.hw_products?.name ?? v.name, variant_title: v.name,
      quantity: qty, unit_price_net: t.unitNet, unit_price_gross: unitGross,
      tax_rate: tax.rate, tax_amount: t.taxAmount, total_gross: t.totalGross,
    });
  }

  // Link an existing contact by email so orders surface in the CRM.
  let contactId = input.contact_id ?? null;
  if (!contactId) {
    const { data: contact } = await db.from("contacts").select("id").ilike("email", input.email).maybeSingle();
    contactId = contact?.id ?? null;
  }

  const { data: order, error } = await db.from("hw_orders").insert({
    email: input.email, contact_id: contactId, phone: input.phone ?? null,
    tax_country: country, tax_treatment: tax.treatment,
    tax_breakdown: [{ rate: tax.rate, net: subtotalNet, tax: taxTotal }],
    subtotal_net: subtotalNet, tax_total: taxTotal, grand_total: grandTotal,
    shipping_address: input.shipping_address ?? null, billing_address: input.billing_address ?? null,
    notes: input.notes ?? null, sales_channel: input.channel,
  }).select().single();
  if (error) return { error: error.message, status: 400 };

  const withOrder = lines.map((l) => ({ ...l, order_id: order.id }));
  const { data: insertedLines, error: lineErr } = await db.from("hw_order_lines").insert(withOrder).select();
  if (lineErr) {
    await db.from("hw_orders").delete().eq("id", order.id);
    return { error: lineErr.message, status: 400 };
  }
  await logOrderEvent(db, order.id, "order_created", input.channel === "web" ? "customer" : "admin", {
    channel: input.channel, grand_total: grandTotal,
  });
  return { order, lines: insertedLines };
}

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
