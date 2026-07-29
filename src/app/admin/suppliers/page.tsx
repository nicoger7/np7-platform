"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HelpHint } from "@/components/admin/help-hint";

interface SupplierRow {
  id: string; name: string; country: string | null; currency: string;
  default_incoterm: string | null; default_payment_terms: string | null;
  skus: number; openPos: number;
}

export default function SuppliersPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", country: "", currency: "USD", default_incoterm: "FOB", default_payment_terms: "30/70 T/T" });

  function fetchData() {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    fetch(`/api/admin/suppliers${qs}`).then((r) => r.json()).then((d) => {
      setSuppliers(Array.isArray(d) ? d : []);
      setLoading(false);
    });
  }
  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(fetchData, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleCreate() {
    if (!form.name) return;
    setCreating(true);
    const res = await fetch("/api/admin/suppliers", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/admin/suppliers/${data.id}`);
    } else setCreating(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Archive this supplier?")) return;
    await fetch(`/api/admin/suppliers/${id}`, { method: "DELETE" });
    fetchData();
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Suppliers</h1>
          <p className="text-sm admin-muted">{suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""} · factories &amp; their per-SKU costs, MOQs, lead times</p>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"
        >
          New Supplier
        </button>
      </div>

      <div className="mb-5">
        <input className={`${inputClass} max-w-sm`} placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {showNew && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">New Supplier</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
            <div className="col-span-2">
              <label className={labelClass}>Name *</label>
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Cobra International" autoFocus />
            </div>
            <div>
              <label className={labelClass}>Country</label>
              <input className={inputClass} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="TH" />
            </div>
            <div>
              <label className={labelClass}>Currency</label>
              <select className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {["USD", "EUR", "CNY", "THB", "VND"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Incoterm<HelpHint term="incoterm" align="right" /></label>
              <select className={inputClass} value={form.default_incoterm} onChange={(e) => setForm({ ...form, default_incoterm: e.target.value })}>
                {["FOB", "EXW", "CIF", "DAP", "DDP"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!form.name || creating}
              className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
              {creating ? "Creating…" : "Create"}
            </button>
            <button onClick={() => setShowNew(false)} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : suppliers.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No suppliers yet — add your first factory.</p></div>
      ) : (
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid grid-cols-[1fr_70px_80px_110px_90px_90px_40px] gap-3 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            {["Name", "Country", "Currency", "Terms", "Catalog", "Open POs", ""].map((h, i) => (
              <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>
          {suppliers.map((s) => (
            <div key={s.id} className="grid grid-cols-[1fr_70px_80px_110px_90px_90px_40px] gap-3 px-5 py-3 transition-colors group"
              style={{ borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>
              <Link href={`/admin/suppliers/${s.id}`} className="text-sm font-medium admin-heading truncate hover:text-[var(--admin-accent)] transition-colors self-center">
                {s.name}
              </Link>
              <span className="text-xs admin-muted self-center">{s.country || "—"}</span>
              <span className="text-xs admin-muted self-center">{s.currency}</span>
              <span className="text-xs admin-muted self-center truncate">{s.default_payment_terms || "—"}</span>
              <span className="text-xs admin-muted self-center">{s.skus} SKU{s.skus !== 1 ? "s" : ""}</span>
              <span className={`text-xs self-center ${s.openPos > 0 ? "text-[var(--admin-accent)] font-semibold" : "admin-faint"}`}>{s.openPos || "—"}</span>
              <button onClick={() => handleDelete(s.id)} title="Archive"
                className="self-center opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
