"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  PO_TRANSITIONS, PO_STATUS_LABELS, QC_TYPES, QC_TYPE_LABELS, MILESTONE_KINDS,
  type PoStatus,
} from "@/lib/hardware/ops";
import { StatusBadge, PO_STATUS_COLOR } from "@/components/admin/hw-status";

interface VariantRef { id: string; name: string; sku: string; hw_products: { id: string; name: string } | null }
interface Line {
  id: string; variant_id: string; qty_ordered: number; unit_cost: number | null;
  qty_shipped: number; qty_received: number; hw_variants: VariantRef | null;
}
interface Payment {
  id: string; kind: string; planned_amount: number | null; planned_date: string | null;
  paid_amount: number | null; paid_date: string | null; fx_rate: number | null;
  reference: string | null; notes: string | null;
}
interface Milestone { id: string; kind: string; label: string | null; planned_date: string | null; actual_date: string | null; note: string | null }
interface Qc {
  id: string; type: string; inspector: string | null; agency: string | null; date: string | null;
  result: string | null; report_url: string | null; blocks_balance_payment: boolean; notes: string | null;
}
interface Ev { id: string; from_status: string | null; to_status: string; actor: string | null; note: string | null; created_at: string }
interface Receipt { id: string; po_line_id: string; qty: number; unit_landed_cost: number | null; received_at: string }
interface PoDetail {
  id: string; po_number: string; status: PoStatus; currency: string; incoterm: string | null;
  order_date: string | null; ex_factory_planned: string | null; ex_factory_actual: string | null;
  expected_receipt_date: string | null; payment_terms: string | null; notes: string | null;
  hw_suppliers: { id: string; name: string; currency: string } | null;
  lines: Line[]; payments: Payment[]; milestones: Milestone[]; qc: Qc[]; events: Ev[]; receipts: Receipt[];
}
interface VariantOption { id: string; sku: string; name: string; hw_products: { name: string } | null }

const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
const labelClass = "block text-xs font-medium admin-muted mb-1";
const TABS = ["lines", "payments", "milestones", "qc", "receive", "history"] as const;
type Tab = (typeof TABS)[number];

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
}

