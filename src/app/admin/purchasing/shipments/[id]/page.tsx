"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SHIPMENT_TRANSITIONS, COST_KINDS, COST_KIND_LABELS, type ShipmentStatus } from "@/lib/hardware/ops";
import { StatusBadge, SHIPMENT_STATUS_COLOR } from "@/components/admin/hw-status";

interface ShipLine {
  id: string; po_line_id: string; qty: number;
  hw_po_lines: {
    id: string; po_id: string; qty_ordered: number; qty_received: number; unit_cost: number | null;
    hw_purchase_orders: { id: string; po_number: string; currency: string } | null;
    hw_variants: { id: string; name: string; sku: string; weight_g: number | null; box_l_mm: number | null; box_w_mm: number | null; box_h_mm: number | null; hw_products: { id: string; name: string } | null } | null;
  } | null;
}
interface CostRow {
  id: string; kind: string; amount: number; currency: string; fx_rate: number;
  is_estimate: boolean; invoice_ref: string | null; allocation_basis: string;
}
interface ShipmentDetail {
  id: string; reference: string; mode: string; status: ShipmentStatus; incoterm: string | null;
  container_no: string | null; carrier: string | null; forwarder: string | null;
  etd: string | null; eta: string | null; ata: string | null; notes: string | null;
  lines: ShipLine[]; costs: CostRow[];
}
interface OpenPoLine {
  id: string; qty_ordered: number; qty_unassigned: number; unit_cost: number | null;
  hw_purchase_orders: { po_number: string; currency: string } | null;
  hw_variants: { name: string; sku: string; hw_products: { name: string } | null } | null;
}
interface PreviewRow { inbound_line_id: string; sku: string; name: string; qty: number; unit_base_eur: number; unit_allocated_eur: number; unit_landed_eur: number }

const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
const labelClass = "block text-xs font-medium admin-muted mb-1";

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
}

