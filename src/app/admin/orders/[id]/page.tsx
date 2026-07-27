"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fmtCents } from "@/lib/hardware/orders";
import { StatusBadge, ORDER_STATUS_COLOR, PAYMENT_STATUS_COLOR, FULFILLMENT_STATUS_COLOR } from "@/components/admin/hw-status";

interface OrderLine {
  id: string; variant_id: string | null; sku: string; title: string; variant_title: string | null;
  quantity: number; unit_price_gross: number; tax_rate: number; total_gross: number;
  quantity_fulfilled: number; quantity_shipped: number; quantity_delivered: number; quantity_returned: number;
}
interface Tx { id: string; type: string; amount: number; currency: string; provider: string; provider_ref: string | null; reason: string | null; created_at: string }
interface Ev { id: string; type: string; actor: string | null; payload: Record<string, unknown>; created_at: string }
interface FulfillmentLine { id: string; order_line_id: string; quantity: number }
interface Fulfillment {
  id: string; status: string; carrier: string | null; tracking_number: string | null; tracking_url: string | null;
  packed_at: string; shipped_at: string | null; delivered_at: string | null;
  hw_fulfillment_lines: FulfillmentLine[]; hw_stock_locations: { code: string } | null;
}
interface Reservation { id: string; qty: number; order_line_id: string; hw_stock_locations: { code: string } | null }
interface Address { name?: string; line1?: string; line2?: string; postal_code?: string; city?: string; country?: string }
interface OrderDetail {
  id: string; display_number: number; email: string; phone: string | null; currency: string;
  status: string; payment_status: string; fulfillment_status: string; risk_status: string;
  subtotal_net: number; tax_total: number; grand_total: number; tax_country: string | null;
  tax_treatment: string; tax_breakdown: { rate: number; net: number; tax: number }[];
  shipping_address: Address | null; billing_address: Address | null; notes: string | null;
  sales_channel: string; placed_at: string;
  contacts: { id: string; name: string | null } | null;
  lines: OrderLine[]; transactions: Tx[]; events: Ev[]; fulfillments: Fulfillment[]; reservations: Reservation[];
}

const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
const labelClass = "block text-xs font-medium admin-muted mb-1";

function fmtDateTime(d: string | null) {
  return d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}

