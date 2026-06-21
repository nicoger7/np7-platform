"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

interface Payment {
  id: string;
  amount: number | null;
  direction: string | null;
  type: string | null;
  method: string | null;
  reference: string | null;
  date: string | null;
  status: string | null;
  invoice_type: string | null;
  unmatched: boolean | null;
  notes: string | null;
  booking_id: string | null;
  experience_id: string | null;
  contact_id: string | null;
  vendor_id: string | null;
  exp_bookings: { name: string; status: string } | null;
  contacts: { name: string } | null;
  vendors: { name: string } | null;
  exp_experiences: { title: string } | null;
}

const DIRECTIONS = ["revenue", "cost"];
const TYPES = ["downpayment", "final", "partial", "refund", "other"];
const METHODS = ["bank_transfer", "stripe", "credit_card", "cash", "paypal", "other"];
const STATUSES = ["paid", "pending", "overdue", "cancelled"];

function money(n: number | null) {
  if (n == null) return "—";
  return `€${Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const emptyForm = {
  amount: "", direction: "revenue", type: "final", method: "bank_transfer",
  status: "paid", date: "", reference: "", notes: "",
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fDir, setFDir] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { load(); }, []);
  function load() {
    fetch("/api/admin/payments").then((r) => r.json()).then((d) => {
      setPayments(Array.isArray(d) ? d : []);
      setLoading(false);
    });
  }

  const filtered = useMemo(() => payments.filter((p) => {
    if (fDir && p.direction !== fDir) return false;
    if (fStatus && p.status !== fStatus) return false;
    if (unmatchedOnly && !p.unmatched) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${p.reference ?? ""} ${p.notes ?? ""} ${p.exp_bookings?.name ?? ""} ${p.contacts?.name ?? ""} ${p.vendors?.name ?? ""} ${p.exp_experiences?.title ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [payments, fDir, fStatus, unmatchedOnly, search]);

  const totals = useMemo(() => {
    let rev = 0, cost = 0, pending = 0;
    for (const p of filtered) {
      const a = Number(p.amount) || 0;
      if (p.direction === "cost") cost += a;
      else rev += a;
      if (p.status === "pending" || p.status === "overdue") pending += a;
    }
    return { rev, cost, net: rev - cost, pending };
  }, [filtered]);

  function startEdit(p: Payment) {
    setEditId(p.id); setShowNew(false);
    setForm({
      amount: p.amount?.toString() ?? "", direction: p.direction ?? "revenue",
      type: p.type ?? "final", method: p.method ?? "bank_transfer",
      status: p.status ?? "paid", date: p.date ?? "", reference: p.reference ?? "",
      notes: p.notes ?? "",
    });
  }
  function startNew() { setEditId(null); setForm(emptyForm); setShowNew(true); }

  async function save() {
    const body = {
      amount: form.amount ? Number(form.amount) : null,
      direction: form.direction, type: form.type, method: form.method,
      status: form.status, date: form.date || null, reference: form.reference || null,
      notes: form.notes || null,
    };
    if (editId) {
      await fetch(`/api/admin/payments/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch(`/api/admin/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setShowNew(false); setEditId(null); setForm(emptyForm); load();
  }
  async function remove(id: string) {
    if (!confirm("Delete this payment?")) return;
    await fetch(`/api/admin/payments/${id}`, { method: "DELETE" });
    load();
  }

  function exportCsv() {
    const cols = ["date", "amount", "direction", "type", "method", "reference", "status", "linked"];
    const rows = filtered.map((p) => [
      p.date ?? "", p.amount ?? "", p.direction ?? "", p.type ?? "", p.method ?? "",
      (p.reference ?? "").replace(/"/g, '""'),
      p.status ?? "",
      (p.exp_bookings?.name ?? p.contacts?.name ?? p.vendors?.name ?? "").replace(/"/g, '""'),
    ]);
    const csv = [cols.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "payments.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Payments</h1>
          <p className="text-sm admin-muted">{payments.length} payment{payments.length !== 1 ? "s" : ""} — revenue & costs</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="px-3 py-2 admin-surface admin-muted text-sm rounded-lg transition-colors" style={{ border: "1px solid var(--admin-border)" }}>Export CSV</button>
          <button onClick={startNew} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors">New Payment</button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Revenue", value: money(totals.rev), tone: "text-green-400" },
          { label: "Costs", value: money(totals.cost), tone: "text-red-400" },
          { label: "Net", value: money(totals.net), tone: totals.net < 0 ? "text-red-400" : "text-green-400" },
          { label: "Pending / overdue", value: money(totals.pending), tone: "text-amber-400" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            <div className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase mb-1">{c.label}</div>
            <div className={`text-xl font-bold ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reference, name, notes…" className="admin-input text-sm px-3 py-1.5 rounded-lg w-64" />
        <select value={fDir} onChange={(e) => setFDir(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">All directions</option>
          {DIRECTIONS.map((d) => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs admin-muted cursor-pointer px-2">
          <input type="checkbox" checked={unmatchedOnly} onChange={(e) => setUnmatchedOnly(e.target.checked)} className="accent-[#0aa3c7]" />
          Unmatched only
        </label>
        {(search || fDir || fStatus || unmatchedOnly) && (
          <button onClick={() => { setSearch(""); setFDir(""); setFStatus(""); setUnmatchedOnly(false); }} className="text-xs admin-faint hover:admin-muted transition-colors">Clear</button>
        )}
        <span className="text-xs admin-faint ml-auto">{filtered.length} shown</span>
      </div>

      {/* Form */}
      {(showNew || editId) && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">{editId ? "Edit Payment" : "New Payment"}</h3>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div><label className={labelClass}>Amount (€) *</label><input type="number" step="0.01" className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div><label className={labelClass}>Direction</label><select className={inputClass} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>{DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
            <div><label className={labelClass}>Type</label><select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label className={labelClass}>Method</label><select className={inputClass} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div><label className={labelClass}>Status</label><select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label className={labelClass}>Date</label><input type="date" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div><label className={labelClass}>Reference</label><input className={inputClass} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Invoice #" /></div>
            <div><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={!form.amount} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors">{editId ? "Update" : "Create"}</button>
            <button onClick={() => { setShowNew(false); setEditId(null); setForm(emptyForm); }} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm admin-faint">No payments match.</div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid grid-cols-[100px_110px_80px_90px_110px_1fr_90px_40px] gap-3 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            {["Date", "Amount", "Dir", "Type", "Reference", "Linked to", "Status", ""].map((h, i) => (
              <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>
          {filtered.map((p) => (
            <div key={p.id} className="grid grid-cols-[100px_110px_80px_90px_110px_1fr_90px_40px] gap-3 px-5 py-3 transition-colors group items-center" style={{ borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>
              <span className="text-xs admin-muted cursor-pointer" onClick={() => startEdit(p)}>{fmtDate(p.date)}</span>
              <span className={`text-sm font-medium cursor-pointer ${p.direction === "cost" ? "text-red-400" : "text-green-400"}`} onClick={() => startEdit(p)}>
                {p.direction === "cost" ? "−" : "+"}{money(p.amount)?.replace("€", "€")}
              </span>
              <span className="text-[10px]">
                <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${p.direction === "cost" ? "bg-red-500/15 text-red-400" : "bg-green-500/15 text-green-400"}`}>{p.direction === "cost" ? "Cost" : "Rev"}</span>
              </span>
              <span className="text-xs admin-muted truncate">{p.type ?? "—"}</span>
              <span className="text-xs admin-muted truncate">{p.reference ?? "—"}</span>
              <span className="text-xs admin-muted truncate">
                {p.booking_id && p.exp_bookings ? (
                  <Link href={`/admin/bookings/${p.booking_id}`} className="text-[#0aa3c7] hover:underline">{p.exp_bookings.name}</Link>
                ) : (p.contacts?.name || p.vendors?.name || p.exp_experiences?.title || (
                  p.unmatched ? <span className="text-amber-400">Unmatched</span> : "—"
                ))}
              </span>
              <span className="text-[10px]">
                <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${
                  p.status === "paid" ? "bg-green-500/15 text-green-400" :
                  p.status === "pending" ? "bg-amber-500/15 text-amber-400" :
                  p.status === "overdue" ? "bg-red-500/15 text-red-400" : "admin-surface admin-muted"
                }`}>{p.status ?? "—"}</span>
              </span>
              <button onClick={() => remove(p.id)} className="opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all" title="Delete">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