function PoDetailInner({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (TABS.includes(searchParams.get("tab") as Tab) ? searchParams.get("tab") : "lines") as Tab;

  const [po, setPo] = useState<PoDetail | null>(null);
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [newLine, setNewLine] = useState({ variant_id: "", qty_ordered: "", unit_cost: "" });
  const [newPayment, setNewPayment] = useState({ kind: "deposit", planned_amount: "", planned_date: "" });
  const [newMilestone, setNewMilestone] = useState({ kind: "production_start", planned_date: "" });
  const [newQc, setNewQc] = useState({ type: "PSI", agency: "", date: "" });
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [receiveFx, setReceiveFx] = useState("1");

  const load = useCallback(() => {
    fetch(`/api/admin/purchasing/${id}`).then((r) => r.json()).then((d) => {
      setPo(d);
      setMeta({
        incoterm: d.incoterm ?? "", order_date: d.order_date ?? "",
        ex_factory_planned: d.ex_factory_planned ?? "", expected_receipt_date: d.expected_receipt_date ?? "",
        payment_terms: d.payment_terms ?? "", notes: d.notes ?? "",
      });
    });
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/admin/variants").then((r) => r.json()).then((d) => setVariants(Array.isArray(d) ? d : []));
  }, []);

  function setTab(t: Tab) {
    router.replace(`/admin/purchasing/${id}?tab=${t}`);
  }

  async function saveMeta() {
    const res = await fetch(`/api/admin/purchasing/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta),
    });
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); load(); }
  }

  async function transition(to: PoStatus) {
    const note = to === "cancelled" ? prompt("Why cancel this PO?") ?? undefined : undefined;
    if (to === "cancelled" && note === undefined) return;
    const res = await fetch(`/api/admin/purchasing/${id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, note }),
    });
    if (!res.ok) alert((await res.json()).error || "Transition failed");
    load();
  }

  async function addLine() {
    if (!newLine.variant_id || !newLine.qty_ordered) return;
    const res = await fetch(`/api/admin/purchasing/${id}/lines`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newLine),
    });
    if (!res.ok) alert((await res.json()).error || "Could not add line");
    setNewLine({ variant_id: "", qty_ordered: "", unit_cost: "" });
    load();
  }

  async function patchLine(lineId: string, patch: Record<string, unknown>) {
    await fetch(`/api/admin/purchasing/${id}/lines/${lineId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    load();
  }

  async function deleteLine(lineId: string) {
    if (!confirm("Remove this line?")) return;
    const res = await fetch(`/api/admin/purchasing/${id}/lines/${lineId}`, { method: "DELETE" });
    if (!res.ok) alert((await res.json()).error || "Could not delete");
    load();
  }

  async function addPayment() {
    const res = await fetch(`/api/admin/purchasing/${id}/payments`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newPayment),
    });
    if (!res.ok) alert((await res.json()).error || "Could not add payment");
    setNewPayment({ kind: "deposit", planned_amount: "", planned_date: "" });
    load();
  }

  async function markPaid(p: Payment) {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`/api/admin/purchasing/${id}/payments/${p.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid_date: today, paid_amount: p.paid_amount ?? p.planned_amount }),
    });
    if (res.status === 409) {
      const d = await res.json();
      if (d.gate === "psi" && confirm(`${d.error}\n\nOverride the PSI gate anyway?`)) {
        await fetch(`/api/admin/purchasing/${id}/payments/${p.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paid_date: today, paid_amount: p.paid_amount ?? p.planned_amount, override: true }),
        });
      }
    } else if (!res.ok) alert((await res.json()).error || "Could not mark paid");
    load();
  }

  async function deletePayment(payId: string) {
    if (!confirm("Remove this payment row?")) return;
    await fetch(`/api/admin/purchasing/${id}/payments/${payId}`, { method: "DELETE" });
    load();
  }

  async function addMilestone() {
    await fetch(`/api/admin/purchasing/${id}/milestones`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newMilestone),
    });
    setNewMilestone({ kind: "production_start", planned_date: "" });
    load();
  }

  async function patchMilestone(mid: string, patch: Record<string, unknown>) {
    await fetch(`/api/admin/purchasing/${id}/milestones/${mid}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    load();
  }

  async function deleteMilestone(mid: string) {
    await fetch(`/api/admin/purchasing/${id}/milestones/${mid}`, { method: "DELETE" });
    load();
  }

  async function addQc() {
    await fetch(`/api/admin/purchasing/${id}/qc`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newQc),
    });
    setNewQc({ type: "PSI", agency: "", date: "" });
    load();
  }

  async function patchQc(qid: string, patch: Record<string, unknown>) {
    await fetch(`/api/admin/purchasing/${id}/qc/${qid}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    load();
  }

  async function deleteQc(qid: string) {
    if (!confirm("Remove this inspection?")) return;
    await fetch(`/api/admin/purchasing/${id}/qc/${qid}`, { method: "DELETE" });
    load();
  }

  async function receiveDirect() {
    const lines = Object.entries(receiveQty)
      .map(([po_line_id, qty]) => ({ po_line_id, qty: Number(qty) }))
      .filter((l) => l.qty > 0);
    if (!lines.length) return;
    const res = await fetch(`/api/admin/purchasing/${id}/receive`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, fx_rate: Number(receiveFx) || 1 }),
    });
    if (!res.ok) alert((await res.json()).error || "Receive failed");
    setReceiveQty({});
    load();
  }

  if (!po) return <div className="flex items-center justify-center h-64"><p className="text-sm admin-faint">Loading…</p></div>;

  const nextStates = (PO_TRANSITIONS[po.status] ?? []).filter((s) => !["partially_received", "received"].includes(s) || po.status === "shipped");
  const orderValue = po.lines.reduce((a, l) => a + (Number(l.unit_cost) || 0) * l.qty_ordered, 0);
  const psiBlocking = po.qc.some((q) => q.type === "PSI" && q.blocks_balance_payment && q.result !== "pass" && q.result !== "pass_with_notes");

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => router.push("/admin/purchasing")} className="text-xs admin-faint hover:text-[var(--admin-accent)] mb-2">← Purchasing</button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold admin-heading font-mono">{po.po_number}</h1>
            <StatusBadge value={po.status} colors={PO_STATUS_COLOR} />
            <Link href={`/admin/suppliers/${po.hw_suppliers?.id}`} className="text-sm admin-muted hover:text-[var(--admin-accent)]">
              {po.hw_suppliers?.name}
            </Link>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {saved && <span className="text-xs text-green-400">Saved ✓</span>}
            {nextStates.map((s) => (
              <button key={s} onClick={() => transition(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${s === "cancelled" ? "text-red-400" : "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] hover:bg-[var(--admin-accent)]/90"}`}
                style={s === "cancelled" ? { border: "1px solid var(--admin-border)" } : {}}>
                {s === "cancelled" ? "Cancel PO" : `→ ${PO_STATUS_LABELS[s]}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Meta card */}
      <div className="rounded-xl p-5 mb-6" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
          <div><label className={labelClass}>Order date</label>
            <input type="date" className={inputClass} value={meta.order_date} onChange={(e) => setMeta({ ...meta, order_date: e.target.value })} onBlur={saveMeta} /></div>
          <div><label className={labelClass}>Ex-factory planned</label>
            <input type="date" className={inputClass} value={meta.ex_factory_planned} onChange={(e) => setMeta({ ...meta, ex_factory_planned: e.target.value })} onBlur={saveMeta} /></div>
          <div><label className={labelClass}>Expected receipt</label>
            <input type="date" className={inputClass} value={meta.expected_receipt_date} onChange={(e) => setMeta({ ...meta, expected_receipt_date: e.target.value })} onBlur={saveMeta} /></div>
          <div><label className={labelClass}>Incoterm</label>
            <select className={inputClass} value={meta.incoterm} onChange={(e) => setMeta({ ...meta, incoterm: e.target.value })} onBlur={saveMeta}>
              <option value="">—</option>{["FOB", "EXW", "CIF", "DAP", "DDP"].map((c) => <option key={c}>{c}</option>)}
            </select></div>
          <div><label className={labelClass}>Payment terms</label>
            <input className={inputClass} value={meta.payment_terms} onChange={(e) => setMeta({ ...meta, payment_terms: e.target.value })} onBlur={saveMeta} placeholder="30/70 T/T" /></div>
          <div><label className={labelClass}>Order value</label>
            <p className="text-sm font-bold admin-heading pt-2">{po.currency} {Math.round(orderValue).toLocaleString()}</p></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${tab === t ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]" : "admin-muted"}`}
            style={tab === t ? {} : { border: "1px solid var(--admin-border)" }}>
            {t === "qc" ? "QC" : t}
            {t === "qc" && psiBlocking && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" />}
          </button>
        ))}
      </div>

      {/* Lines */}
      {tab === "lines" && (
        <div>
          <div className="mb-4 p-4 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <div className="col-span-2"><label className={labelClass}>Variant</label>
                <select className={inputClass} value={newLine.variant_id} onChange={(e) => setNewLine({ ...newLine, variant_id: e.target.value })}>
                  <option value="">Add a variant…</option>
                  {variants.map((v) => <option key={v.id} value={v.id}>{v.hw_products?.name} · {v.name} ({v.sku})</option>)}
                </select></div>
              <div><label className={labelClass}>Qty</label>
                <input type="number" className={inputClass} value={newLine.qty_ordered} onChange={(e) => setNewLine({ ...newLine, qty_ordered: e.target.value })} /></div>
              <div><label className={labelClass}>Unit cost ({po.currency}, blank = from catalog)</label>
                <div className="flex gap-2">
                  <input type="number" className={inputClass} value={newLine.unit_cost} onChange={(e) => setNewLine({ ...newLine, unit_cost: e.target.value })} />
                  <button onClick={addLine} disabled={!newLine.variant_id || !newLine.qty_ordered}
                    className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors shrink-0">Add</button>
                </div></div>
            </div>
          </div>
          {po.lines.length === 0 ? (
            <div className="py-12 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
              <p className="text-sm admin-faint">No lines yet.</p>
            </div>
          ) : (
            <div className="rounded-xl admin-tablecard overflow-x-auto" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[1fr_90px_100px_90px_90px_40px] gap-3 px-5 py-3 admin-surface min-w-[600px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                {["Variant", "Ordered", `Unit ${po.currency}`, "Shipped", "Received", ""].map((h, i) => (
                  <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
                ))}
              </div>
              {po.lines.map((l) => (
                <div key={l.id} className="grid grid-cols-[1fr_90px_100px_90px_90px_40px] gap-3 px-5 py-3 min-w-[600px] group" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                  <span className="text-sm admin-heading self-center truncate">
                    {l.hw_variants?.hw_products?.name} · {l.hw_variants?.name}
                    <span className="admin-faint text-xs ml-2 font-mono">{l.hw_variants?.sku}</span>
                  </span>
                  <input type="number" className={`${inputClass} text-xs`} defaultValue={l.qty_ordered}
                    onBlur={(e) => Number(e.target.value) !== l.qty_ordered && patchLine(l.id, { qty_ordered: e.target.value })} />
                  <input type="number" className={`${inputClass} text-xs`} defaultValue={l.unit_cost ?? ""}
                    onBlur={(e) => Number(e.target.value) !== l.unit_cost && patchLine(l.id, { unit_cost: e.target.value })} />
                  <span className="text-xs admin-muted self-center">{l.qty_shipped}</span>
                  <span className={`text-xs self-center ${l.qty_received >= l.qty_ordered ? "text-green-400" : "admin-muted"}`}>{l.qty_received}</span>
                  <button onClick={() => deleteLine(l.id)} className="self-center opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all" title="Remove">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payments */}
      {tab === "payments" && (
        <div>
          {psiBlocking && (
            <div className="mb-4 px-4 py-3 rounded-xl text-xs text-amber-500 bg-amber-500/10" style={{ border: "1px solid rgba(245,158,11,0.25)" }}>
              Pre-shipment inspection hasn&apos;t passed — the balance payment is gated until the PSI result is in.
            </div>
          )}
          <div className="mb-4 p-4 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <div><label className={labelClass}>Kind</label>
                <select className={inputClass} value={newPayment.kind} onChange={(e) => setNewPayment({ ...newPayment, kind: e.target.value })}>
                  {["deposit", "balance", "other"].map((k) => <option key={k}>{k}</option>)}
                </select></div>
              <div><label className={labelClass}>Planned amount ({po.currency})</label>
                <input type="number" className={inputClass} value={newPayment.planned_amount} onChange={(e) => setNewPayment({ ...newPayment, planned_amount: e.target.value })} /></div>
              <div><label className={labelClass}>Planned date</label>
                <input type="date" className={inputClass} value={newPayment.planned_date} onChange={(e) => setNewPayment({ ...newPayment, planned_date: e.target.value })} /></div>
              <button onClick={addPayment} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">Plan payment</button>
            </div>
          </div>
          {po.payments.length === 0 ? (
            <div className="py-12 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
              <p className="text-sm admin-faint">No payments planned — typical factory terms are a 30% deposit at order and 70% balance after a passed PSI.</p>
            </div>
          ) : (
            <div className="rounded-xl admin-tablecard overflow-x-auto" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[90px_120px_100px_120px_100px_1fr_40px] gap-3 px-5 py-3 admin-surface min-w-[660px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                {["Kind", "Planned", "Due", "Paid", "Paid on", "Reference / notes", ""].map((h, i) => (
                  <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
                ))}
              </div>
              {po.payments.map((p) => (
                <div key={p.id} className="grid grid-cols-[90px_120px_100px_120px_100px_1fr_40px] gap-3 px-5 py-3 min-w-[660px] group" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                  <span className="text-xs font-bold uppercase self-center admin-heading">{p.kind}</span>
                  <span className="text-xs admin-muted self-center">{p.planned_amount != null ? `${po.currency} ${Number(p.planned_amount).toLocaleString()}` : "—"}</span>
                  <span className="text-xs admin-muted self-center">{fmtDate(p.planned_date)}</span>
                  <span className={`text-xs self-center ${p.paid_date ? "text-green-400" : "admin-faint"}`}>
                    {p.paid_date ? `${po.currency} ${Number(p.paid_amount ?? 0).toLocaleString()}` : (
                      <button onClick={() => markPaid(p)} className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-[var(--admin-accent-weak)] text-[var(--admin-accent)]">Mark paid</button>
                    )}
                  </span>
                  <span className="text-xs admin-muted self-center">{fmtDate(p.paid_date)}</span>
                  <span className="text-xs admin-faint self-center truncate">{[p.reference, p.notes].filter(Boolean).join(" · ") || "—"}</span>
                  <button onClick={() => deletePayment(p.id)} className="self-center opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all" title="Remove">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Milestones */}
      {tab === "milestones" && (
        <div>
          <div className="mb-4 p-4 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
              <div><label className={labelClass}>Milestone</label>
                <select className={inputClass} value={newMilestone.kind} onChange={(e) => setNewMilestone({ ...newMilestone, kind: e.target.value })}>
                  {MILESTONE_KINDS.map((m) => <option key={m.kind} value={m.kind}>{m.label}</option>)}
                </select></div>
              <div><label className={labelClass}>Planned date</label>
                <input type="date" className={inputClass} value={newMilestone.planned_date} onChange={(e) => setNewMilestone({ ...newMilestone, planned_date: e.target.value })} /></div>
              <button onClick={addMilestone} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">Add</button>
            </div>
          </div>
          {po.milestones.length === 0 ? (
            <div className="py-12 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
              <p className="text-sm admin-faint">No milestones — track planned vs actual to see which factory is drifting.</p>
            </div>
          ) : (
            <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              {po.milestones.map((m) => {
                const label = m.label || MILESTONE_KINDS.find((k) => k.kind === m.kind)?.label || m.kind;
                const late = m.planned_date && !m.actual_date && m.planned_date < new Date().toISOString().slice(0, 10);
                return (
                  <div key={m.id} className="grid grid-cols-[1fr_130px_130px_40px] gap-3 px-5 py-3 group" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                    <span className="text-sm admin-heading self-center">
                      {label}
                      {late && <span className="ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500">overdue</span>}
                      {m.actual_date && <span className="ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">done</span>}
                    </span>
                    <div><label className={labelClass}>Planned</label>
                      <input type="date" className={`${inputClass} text-xs`} defaultValue={m.planned_date ?? ""}
                        onBlur={(e) => e.target.value !== (m.planned_date ?? "") && patchMilestone(m.id, { planned_date: e.target.value })} /></div>
                    <div><label className={labelClass}>Actual</label>
                      <input type="date" className={`${inputClass} text-xs`} defaultValue={m.actual_date ?? ""}
                        onBlur={(e) => e.target.value !== (m.actual_date ?? "") && patchMilestone(m.id, { actual_date: e.target.value })} /></div>
                    <button onClick={() => deleteMilestone(m.id)} className="self-center opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all" title="Remove">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* QC */}
      {tab === "qc" && (
        <div>
          <div className="mb-4 p-4 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <div><label className={labelClass}>Type</label>
                <select className={inputClass} value={newQc.type} onChange={(e) => setNewQc({ ...newQc, type: e.target.value })}>
                  {QC_TYPES.map((t) => <option key={t} value={t}>{t} — {QC_TYPE_LABELS[t]}</option>)}
                </select></div>
              <div><label className={labelClass}>Agency / inspector</label>
                <input className={inputClass} value={newQc.agency} onChange={(e) => setNewQc({ ...newQc, agency: e.target.value })} placeholder="QIMA, self, factory…" /></div>
              <div><label className={labelClass}>Date</label>
                <input type="date" className={inputClass} value={newQc.date} onChange={(e) => setNewQc({ ...newQc, date: e.target.value })} /></div>
              <button onClick={addQc} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">Add inspection</button>
            </div>
            <p className="text-xs admin-faint mt-3">A blocking PSI without a pass result gates the balance payment.</p>
          </div>
          {po.qc.length === 0 ? (
            <div className="py-12 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
              <p className="text-sm admin-faint">No inspections yet — add the PSI before the balance payment is due.</p>
            </div>
          ) : (
            <div className="rounded-xl admin-tablecard overflow-x-auto" style={{ border: "1px solid var(--admin-border)" }}>
              {po.qc.map((q) => (
                <div key={q.id} className="grid grid-cols-[80px_1fr_110px_140px_150px_40px] gap-3 px-5 py-3 min-w-[640px] group" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                  <span className="text-sm font-bold admin-heading self-center">{q.type}</span>
                  <span className="text-xs admin-muted self-center truncate">{q.agency || q.inspector || "—"} · {fmtDate(q.date)}</span>
                  <select className={`${inputClass} text-xs`} value={q.result ?? ""} onChange={(e) => patchQc(q.id, { result: e.target.value })}>
                    <option value="">pending…</option>
                    <option value="pass">pass</option>
                    <option value="pass_with_notes">pass with notes</option>
                    <option value="fail">fail</option>
                  </select>
                  <input className={`${inputClass} text-xs`} defaultValue={q.report_url ?? ""} placeholder="Report URL"
                    onBlur={(e) => e.target.value !== (q.report_url ?? "") && patchQc(q.id, { report_url: e.target.value })} />
                  <label className="flex items-center gap-2 text-xs admin-muted self-center">
                    <input type="checkbox" checked={q.blocks_balance_payment} onChange={(e) => patchQc(q.id, { blocks_balance_payment: e.target.checked })} />
                    gates balance
                  </label>
                  <button onClick={() => deleteQc(q.id)} className="self-center opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all" title="Remove">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Receive (direct, no container) */}
      {tab === "receive" && (
        <div>
          <div className="mb-4 px-4 py-3 rounded-xl text-xs admin-muted" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            Direct receipt into own storage — for air parcels and samples. Container loads go through an{" "}
            <Link href="/admin/purchasing?tab=inbound" className="text-[var(--admin-accent)] hover:underline">inbound shipment</Link>{" "}
            so freight and duty land on the unit cost.
          </div>
          <div className="rounded-xl admin-tablecard overflow-x-auto mb-4" style={{ border: "1px solid var(--admin-border)" }}>
            <div className="grid grid-cols-[1fr_110px_110px_120px] gap-3 px-5 py-3 admin-surface min-w-[520px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
              {["Variant", "Ordered", "Received", "Receive now"].map((h, i) => (
                <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
              ))}
            </div>
            {po.lines.map((l) => (
              <div key={l.id} className="grid grid-cols-[1fr_110px_110px_120px] gap-3 px-5 py-3 min-w-[520px]" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-sm admin-heading self-center truncate">{l.hw_variants?.hw_products?.name} · {l.hw_variants?.name}</span>
                <span className="text-xs admin-muted self-center">{l.qty_ordered}</span>
                <span className="text-xs admin-muted self-center">{l.qty_received}</span>
                <input type="number" min={0} max={l.qty_ordered - l.qty_received} className={`${inputClass} text-xs`}
                  value={receiveQty[l.id] ?? ""} placeholder="0"
                  onChange={(e) => setReceiveQty({ ...receiveQty, [l.id]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="flex items-end gap-3">
            <div><label className={labelClass}>FX {po.currency} → EUR</label>
              <input type="number" step="0.0001" className={`${inputClass} max-w-[120px]`} value={receiveFx} onChange={(e) => setReceiveFx(e.target.value)} /></div>
            <button onClick={receiveDirect}
              className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
              Book into stock
            </button>
          </div>
          {po.receipts.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-bold admin-heading mb-2">Receipts</h3>
              <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
                {po.receipts.map((r) => {
                  const line = po.lines.find((l) => l.id === r.po_line_id);
                  return (
                    <div key={r.id} className="grid grid-cols-[1fr_80px_130px_110px] gap-3 px-5 py-2.5 text-xs" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                      <span className="admin-heading truncate">{line?.hw_variants?.name ?? "—"} <span className="admin-faint font-mono">{line?.hw_variants?.sku}</span></span>
                      <span className="admin-muted">{r.qty} pcs</span>
                      <span className="admin-muted">{r.unit_landed_cost != null ? `€${Number(r.unit_landed_cost).toFixed(2)}/unit landed` : "—"}</span>
                      <span className="admin-faint">{fmtDate(r.received_at)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {tab === "history" && (
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
          {po.events.length === 0 ? (
            <p className="text-sm admin-faint px-5 py-8 text-center">No events yet.</p>
          ) : po.events.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-5 py-3 text-xs" style={{ borderBottom: "1px solid var(--admin-border)" }}>
              <span className="admin-faint w-28 shrink-0">{new Date(e.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span className="admin-heading">
                {e.from_status ? `${e.from_status.replace(/_/g, " ")} → ` : ""}{e.to_status.replace(/_/g, " ")}
              </span>
              {e.note && <span className="admin-faint truncate">· {e.note}</span>}
              <span className="admin-faint ml-auto">{e.actor}</span>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      <div className="mt-6">
        <label className={labelClass}>Notes</label>
        <textarea className={`${inputClass} min-h-[60px]`} value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} onBlur={saveMeta} />
      </div>
    </div>
  );
}

export default function PoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><p className="text-sm admin-faint">Loading…</p></div>}>
      <PoDetailInner id={id} />
    </Suspense>
  );
}
