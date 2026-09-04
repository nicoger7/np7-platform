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
  /** Set by every newer writer (Stripe webhook, voucher redemption, settle) —
      the money engine reads it, the list used to ignore it. */
  received_at?: string | null;
  created_at?: string | null;
  status: string | null;
  invoice_type: string | null;
  unmatched: boolean | null;
  /** Set by the list API: the same reference and amount appears more than once.
      Not proof — bank line numbers repeat — but worth a human look. */
  possible_duplicate?: boolean;
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
  // Currency → always 2 decimals (no more "€3,010.8" next to "€1,083.33").
  return `€${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Signed amount for a payment row. The sign follows the real cash direction —
    a cost is money out (−), revenue is money in (+) — AND a negative amount
    (e.g. a refund entered as negative revenue) flips it, so we never render the
    old "+€-1,083.33". */
function signedAmount(amount: number | null, direction: string | null) {
  const v = Number(amount) || 0;
  const out = direction === "cost" ? v >= 0 : v < 0; // cost=out unless credited back; revenue=out only if negative
  return `${out ? "−" : "+"}${money(Math.abs(v))}`;
}
/**
 * When the money moved, from whichever column holds it.
 *
 * `date` is the hand-entered one; Stripe payments, voucher redemptions and the
 * settle flow write `received_at` instead. The list read only `date`, so 30 of
 * 148 payments — including every recent one — showed "—" and sank to the
 * bottom of a newest-first list, which read as "we lost the date" when the
 * date was sitting in the next column. Same precedence the totals use.
 */
function paymentDate(p: { date?: string | null; received_at?: string | null; created_at?: string | null }): string | null {
  return p.date ?? p.received_at ?? p.created_at ?? null;
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
  const [dupesOnly, setDupesOnly] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { load(); }, []);
  function load() {
    fetch("/api/admin/payments").then((r) => r.json()).then((d) => {
      // Re-sort on the SAME effective date the rows display, so a payment
      // that carries only `received_at` sits where its date says, not at the
      // bottom. The server can't order on a coalesce, and the list is not
      // paginated, so this is the honest place to do it.
      const rows: Payment[] = Array.isArray(d) ? d : [];
      rows.sort((a, b) => (paymentDate(b) ?? "").localeCompare(paymentDate(a) ?? ""));
      setPayments(rows);
      setLoading(false);
    });
  }

  const filtered = useMemo(() => payments.filter((p) => {
    if (fDir && p.direction !== fDir) return false;
    if (fStatus && p.status !== fStatus) return false;
    if (unmatchedOnly && !p.unmatched) return false;
    if (dupesOnly && !p.possible_duplicate) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${p.reference ?? ""} ${p.notes ?? ""} ${p.exp_bookings?.name ?? ""} ${p.contacts?.name ?? ""} ${p.vendors?.name ?? ""} ${p.exp_experiences?.title ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [payments, fDir, fStatus, unmatchedOnly, dupesOnly, search]);

  const dupeCount = useMemo(() => payments.filter((p) => p.possible_duplicate).length, [payments]);

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
      status: p.status ?? "paid", date: (paymentDate(p) ?? "").slice(0, 10), reference: p.reference ?? "",
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
      let res = await fetch(`/api/admin/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      // A reference that already carries this exact amount is nearly always the
      // same transfer written down twice. Ask once; a second transfer that
      // genuinely shares a statement line still gets through.
      if (res.status === 409) {
        const j = await res.json().catch(() => ({}));
        if (!confirm(`${j.error ?? "This payment looks like a duplicate."}\n\nSave it anyway?`)) return;
        res = await fetch(`/api/admin/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, confirmDuplicate: true }) });
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "Could not save the payment.");
        return;
      }
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
      paymentDate(p) ?? "", p.amount ?? "", p.direction ?? "", p.type ?? "", p.method ?? "",
      (p.reference ?? "").replace(/"/g, '""'),
      p.status ?? "",
      (p.exp_bookings?.name ?? p.contacts?.name ?? p.vendors?.name ?? "").replace(/"/g, '""'),
    ]);
    const csv = [cols.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "payments.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  // Selecting a payment opens a master-detail (rail + detail); deselecting
  // returns to the wide full-width table.
  const selected = !!editId || showNew;
  const deselect = () => { setShowNew(false); setEditId(null); setForm(emptyForm); };

  return (
    /* `fin` is the opt-in: it brings the Budget pages' system face, tabular
       numerals and surface tokens to THIS page only. Money in a table has to
       line up, and a figure that changes must not shuffle its neighbours. */
    <div className="fin">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="fin-hero mb-1">Payments</h1>
          <p className="fin-sub">{payments.length} payment{payments.length !== 1 ? "s" : ""} · revenue and costs</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="px-3 py-2 admin-surface admin-muted text-sm rounded-lg transition-colors" style={{ border: "1px solid var(--admin-border)" }}>Export CSV</button>
          <button onClick={startNew} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">New Payment</button>
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
          <div key={c.label} className="fin-card">
            <div className="fin-label mb-1.5">{c.label}</div>
            <div className={`text-[26px] font-semibold tracking-[-.02em] ${c.tone}`}>{c.value}</div>
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
        {/* The same money entered twice sums quietly into revenue and the
            edition P&L, and the second copy usually carries no booking — so it
            hides in the unmatched pile. Give it its own door. */}
        {dupeCount > 0 && (
          <label className="flex items-center gap-2 text-xs text-amber-400 cursor-pointer select-none">
            <input type="checkbox" checked={dupesOnly} onChange={(e) => setDupesOnly(e.target.checked)} className="accent-amber-400" />
            Possible duplicates ({dupeCount})
          </label>
        )}
        {(search || fDir || fStatus || unmatchedOnly || dupesOnly) && (
          <button onClick={() => { setSearch(""); setFDir(""); setFStatus(""); setUnmatchedOnly(false); setDupesOnly(false); }} className="text-xs admin-faint hover:admin-muted transition-colors">Clear</button>
        )}
        <span className="text-xs admin-faint ml-auto">{filtered.length} shown</span>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : !selected ? (
        /* ── Wide table (default) ── */
        filtered.length === 0 ? (
          <div className="py-16 text-center text-sm admin-faint">No payments match.</div>
        ) : (
          <div className="fin-card admin-tablecard" style={{ padding: 0, overflow: "hidden" }}>
            <div className="grid grid-cols-[100px_110px_80px_90px_110px_1fr_90px_40px] gap-3 px-5 py-2.5 fin-rule" style={{ borderTop: 0 }}>
              {["Date", "Amount", "Dir", "Type", "Reference", "Linked to", "Status", ""].map((h, i) => (
                <span key={i} className={`fin-label${h === "Amount" ? " text-right" : ""}`}>{h}</span>
              ))}
            </div>
            {filtered.map((p) => (
              /* The hover was two inline handlers writing style on every row.
                 .fin-row does it in CSS, which also means prefers-reduced-motion
                 can switch the transition off, which inline style cannot. */
              <div key={p.id} className="fin-row fin-rule grid grid-cols-[100px_110px_80px_90px_110px_1fr_90px_40px] gap-3 px-5 py-1.5 group items-center cursor-pointer"
                onClick={() => startEdit(p)}>
                <span className="text-xs admin-muted">{fmtDate(paymentDate(p))}</span>
                <span className={`fin-num text-[12.5px] text-right ${p.direction === "cost" ? "text-red-400" : "text-green-400"}`}>
                  {signedAmount(p.amount, p.direction)}
                </span>
                <span className="text-[10px]">
                  <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${p.direction === "cost" ? "bg-red-500/15 text-red-400" : "bg-green-500/15 text-green-400"}`}>{p.direction === "cost" ? "Cost" : "Rev"}</span>
                </span>
                <span className="text-xs admin-muted truncate">{p.type ?? "—"}</span>
                {/* A Stripe payment stores its payment-intent id as the
                    reference. It was printed as inert text, so checking a
                    charge, a card or a refund meant searching Stripe by hand. */}
                {p.reference?.startsWith("pi_") || p.reference?.startsWith("ch_") ? (
                  <a href={`https://dashboard.stripe.com/payments/${p.reference}`} target="_blank" rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Open this charge in Stripe"
                    className="text-xs font-semibold text-[#635bff] hover:underline truncate inline-flex items-center gap-1">
                    {p.reference}
                    <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></svg>
                  </a>
                ) : (
                  <span className="text-xs admin-muted truncate inline-flex items-center gap-1.5">
                    {p.reference ?? "—"}
                    {p.possible_duplicate && (
                      <span title="Another payment carries this reference for the same amount — check the bank statement before this counts as revenue twice."
                        className="shrink-0 px-1 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[9px] font-bold uppercase tracking-wide">dup?</span>
                    )}
                  </span>
                )}
                <span className="text-xs admin-muted truncate">
                  {p.booking_id && p.exp_bookings ? (
                    <Link href={`/admin/bookings/${p.booking_id}`} onClick={(e) => e.stopPropagation()} className="text-[#0aa3c7] hover:underline">{p.exp_bookings.name}</Link>
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
                <button onClick={(e) => { e.stopPropagation(); remove(p.id); }} className="opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all" title="Delete">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        /* ── Master-detail (rail + detail) — deselect returns to the wide table ── */
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="lg:w-[300px] shrink-0">
            <button onClick={deselect} className="mb-2 inline-flex items-center gap-1.5 text-xs admin-faint hover:admin-muted transition-colors">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
              Back to wide view
            </button>
            <div className="rounded-xl admin-tablecard overflow-hidden max-h-[72vh] overflow-y-auto" style={{ border: "1px solid var(--admin-border)" }}>
              {filtered.map((p) => (
                <button key={p.id} onClick={() => startEdit(p)} className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition-colors" style={{ borderBottom: "1px solid var(--admin-border)", backgroundColor: editId === p.id ? "var(--admin-surface-hover)" : "transparent" }}>
                  <span className="min-w-0">
                    <span className={`text-sm font-medium ${p.direction === "cost" ? "text-red-400" : "text-green-400"}`}>{signedAmount(p.amount, p.direction)}</span>
                    <span className="block text-[11px] admin-faint truncate">{fmtDate(paymentDate(p))} · {p.reference || p.exp_bookings?.name || p.contacts?.name || p.vendors?.name || "—"}</span>
                  </span>
                  <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                    p.status === "paid" ? "bg-green-500/15 text-green-400" :
                    p.status === "pending" ? "bg-amber-500/15 text-amber-400" :
                    p.status === "overdue" ? "bg-red-500/15 text-red-400" : "admin-surface admin-muted"
                  }`}>{p.status ?? "—"}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-0 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold admin-heading">{editId ? "Edit Payment" : "New Payment"}</h3>
              {editId && <button onClick={() => remove(editId)} className="text-xs text-red-400/70 hover:text-red-400 transition-colors">Delete</button>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div><label className={labelClass}>Amount (€) *</label><input type="number" step="0.01" className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div><label className={labelClass}>Direction</label><select className={inputClass} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>{DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
              <div><label className={labelClass}>Type</label><select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className={labelClass}>Method</label><select className={inputClass} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>{METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div><label className={labelClass}>Status</label><select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
              <div><label className={labelClass}>Date</label><input type="date" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div><label className={labelClass}>Reference</label><input className={inputClass} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Invoice #" /></div>
              <div><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <div className="flex gap-2">
              <button onClick={save} disabled={!form.amount} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">{editId ? "Update" : "Create"}</button>
              <button onClick={deselect} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