export default function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [s, setS] = useState<ShipmentDetail | null>(null);
  const [openLines, setOpenLines] = useState<OpenPoLine[]>([]);
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [addLine, setAddLine] = useState({ po_line_id: "", qty: "" });
  const [newCost, setNewCost] = useState({ kind: "freight", amount: "", currency: "EUR", invoice_ref: "", is_estimate: true });
  const [fxRates, setFxRates] = useState<Record<string, string>>({});
  const [targetLoc, setTargetLoc] = useState("HQ");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [booking, setBooking] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/admin/inbound/${id}`).then((r) => r.json()).then((d) => {
      setS(d);
      setMeta({
        reference: d.reference ?? "", mode: d.mode ?? "sea", incoterm: d.incoterm ?? "",
        container_no: d.container_no ?? "", carrier: d.carrier ?? "", forwarder: d.forwarder ?? "",
        etd: d.etd ?? "", eta: d.eta ?? "", ata: d.ata ?? "", notes: d.notes ?? "",
      });
      setPreview(null);
    });
    fetch(`/api/admin/inbound/${id}/lines`).then((r) => r.json()).then((d) => setOpenLines(Array.isArray(d) ? d : []));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function saveMeta() {
    const res = await fetch(`/api/admin/inbound/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta),
    });
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  }

  async function transition(to: ShipmentStatus) {
    const res = await fetch(`/api/admin/inbound/${id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to }),
    });
    if (!res.ok) alert((await res.json()).error || "Transition failed");
    load();
  }

  async function handleAddLine() {
    if (!addLine.po_line_id || !addLine.qty) return;
    const res = await fetch(`/api/admin/inbound/${id}/lines`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(addLine),
    });
    if (!res.ok) alert((await res.json()).error || "Could not add");
    setAddLine({ po_line_id: "", qty: "" });
    load();
  }

  async function removeLine(lineId: string) {
    const res = await fetch(`/api/admin/inbound/${id}/lines/${lineId}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json()).error || "Could not remove");
    load();
  }

  async function addCost() {
    if (!newCost.amount) return;
    await fetch(`/api/admin/inbound/${id}/costs`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newCost),
    });
    setNewCost({ kind: "freight", amount: "", currency: "EUR", invoice_ref: "", is_estimate: true });
    load();
  }

  async function patchCost(costId: string, patch: Record<string, unknown>) {
    await fetch(`/api/admin/inbound/${id}/costs/${costId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    load();
  }

  async function deleteCost(costId: string) {
    await fetch(`/api/admin/inbound/${id}/costs/${costId}`, { method: "DELETE" });
    load();
  }

  function fxPayload() {
    const out: Record<string, number> = {};
    for (const [c, v] of Object.entries(fxRates)) if (Number(v)) out[c] = Number(v);
    return out;
  }

  async function runPreview() {
    const res = await fetch(`/api/admin/inbound/${id}/receive`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preview: true, fx_rates: fxPayload() }),
    });
    const d = await res.json();
    if (!res.ok) { alert(d.error || "Preview failed"); return; }
    setPreview(d.preview);
  }

  async function book() {
    if (!confirm(`Book this shipment into ${targetLoc}? Stock moves and landed costs are written — this is final.`)) return;
    setBooking(true);
    const res = await fetch(`/api/admin/inbound/${id}/receive`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_code: targetLoc, fx_rates: fxPayload() }),
    });
    setBooking(false);
    if (!res.ok) alert((await res.json()).error || "Receive failed");
    load();
  }

  if (!s) return <div className="flex items-center justify-center h-64"><p className="text-sm admin-faint">Loading…</p></div>;

  const nextStates = (SHIPMENT_TRANSITIONS[s.status] ?? []).filter((t) => t !== "received");
  const editable = s.status === "booked";
  const receivable = !["received", "closed"].includes(s.status);
  const currencies = [...new Set(s.lines.map((l) => l.hw_po_lines?.hw_purchase_orders?.currency).filter((c): c is string => !!c && c !== "EUR"))];
  const costTotalEur = s.costs.reduce((a, c) => a + Number(c.amount) * (Number(c.fx_rate) || 1), 0);
  const unitCount = s.lines.reduce((a, l) => a + l.qty, 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => router.push("/admin/purchasing?tab=inbound")} className="text-xs admin-faint hover:text-[var(--admin-accent)] mb-2">← Inbound shipments</button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold admin-heading">{s.reference}</h1>
            <StatusBadge value={s.status} colors={SHIPMENT_STATUS_COLOR} />
            <span className="text-xs admin-faint">{unitCount} units · €{Math.round(costTotalEur).toLocaleString()} costs</span>
          </div>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-green-400">Saved ✓</span>}
            {nextStates.map((t) => (
              <button key={t} onClick={() => transition(t)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] hover:bg-[var(--admin-accent)]/90 transition-colors">
                → {t.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
        {s.status === "booked" && (
          <p className="text-xs admin-faint mt-2">Marking <b>in transit</b> is the FOB moment — the goods become NP7 stock (on the water) and the POs flip to shipped.</p>
        )}
      </div>

      {/* Meta */}
      <div className="rounded-xl p-5 mb-6" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div><label className={labelClass}>Mode</label>
            <select className={inputClass} value={meta.mode} onChange={(e) => setMeta({ ...meta, mode: e.target.value })} onBlur={saveMeta}>
              {["sea", "air", "rail", "road"].map((m) => <option key={m}>{m}</option>)}
            </select></div>
          <div><label className={labelClass}>Incoterm</label>
            <select className={inputClass} value={meta.incoterm} onChange={(e) => setMeta({ ...meta, incoterm: e.target.value })} onBlur={saveMeta}>
              <option value="">—</option>{["FOB", "EXW", "CIF", "DAP", "DDP"].map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div><label className={labelClass}>Container #</label>
            <input className={inputClass} value={meta.container_no} onChange={(e) => setMeta({ ...meta, container_no: e.target.value })} onBlur={saveMeta} /></div>
          <div><label className={labelClass}>Carrier</label>
            <input className={inputClass} value={meta.carrier} onChange={(e) => setMeta({ ...meta, carrier: e.target.value })} onBlur={saveMeta} /></div>
          <div><label className={labelClass}>Forwarder</label>
            <input className={inputClass} value={meta.forwarder} onChange={(e) => setMeta({ ...meta, forwarder: e.target.value })} onBlur={saveMeta} /></div>
          <div><label className={labelClass}>ETD</label>
            <input type="date" className={inputClass} value={meta.etd} onChange={(e) => setMeta({ ...meta, etd: e.target.value })} onBlur={saveMeta} /></div>
          <div><label className={labelClass}>ETA</label>
            <input type="date" className={inputClass} value={meta.eta} onChange={(e) => setMeta({ ...meta, eta: e.target.value })} onBlur={saveMeta} /></div>
          <div><label className={labelClass}>ATA (arrived)</label>
            <input type="date" className={inputClass} value={meta.ata} onChange={(e) => setMeta({ ...meta, ata: e.target.value })} onBlur={saveMeta} /></div>
          <div className="col-span-2"><label className={labelClass}>Notes</label>
            <input className={inputClass} value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} onBlur={saveMeta} /></div>
        </div>
      </div>

      {/* Lines */}
      <h2 className="text-sm font-bold admin-heading mb-3">What&apos;s in the box · {s.lines.length} line{s.lines.length !== 1 ? "s" : ""}</h2>
      {editable && (
        <div className="mb-4 p-4 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <div className="col-span-2"><label className={labelClass}>Open PO line</label>
              <select className={inputClass} value={addLine.po_line_id} onChange={(e) => setAddLine({ ...addLine, po_line_id: e.target.value })}>
                <option value="">Pick a PO line…</option>
                {openLines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.hw_purchase_orders?.po_number} · {l.hw_variants?.hw_products?.name} {l.hw_variants?.name} ({l.qty_unassigned} open)
                  </option>
                ))}
              </select></div>
            <div><label className={labelClass}>Qty</label>
              <input type="number" className={inputClass} value={addLine.qty} onChange={(e) => setAddLine({ ...addLine, qty: e.target.value })} /></div>
            <button onClick={handleAddLine} disabled={!addLine.po_line_id || !addLine.qty}
              className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">Add to shipment</button>
          </div>
          {openLines.length === 0 && <p className="text-xs admin-faint mt-3">No open PO lines — issue a <Link href="/admin/purchasing" className="text-[var(--admin-accent)] hover:underline">purchase order</Link> first.</p>}
        </div>
      )}
      {s.lines.length === 0 ? (
        <div className="py-10 text-center rounded-xl mb-6" style={{ border: "1px dashed var(--admin-border)" }}>
          <p className="text-sm admin-faint">Nothing assigned yet.</p>
        </div>
      ) : (
        <div className="rounded-xl admin-tablecard overflow-x-auto mb-6" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid grid-cols-[110px_1fr_80px_110px_40px] gap-3 px-5 py-3 admin-surface min-w-[560px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            {["PO", "Variant", "Qty", "Unit cost", ""].map((h, i) => (
              <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>
          {s.lines.map((l) => {
            const pl = l.hw_po_lines;
            return (
              <div key={l.id} className="grid grid-cols-[110px_1fr_80px_110px_40px] gap-3 px-5 py-3 min-w-[560px] group" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <Link href={`/admin/purchasing/${pl?.po_id}`} className="text-xs font-mono self-center text-[var(--admin-accent)] hover:underline">{pl?.hw_purchase_orders?.po_number}</Link>
                <span className="text-sm admin-heading self-center truncate">
                  {pl?.hw_variants?.hw_products?.name} · {pl?.hw_variants?.name}
                  <span className="admin-faint text-xs ml-2 font-mono">{pl?.hw_variants?.sku}</span>
                </span>
                <span className="text-xs admin-muted self-center">{l.qty}</span>
                <span className="text-xs admin-muted self-center">{pl?.unit_cost != null ? `${pl.hw_purchase_orders?.currency} ${Number(pl.unit_cost).toLocaleString()}` : "—"}</span>
                {editable ? (
                  <button onClick={() => removeLine(l.id)} className="self-center opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all" title="Remove">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                ) : <span />}
              </div>
            );
          })}
        </div>
      )}

      {/* Costs worksheet */}
      <h2 className="text-sm font-bold admin-heading mb-3">Landed-cost worksheet · €{Math.round(costTotalEur).toLocaleString()}</h2>
      <div className="mb-4 p-4 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <div><label className={labelClass}>Kind</label>
            <select className={inputClass} value={newCost.kind} onChange={(e) => setNewCost({ ...newCost, kind: e.target.value })}>
              {COST_KINDS.map((k) => <option key={k} value={k}>{COST_KIND_LABELS[k]}</option>)}
            </select></div>
          <div><label className={labelClass}>Amount</label>
            <input type="number" className={inputClass} value={newCost.amount} onChange={(e) => setNewCost({ ...newCost, amount: e.target.value })} /></div>
          <div><label className={labelClass}>Currency</label>
            <select className={inputClass} value={newCost.currency} onChange={(e) => setNewCost({ ...newCost, currency: e.target.value })}>
              {["EUR", "USD"].map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div><label className={labelClass}>Invoice ref</label>
            <input className={inputClass} value={newCost.invoice_ref} onChange={(e) => setNewCost({ ...newCost, invoice_ref: e.target.value })} /></div>
          <button onClick={addCost} disabled={!newCost.amount}
            className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">Add cost</button>
        </div>
        <p className="text-xs admin-faint mt-3">Freight spreads by <b>volume</b>, duty &amp; insurance by <b>value</b> — set per row. Estimates are fine; true them up when the invoices land.</p>
      </div>
      {s.costs.length > 0 && (
        <div className="rounded-xl admin-tablecard overflow-x-auto mb-6" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid grid-cols-[120px_110px_90px_110px_100px_1fr_40px] gap-3 px-5 py-3 admin-surface min-w-[680px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            {["Kind", "Amount", "FX→EUR", "Spread by", "Status", "Invoice ref", ""].map((h, i) => (
              <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>
          {s.costs.map((c) => (
            <div key={c.id} className="grid grid-cols-[120px_110px_90px_110px_100px_1fr_40px] gap-3 px-5 py-3 min-w-[680px] group" style={{ borderBottom: "1px solid var(--admin-border)" }}>
              <span className="text-sm admin-heading self-center">{COST_KIND_LABELS[c.kind] ?? c.kind}</span>
              <span className="text-xs admin-muted self-center">{c.currency} {Number(c.amount).toLocaleString()}</span>
              <input type="number" step="0.0001" className={`${inputClass} text-xs`} defaultValue={c.fx_rate}
                onBlur={(e) => Number(e.target.value) !== c.fx_rate && patchCost(c.id, { fx_rate: e.target.value })} />
              <select className={`${inputClass} text-xs`} value={c.allocation_basis} onChange={(e) => patchCost(c.id, { allocation_basis: e.target.value })}>
                {["value", "volume", "weight", "qty"].map((b) => <option key={b}>{b}</option>)}
              </select>
              <button onClick={() => patchCost(c.id, { is_estimate: !c.is_estimate })}
                className={`self-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${c.is_estimate ? "bg-amber-500/15 text-amber-500" : "bg-green-500/15 text-green-400"}`}>
                {c.is_estimate ? "estimate" : "actual"}
              </button>
              <input className={`${inputClass} text-xs`} defaultValue={c.invoice_ref ?? ""} placeholder="—"
                onBlur={(e) => e.target.value !== (c.invoice_ref ?? "") && patchCost(c.id, { invoice_ref: e.target.value })} />
              <button onClick={() => deleteCost(c.id)} className="self-center opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all" title="Remove">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Receive */}
      {receivable && s.lines.length > 0 && (
        <div className="rounded-xl p-5" style={{ border: "1px solid var(--admin-accent-weak, var(--admin-border))", backgroundColor: "var(--admin-surface)" }}>
          <h2 className="text-sm font-bold admin-heading mb-3">Receive into stock</h2>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            {currencies.map((c) => (
              <div key={c}><label className={labelClass}>FX {c} → EUR</label>
                <input type="number" step="0.0001" className={`${inputClass} max-w-[110px]`} value={fxRates[c] ?? ""}
                  placeholder="e.g. 0.92" onChange={(e) => setFxRates({ ...fxRates, [c]: e.target.value })} /></div>
            ))}
            <div><label className={labelClass}>Into location</label>
              <select className={inputClass} value={targetLoc} onChange={(e) => setTargetLoc(e.target.value)}>
                <option value="HQ">Own storage (HQ)</option>
                <option value="3PL">3PL warehouse</option>
              </select></div>
            <button onClick={runPreview} className="px-4 py-2 text-sm font-bold rounded-lg admin-muted transition-colors" style={{ border: "1px solid var(--admin-border)" }}>
              Preview landed cost
            </button>
            <button onClick={book} disabled={booking}
              className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
              {booking ? "Booking…" : "Receive shipment"}
            </button>
          </div>
          {preview && (
            <div className="rounded-xl admin-tablecard overflow-x-auto" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_70px_110px_110px_120px] gap-3 px-5 py-3 admin-surface min-w-[560px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                {["Variant", "Qty", "Base €/unit", "+ Costs €/unit", "Landed €/unit"].map((h, i) => (
                  <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
                ))}
              </div>
              {preview.map((p) => (
                <div key={p.inbound_line_id} className="grid grid-cols-[1fr_70px_110px_110px_120px] gap-3 px-5 py-2.5 min-w-[560px] text-xs" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                  <span className="admin-heading truncate">{p.name} <span className="admin-faint font-mono">{p.sku}</span></span>
                  <span className="admin-muted">{p.qty}</span>
                  <span className="admin-muted">€{p.unit_base_eur.toFixed(2)}</span>
                  <span className="admin-muted">€{p.unit_allocated_eur.toFixed(2)}</span>
                  <span className="font-bold text-[var(--admin-accent)]">€{p.unit_landed_eur.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