function AddressBlock({ a }: { a: Address | null }) {
  if (!a || (!a.name && !a.line1 && !a.city)) return <p className="text-xs admin-faint">Not set</p>;
  return (
    <p className="text-xs admin-muted leading-relaxed">
      {[a.name, a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(" "), a.country].filter(Boolean).join(" · ")}
    </p>
  );
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [o, setO] = useState<OrderDetail | null>(null);
  const [newTx, setNewTx] = useState({ type: "capture", amount_eur: "", provider: "bank_transfer", provider_ref: "" });
  const [fulfillQty, setFulfillQty] = useState<Record<string, string>>({});
  const [fulfillMeta, setFulfillMeta] = useState({ location_code: "HQ", carrier: "", tracking_number: "" });
  const [editAddress, setEditAddress] = useState(false);
  const [addr, setAddr] = useState<Address>({});

  const load = useCallback(() => {
    fetch(`/api/admin/orders/${id}`).then((r) => r.json()).then((d) => {
      setO(d);
      setAddr(d.shipping_address ?? {});
    });
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function act(path: string, body: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) alert((await res.json()).error || "Action failed");
    load();
  }

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) alert((await res.json()).error || "Save failed");
    load();
  }

  async function recordTx() {
    if (!newTx.amount_eur) return;
    await act(`/api/admin/orders/${id}/transactions`, newTx);
    setNewTx({ type: "capture", amount_eur: "", provider: "bank_transfer", provider_ref: "" });
  }

  async function createFulfillment() {
    const lines = Object.entries(fulfillQty)
      .map(([order_line_id, quantity]) => ({ order_line_id, quantity: Number(quantity) }))
      .filter((l) => l.quantity > 0);
    if (!lines.length) return;
    await act(`/api/admin/orders/${id}/fulfillments`, { ...fulfillMeta, lines });
    setFulfillQty({});
  }

  if (!o) return <div className="flex items-center justify-center h-64"><p className="text-sm admin-faint">Loading…</p></div>;

  const captured = o.transactions.filter((t) => t.type === "capture").reduce((a, t) => a + t.amount, 0);
  const refunded = -o.transactions.filter((t) => t.type === "refund").reduce((a, t) => a + t.amount, 0);
  const openToFulfill = o.lines.some((l) => l.quantity_fulfilled < l.quantity);
  const reservedByLine = new Map<string, number>();
  for (const r of o.reservations) reservedByLine.set(r.order_line_id, (reservedByLine.get(r.order_line_id) ?? 0) + r.qty);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => router.push("/admin/orders")} className="text-xs admin-faint hover:text-[var(--admin-accent)] mb-2">← Orders</button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold admin-heading font-mono">#{o.display_number}</h1>
            <StatusBadge value={o.status} colors={ORDER_STATUS_COLOR} />
            <StatusBadge value={o.payment_status} colors={PAYMENT_STATUS_COLOR} />
            <StatusBadge value={o.fulfillment_status} colors={FULFILLMENT_STATUS_COLOR} />
            <span className="text-xs admin-faint">{o.sales_channel} · {fmtDateTime(o.placed_at)}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select className={`${inputClass} max-w-[150px]`} value={o.risk_status} title="Fraud gate — review/blocked stops fulfillment"
              onChange={(e) => patch({ risk_status: e.target.value })}>
              <option value="ok">risk: ok</option>
              <option value="review">risk: review</option>
              <option value="blocked">risk: blocked</option>
            </select>
            {o.status === "pending" && o.fulfillment_status === "delivered" && (
              <button onClick={() => act(`/api/admin/orders/${id}/status`, { action: "complete" })}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]">Complete</button>
            )}
            {o.status === "pending" && (
              <button onClick={() => act(`/api/admin/orders/${id}/status`, { action: "cancel" }, "Cancel this order? Reservations are released.")}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-red-400" style={{ border: "1px solid var(--admin-border)" }}>Cancel order</button>
            )}
          </div>
        </div>
      </div>

      {/* Customer + totals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl p-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold admin-heading">Customer</h2>
            {o.contacts && <a href={`/admin/members/${o.contacts.id}`} className="text-xs text-[var(--admin-accent)] hover:underline">{o.contacts.name ?? "Contact"} →</a>}
          </div>
          <p className="text-sm admin-heading mb-1">{o.email}{o.phone ? <span className="admin-faint text-xs ml-2">{o.phone}</span> : null}</p>
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Shipping address</label>
              {o.fulfillment_status === "unfulfilled" && (
                <button onClick={() => setEditAddress(!editAddress)} className="text-[10px] font-bold uppercase text-[var(--admin-accent)] hover:underline">
                  {editAddress ? "Close" : "Edit"}
                </button>
              )}
            </div>
            {editAddress ? (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {(["name", "line1", "line2", "postal_code", "city", "country"] as const).map((k) => (
                  <input key={k} className={`${inputClass} text-xs ${k === "line1" || k === "name" ? "col-span-2" : ""}`} placeholder={k.replace(/_/g, " ")}
                    value={addr[k] ?? ""} onChange={(e) => setAddr({ ...addr, [k]: e.target.value })} />
                ))}
                <button onClick={() => { patch({ shipping_address: addr }); setEditAddress(false); }}
                  className="col-span-2 px-3 py-1.5 bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg">Save address</button>
              </div>
            ) : <AddressBlock a={o.shipping_address} />}
          </div>
          <div className="mt-3">
            <label className={labelClass}>Notes</label>
            <input className={`${inputClass} text-xs`} defaultValue={o.notes ?? ""} onBlur={(e) => e.target.value !== (o.notes ?? "") && patch({ notes: e.target.value })} />
          </div>
        </div>

        <div className="rounded-xl p-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h2 className="text-sm font-bold admin-heading mb-3">Totals</h2>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="admin-muted">Subtotal (net)</span><span className="admin-heading tabular-nums">{fmtCents(o.subtotal_net)}</span></div>
            <div className="flex justify-between">
              <span className="admin-muted">VAT {o.tax_breakdown?.[0]?.rate ?? 0}% · {o.tax_country} · {o.tax_treatment.replace(/_/g, " ")}</span>
              <span className="admin-heading tabular-nums">{fmtCents(o.tax_total)}</span>
            </div>
            <div className="flex justify-between pt-1.5 text-sm font-bold" style={{ borderTop: "1px solid var(--admin-border)" }}>
              <span className="admin-heading">Total</span><span className="admin-heading tabular-nums">{fmtCents(o.grand_total)}</span>
            </div>
            <div className="flex justify-between pt-1.5"><span className="admin-muted">Captured</span><span className={`tabular-nums ${captured >= o.grand_total ? "text-green-400" : "text-amber-500"}`}>{fmtCents(captured)}</span></div>
            {refunded > 0 && <div className="flex justify-between"><span className="admin-muted">Refunded</span><span className="text-red-400 tabular-nums">−{fmtCents(refunded)}</span></div>}
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className="rounded-xl admin-tablecard overflow-x-auto mb-6" style={{ border: "1px solid var(--admin-border)" }}>
        <div className="grid grid-cols-[1fr_60px_100px_110px_170px] gap-3 px-5 py-3 admin-surface min-w-[640px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
          {["Item", "Qty", "Unit (gross)", "Total", "Fulfilled / shipped / delivered"].map((h, i) => (
            <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
          ))}
        </div>
        {o.lines.map((l) => (
          <div key={l.id} className="grid grid-cols-[1fr_60px_100px_110px_170px] gap-3 px-5 py-3 min-w-[640px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <span className="text-sm admin-heading self-center truncate">
              {l.title}{l.variant_title ? <span className="admin-muted"> · {l.variant_title}</span> : null}
              <span className="admin-faint text-xs ml-2 font-mono">{l.sku}</span>
              {(reservedByLine.get(l.id) ?? 0) > 0 && <span className="ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--admin-accent-weak)] text-[var(--admin-accent)]">{reservedByLine.get(l.id)} reserved</span>}
            </span>
            <span className="text-xs admin-muted self-center tabular-nums">{l.quantity}</span>
            <span className="text-xs admin-muted self-center tabular-nums">{fmtCents(l.unit_price_gross)}</span>
            <span className="text-xs admin-heading self-center tabular-nums">{fmtCents(l.total_gross)}</span>
            <span className="text-xs admin-muted self-center tabular-nums">{l.quantity_fulfilled} / {l.quantity_shipped} / {l.quantity_delivered}{l.quantity_returned ? <span className="text-red-400"> · {l.quantity_returned} back</span> : null}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Payments */}
        <div className="rounded-xl p-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h2 className="text-sm font-bold admin-heading mb-3">Payments</h2>
          {o.transactions.length === 0 ? <p className="text-xs admin-faint mb-3">No money moved yet.</p> : (
            <div className="space-y-1.5 mb-4">
              {o.transactions.map((t) => (
                <div key={t.id} className="flex items-center gap-3 text-xs py-1">
                  <span className={`font-bold uppercase ${t.type === "refund" ? "text-red-400" : "text-green-400"}`}>{t.type}</span>
                  <span className="admin-heading tabular-nums">{fmtCents(Math.abs(t.amount))}</span>
                  <span className="admin-faint">{t.provider}{t.provider_ref ? ` · ${t.provider_ref}` : ""}</span>
                  <span className="admin-faint ml-auto">{fmtDateTime(t.created_at)}</span>
                </div>
              ))}
            </div>
          )}
          {o.status === "pending" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
              <div><label className={labelClass}>Type</label>
                <select className={inputClass} value={newTx.type} onChange={(e) => setNewTx({ ...newTx, type: e.target.value })}>
                  <option value="capture">capture</option>
                  <option value="refund">refund</option>
                </select></div>
              <div><label className={labelClass}>Amount €</label>
                <input type="number" step="0.01" className={inputClass} value={newTx.amount_eur} onChange={(e) => setNewTx({ ...newTx, amount_eur: e.target.value })} /></div>
              <div><label className={labelClass}>Provider</label>
                <select className={inputClass} value={newTx.provider} onChange={(e) => setNewTx({ ...newTx, provider: e.target.value })}>
                  {["bank_transfer", "stripe", "gift_card", "manual"].map((p) => <option key={p}>{p}</option>)}
                </select></div>
              <button onClick={recordTx} disabled={!newTx.amount_eur}
                className="px-3 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors">Record</button>
            </div>
          )}
        </div>

        {/* Fulfillment */}
        <div className="rounded-xl p-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h2 className="text-sm font-bold admin-heading mb-3">Fulfillment</h2>
          {o.fulfillments.length > 0 && (
            <div className="space-y-2 mb-4">
              {o.fulfillments.map((f) => (
                <div key={f.id} className="rounded-lg px-3 py-2.5" style={{ border: "1px solid var(--admin-border)" }}>
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <StatusBadge value={f.status} colors={{ pending: "bg-amber-500/15 text-amber-500", shipped: "bg-purple-500/15 text-purple-400", delivered: "bg-green-500/15 text-green-400", canceled: "bg-red-500/15 text-red-400" }} />
                    <span className="admin-muted">{f.hw_fulfillment_lines.reduce((a, l) => a + l.quantity, 0)} units from {f.hw_stock_locations?.code ?? "?"}</span>
                    {f.tracking_number && <span className="admin-faint font-mono">{f.carrier} {f.tracking_number}</span>}
                    <span className="ml-auto flex gap-1.5">
                      {f.status === "pending" && (
                        <>
                          <button onClick={() => {
                            const tn = f.tracking_number ?? prompt("Tracking number (optional)") ?? "";
                            act(`/api/admin/orders/${id}/fulfillments/${f.id}`, { action: "ship", tracking_number: tn || undefined });
                          }} className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-[var(--admin-accent-weak)] text-[var(--admin-accent)]">Ship</button>
                          <button onClick={() => act(`/api/admin/orders/${id}/fulfillments/${f.id}`, { action: "cancel" }, "Cancel this packed fulfillment? Stock moves back.")}
                            className="px-2 py-1 rounded text-[10px] font-bold uppercase text-red-400" style={{ border: "1px solid var(--admin-border)" }}>Cancel</button>
                        </>
                      )}
                      {f.status === "shipped" && (
                        <button onClick={() => act(`/api/admin/orders/${id}/fulfillments/${f.id}`, { action: "deliver" })}
                          className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-green-500/15 text-green-400">Delivered</button>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {o.status === "pending" && openToFulfill ? (
            <div>
              <label className={labelClass}>Pack a new shipment</label>
              <div className="space-y-1.5 mb-3">
                {o.lines.filter((l) => l.quantity_fulfilled < l.quantity).map((l) => (
                  <div key={l.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 admin-muted truncate">{l.title} · {l.variant_title} <span className="admin-faint">({l.quantity - l.quantity_fulfilled} open)</span></span>
                    <input type="number" min={0} max={l.quantity - l.quantity_fulfilled} className={`${inputClass} max-w-[70px] text-xs`}
                      value={fulfillQty[l.id] ?? ""} placeholder="0"
                      onChange={(e) => setFulfillQty({ ...fulfillQty, [l.id]: e.target.value })} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                <div><label className={labelClass}>From</label>
                  <select className={inputClass} value={fulfillMeta.location_code} onChange={(e) => setFulfillMeta({ ...fulfillMeta, location_code: e.target.value })}>
                    <option value="HQ">HQ</option><option value="3PL">3PL</option>
                  </select></div>
                <div><label className={labelClass}>Carrier</label>
                  <input className={inputClass} value={fulfillMeta.carrier} onChange={(e) => setFulfillMeta({ ...fulfillMeta, carrier: e.target.value })} placeholder="DHL" /></div>
                <div><label className={labelClass}>Tracking #</label>
                  <input className={inputClass} value={fulfillMeta.tracking_number} onChange={(e) => setFulfillMeta({ ...fulfillMeta, tracking_number: e.target.value })} /></div>
                <button onClick={createFulfillment}
                  className="px-3 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors">Pack</button>
              </div>
              <p className="text-[11px] admin-faint mt-2">Packing consumes stock (reservation → sale movement with landed COGS). Risk review blocks this.</p>
            </div>
          ) : o.status === "pending" && !openToFulfill ? (
            <p className="text-xs admin-faint">Everything packed. 🎉</p>
          ) : null}
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
        <div className="px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
          <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Timeline</span>
        </div>
        {o.events.map((e) => (
          <div key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-xs" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <span className="admin-faint w-28 shrink-0">{fmtDateTime(e.created_at)}</span>
            <span className="admin-heading">{e.type.replace(/_/g, " ")}</span>
            {e.payload && Object.keys(e.payload).length > 0 && (
              <span className="admin-faint truncate">
                {Object.entries(e.payload).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("; ") : String(v)}`).join(" · ")}
              </span>
            )}
            <span className="admin-faint ml-auto">{e.actor}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
