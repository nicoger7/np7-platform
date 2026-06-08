"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Vendor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  category: string | null;
  notes: string | null;
  created_at: string;
}

const CATEGORIES = ["Hotel", "Transport", "Catering", "Gear", "Photography", "Media", "Other"];

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", category: "", notes: "" });

  function fetchData() {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    fetch(`/api/admin/vendors${qs}`)
      .then((r) => r.json())
      .then((d) => { setVendors(d || []); setLoading(false); });
  }

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    const t = setTimeout(fetchData, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleCreate() {
    const res = await fetch("/api/admin/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowNew(false);
      setForm({ name: "", email: "", phone: "", company: "", category: "", notes: "" });
      fetchData();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this vendor?")) return;
    await fetch(`/api/admin/vendors/${id}`, { method: "DELETE" });
    fetchData();
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Vendors</h1>
          <p className="text-sm admin-muted">{vendors.length} vendor{vendors.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors">
          New Vendor
        </button>
      </div>

      <div className="mb-5">
        <input className={`${inputClass} max-w-sm`} placeholder="Search by name, company, email..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {showNew && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">New Vendor</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}>Name *</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className={labelClass}>Company</label><input className={inputClass} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div><label className={labelClass}>Category</label>
              <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">—</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Email</label><input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className={labelClass}>Phone</label><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!form.name} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors">Create</button>
            <button onClick={() => setShowNew(false)} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : vendors.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No vendors yet</p></div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid grid-cols-[1fr_140px_140px_100px_80px] gap-3 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Name</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Company</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Email</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Category</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase"></span>
          </div>
          {vendors.map((v) => (
            <div key={v.id} className="grid grid-cols-[1fr_140px_140px_100px_80px] gap-3 px-5 py-3 transition-colors" style={{ borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <Link href={`/admin/vendors/${v.id}`} className="text-sm font-medium admin-heading truncate hover:text-[#0aa3c7] transition-colors">{v.name}</Link>
              <span className="text-xs admin-muted self-center truncate">{v.company || "—"}</span>
              <span className="text-xs admin-muted self-center truncate">{v.email || "—"}</span>
              <span className="text-xs admin-muted self-center">{v.category || "—"}</span>
              <button onClick={() => handleDelete(v.id)} className="text-xs admin-faint hover:text-red-400 transition-colors self-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
