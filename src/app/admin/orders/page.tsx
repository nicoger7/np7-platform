"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtCents, ORDER_STATUSES, PAYMENT_STATUSES, FULFILLMENT_STATUSES } from "@/lib/hardware/orders";
import { StatusBadge, ORDER_STATUS_COLOR, PAYMENT_STATUS_COLOR, FULFILLMENT_STATUS_COLOR } from "@/components/admin/hw-status";

interface OrderRow {
  id: string; display_number: number; email: string; customerName: string | null;
  currency: string; status: string; payment_status: string; fulfillment_status: string;
  grand_total: number; sales_channel: string; risk_status: string; placed_at: string; units: number;
}
interface VariantOption {
  id: string; sku: string; name: string;
  hw_products: { id: string; name: string; category: string } | null;
}

const COUNTRIES = ["DE", "AT", "NL", "BE", "FR", "IT", "ES", "DK", "SE", "FI", "PL", "CZ", "PT", "IE", "GR", "HR", "CH", "GB", "NO", "US"];

const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
const labelClass = "block text-xs font-medium admin-muted mb-1";

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—";
}

type NewLine = { variant_id: string; quantity: string; unit_price_eur: string };

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "", payment_status: "", fulfillment_status: "" });
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", country: "DE", notes: "", reserve: true, location_code: "HQ" });
  const [newLines, setNewLines] = useState<NewLine[]>([{ variant_id: "", quantity: "1", unit_price_eur: "" }]);

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
    fetch(`/api/admin/orders?${qs}`).then((r) => r.json()).then((d) => {
      setOrders(Array.isArray(d) ? d : []);
      setLoading(false);
    });
  }, [search, filters]);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    fetch("/api/admin/variants").then((r) => r.json()).then((d) => setVariants(Array.isArray(d) ? d : []));
  }, []);

  async function createOrder() {
    const lines = newLines.filter((l) => l.variant_id && Number(l.quantity) > 0);
    if (!form.email || !lines.length) return;
    setCreating(true);
    const res = await fetch("/api/admin/orders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, lines }),
    });
    const d = await res.json();
    setCreating(false);
    if (!res.ok) { alert(d.error || "Could not create order"); return; }
    if (d.warnings?.length) alert(`Order created with warnings:\n${d.warnings.join("\n")}`);
    router.push(`/admin/orders/${d.id}`);
  }

  const open = orders.filter((o) => o.status === "pending").length;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Orders</h1>
          <p className="text-sm admin-muted">{open} open · {orders.length} shown · web checkout lands here next</p>
        </div>
        <button onClick={() => setShowNew(!showNew)}
          className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
          New Order
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <input className={`${inputClass} max-w-[220px]`} placeholder="Search email or order #…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={`${inputClass} max-w-[140px]`} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All states</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={`${inputClass} max-w-[170px]`} value={filters.payment_status} onChange={(e) => setFilters({ ...filters, payment_status: e.target.value })}>
          <option value="">All payment states</option>
          {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <select className={`${inputClass} max-w-[190px]`} value={filters.fulfillment_status} onChange={(e) => setFilters({ ...filters, fulfillment_status: e.target.value })}>
          <option value="">All fulfillment states</option>
          {FULFILLMENT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {showNew && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">New Order (admin-entered)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="col-span-2"><label className={labelClass}>Customer email *</label>
              <input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoFocus /></div>
            <div><label className={labelClass}>Ship-to country (drives VAT)</label>
              <select className={inputClass} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
              </select></div>
            <div><label className={labelClass}>Notes</label>
              <input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>

          <label className={labelClass}>Lines (price blank = RRP)</label>
          <div className="space-y-2 mb-3">
            {newLines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_110px_36px] gap-2">
                <select className={inputClass} value={l.variant_id}
                  onChange={(e) => setNewLines(newLines.map((x, j) => j === i ? { ...x, variant_id: e.target.value } : x))}>
                  <option value="">Pick a variant…</option>
                  {variants.map((v) => <option key={v.id} value={v.id}>{v.hw_products?.name} · {v.name} ({v.sku})</option>)}
                </select>
                <input type="number" min={1} className={inputClass} value={l.quantity} placeholder="Qty"
                  onChange={(e) => setNewLines(newLines.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
                <input type="number" step="0.01" className={inputClass} value={l.unit_price_eur} placeholder="€ gross"
                  onChange={(e) => setNewLines(newLines.map((x, j) => j === i ? { ...x, unit_price_eur: e.target.value } : x))} />
                <button onClick={() => setNewLines(newLines.filter((_, j) => j !== i))} disabled={newLines.length === 1}
                  className="admin-faint hover:text-red-400 disabled:opacity-30 transition-colors" title="Remove line">✕</button>
              </div>
            ))}
          </div>
          <button onClick={() => setNewLines([...newLines, { variant_id: "", quantity: "1", unit_price_eur: "" }])}
            className="text-xs text-[var(--admin-accent)] hover:underline mb-4">+ Add line</button>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs admin-muted">
              <input type="checkbox" checked={form.reserve} onChange={(e) => setForm({ ...form, reserve: e.target.checked })} />
              Reserve stock from
            </label>
            <select className={`${inputClass} max-w-[180px]`} value={form.location_code} disabled={!form.reserve}
              onChange={(e) => setForm({ ...form, location_code: e.target.value })}>
              <option value="HQ">Own storage (HQ)</option>
              <option value="3PL">3PL warehouse</option>
            </select>
            <div className="ml-auto flex gap-2">
              <button onClick={createOrder} disabled={creating || !form.email}
                className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
                {creating ? "Creating…" : "Create order"}
              </button>
              <button onClick={() => setShowNew(false)} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
          <p className="text-sm admin-faint">No orders yet — the first one is one click away.</p>
        </div>
      ) : (
        <div className="rounded-xl admin-tablecard overflow-x-auto" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid grid-cols-[90px_1fr_100px_120px_130px_60px_100px_80px] gap-3 px-5 py-3 admin-surface min-w-[820px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            {["Order", "Customer", "State", "Payment", "Fulfillment", "Units", "Total", "Placed"].map((h, i) => (
              <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>
          {orders.map((o) => (
            <Link key={o.id} href={`/admin/orders/${o.id}`}
              className="grid grid-cols-[90px_1fr_100px_120px_130px_60px_100px_80px] gap-3 px-5 py-3 min-w-[820px] transition-colors hover:bg-[var(--admin-surface-hover)]"
              style={{ borderBottom: "1px solid var(--admin-border)" }}>
              <span className="text-sm font-mono font-medium admin-heading self-center">
                #{o.display_number}
                {o.risk_status !== "ok" && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-red-500 align-middle" title={`risk: ${o.risk_status}`} />}
              </span>
              <span className="text-xs admin-muted self-center truncate">{o.customerName || o.email}</span>
              <span className="self-center"><StatusBadge value={o.status} colors={ORDER_STATUS_COLOR} /></span>
              <span className="self-center"><StatusBadge value={o.payment_status} colors={PAYMENT_STATUS_COLOR} /></span>
              <span className="self-center"><StatusBadge value={o.fulfillment_status} colors={FULFILLMENT_STATUS_COLOR} /></span>
              <span className="text-xs admin-muted self-center tabular-nums">{o.units}</span>
              <span className="text-xs admin-muted self-center tabular-nums">{fmtCents(o.grand_total, o.currency)}</span>
              <span className="text-xs admin-faint self-center">{fmtDate(o.placed_at)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
