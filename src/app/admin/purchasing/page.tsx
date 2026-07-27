"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PO_STATUS_LABELS, type PoStatus } from "@/lib/hardware/ops";
import { StatusBadge, PO_STATUS_COLOR, SHIPMENT_STATUS_COLOR } from "@/components/admin/hw-status";

interface PoRow {
  id: string; po_number: string; status: PoStatus; currency: string;
  order_date: string | null; expected_receipt_date: string | null;
  hw_suppliers: { id: string; name: string } | null;
  value: number; units: number; received: number;
}
interface ShipmentRow {
  id: string; reference: string; mode: string; status: string;
  container_no: string | null; etd: string | null; eta: string | null;
  units: number; costs_eur: number;
}
interface SupplierOpt { id: string; name: string }

const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
const labelClass = "block text-xs font-medium admin-muted mb-1";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function PurchasingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "inbound" ? "inbound" : "pos";

  const [pos, setPos] = useState<PoRow[]>([]);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newPo, setNewPo] = useState({ supplier_id: "", expected_receipt_date: "" });
  const [newShipment, setNewShipment] = useState({ reference: "", mode: "sea", eta: "" });

  function load() {
    Promise.all([
      fetch(`/api/admin/purchasing${statusFilter ? `?status=${statusFilter}` : ""}`).then((r) => r.json()),
      fetch("/api/admin/inbound").then((r) => r.json()),
      fetch("/api/admin/suppliers").then((r) => r.json()),
    ]).then(([p, sh, su]) => {
      setPos(Array.isArray(p) ? p : []);
      setShipments(Array.isArray(sh) ? sh : []);
      setSuppliers(Array.isArray(su) ? su : []);
      setLoading(false);
    });
  }
  useEffect(() => { load(); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function setTab(t: string) {
    router.replace(`/admin/purchasing${t === "inbound" ? "?tab=inbound" : ""}`);
  }

  async function createPo() {
    if (!newPo.supplier_id) return;
    const res = await fetch("/api/admin/purchasing", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newPo),
    });
    if (res.ok) {
      const d = await res.json();
      router.push(`/admin/purchasing/${d.id}`);
    }
  }

  async function createShipment() {
    if (!newShipment.reference) return;
    const res = await fetch("/api/admin/inbound", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newShipment),
    });
    if (res.ok) {
      const d = await res.json();
      router.push(`/admin/purchasing/shipments/${d.id}`);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Purchasing</h1>
          <p className="text-sm admin-muted">Factory orders, production tracking, containers &amp; landed cost.</p>
        </div>
        <button onClick={() => setShowNew(!showNew)}
          className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
          {tab === "inbound" ? "New Shipment" : "New PO"}
        </button>
      </div>

      {/* Tab pills */}
      <div className="flex gap-2 mb-5">
        {[{ k: "pos", label: `Purchase orders (${pos.length})` }, { k: "inbound", label: `Inbound shipments (${shipments.length})` }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${tab === t.k ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]" : "admin-muted"}`}
            style={tab === t.k ? {} : { border: "1px solid var(--admin-border)" }}>
            {t.label}
          </button>
        ))}
        {tab === "pos" && (
          <select className={`${inputClass} max-w-[180px] ml-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(PO_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
      </div>

      {showNew && tab === "pos" && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">New Purchase Order</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="col-span-2">
              <label className={labelClass}>Supplier *</label>
              <select className={inputClass} value={newPo.supplier_id} onChange={(e) => setNewPo({ ...newPo, supplier_id: e.target.value })}>
                <option value="">Pick a supplier…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Expected receipt</label>
              <input type="date" className={inputClass} value={newPo.expected_receipt_date} onChange={(e) => setNewPo({ ...newPo, expected_receipt_date: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createPo} disabled={!newPo.supplier_id}
              className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">Create draft</button>
            <button onClick={() => setShowNew(false)} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
          {suppliers.length === 0 && <p className="text-xs text-amber-500 mt-3">No suppliers yet — <Link href="/admin/suppliers" className="underline">add one first</Link>.</p>}
        </div>
      )}

      {showNew && tab === "inbound" && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">New Inbound Shipment</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="col-span-2">
              <label className={labelClass}>Reference *</label>
              <input className={inputClass} value={newShipment.reference} onChange={(e) => setNewShipment({ ...newShipment, reference: e.target.value })} placeholder="Forwarder booking / container ref" autoFocus />
            </div>
            <div>
              <label className={labelClass}>Mode</label>
              <select className={inputClass} value={newShipment.mode} onChange={(e) => setNewShipment({ ...newShipment, mode: e.target.value })}>
                {["sea", "air", "rail", "road"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>ETA</label>
              <input type="date" className={inputClass} value={newShipment.eta} onChange={(e) => setNewShipment({ ...newShipment, eta: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={createShipment} disabled={!newShipment.reference}
              className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">Create</button>
            <button onClick={() => setShowNew(false)} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : tab === "pos" ? (
        pos.length === 0 ? (
          <div className="py-16 text-center"><p className="text-sm admin-faint">No purchase orders yet.</p></div>
        ) : (
          <div className="rounded-xl admin-tablecard overflow-x-auto" style={{ border: "1px solid var(--admin-border)" }}>
            <div className="grid grid-cols-[110px_1fr_130px_90px_90px_100px_80px] gap-3 px-5 py-3 admin-surface min-w-[680px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
              {["PO", "Supplier", "Status", "Ordered", "Expected", "Value", "Units"].map((h, i) => (
                <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
              ))}
            </div>
            {pos.map((p) => (
              <Link key={p.id} href={`/admin/purchasing/${p.id}`}
                className="grid grid-cols-[110px_1fr_130px_90px_90px_100px_80px] gap-3 px-5 py-3 min-w-[680px] transition-colors hover:bg-[var(--admin-surface-hover)]"
                style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-sm font-medium admin-heading self-center font-mono">{p.po_number}</span>
                <span className="text-xs admin-muted self-center truncate">{p.hw_suppliers?.name ?? "—"}</span>
                <span className="self-center"><StatusBadge value={p.status} colors={PO_STATUS_COLOR} /></span>
                <span className="text-xs admin-muted self-center">{fmtDate(p.order_date)}</span>
                <span className="text-xs admin-muted self-center">{fmtDate(p.expected_receipt_date)}</span>
                <span className="text-xs admin-muted self-center">{p.currency} {Math.round(p.value).toLocaleString()}</span>
                <span className="text-xs admin-muted self-center">{p.received}/{p.units}</span>
              </Link>
            ))}
          </div>
        )
      ) : shipments.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No inbound shipments yet.</p></div>
      ) : (
        <div className="rounded-xl admin-tablecard overflow-x-auto" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid grid-cols-[1fr_70px_110px_90px_90px_80px_110px] gap-3 px-5 py-3 admin-surface min-w-[640px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            {["Reference", "Mode", "Status", "ETD", "ETA", "Units", "Costs €"].map((h, i) => (
              <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>
          {shipments.map((s) => (
            <Link key={s.id} href={`/admin/purchasing/shipments/${s.id}`}
              className="grid grid-cols-[1fr_70px_110px_90px_90px_80px_110px] gap-3 px-5 py-3 min-w-[640px] transition-colors hover:bg-[var(--admin-surface-hover)]"
              style={{ borderBottom: "1px solid var(--admin-border)" }}>
              <span className="text-sm font-medium admin-heading self-center truncate">{s.reference}{s.container_no ? <span className="admin-faint text-xs ml-2">{s.container_no}</span> : null}</span>
              <span className="text-xs admin-muted self-center">{s.mode}</span>
              <span className="self-center"><StatusBadge value={s.status} colors={SHIPMENT_STATUS_COLOR} /></span>
              <span className="text-xs admin-muted self-center">{fmtDate(s.etd)}</span>
              <span className="text-xs admin-muted self-center">{fmtDate(s.eta)}</span>
              <span className="text-xs admin-muted self-center">{s.units}</span>
              <span className="text-xs admin-muted self-center">€{Math.round(s.costs_eur).toLocaleString()}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PurchasingPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm admin-faint">Loading…</div>}>
      <PurchasingInner />
    </Suspense>
  );
}
