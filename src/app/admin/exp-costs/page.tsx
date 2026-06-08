"use client";

import { useState, useEffect } from "react";

interface ExpCost {
  id: string;
  item: string;
  experience_id: string | null;
  estimated_amount: number | null;
  actual_amount: number | null;
  status: string | null;
  date: string | null;
  notes: string | null;
  exp_experiences: { id: string; title: string } | null;
  created_at: string;
}

interface Experience {
  id: string;
  title: string;
}

const STATUSES = ["confirmed", "estimate", "cancelled", "unlisted"];

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ExpCostsPage() {
  const [costs, setCosts] = useState<ExpCost[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterExp, setFilterExp] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ item: "", experience_id: "", estimated_amount: "", actual_amount: "", status: "estimate", date: "", notes: "" });

  function fetchData() {
    const qs = filterExp ? `?experience_id=${filterExp}` : "";
    Promise.all([
      fetch(`/api/admin/exp-costs${qs}`).then((r) => r.json()),
      fetch("/api/admin/experiences").then((r) => r.json()),
    ]).then(([c, e]) => {
      setCosts(c || []);
      setExperiences((e.experiences || e || []).map((x: Record<string, string>) => ({ id: x.id, title: x.title })));
      setLoading(false);
    });
  }

  useEffect(() => { fetchData(); }, [filterExp]);

  function startEdit(c: ExpCost) {
    setEditId(c.id);
    setForm({ item: c.item, experience_id: c.experience_id || "", estimated_amount: c.estimated_amount?.toString() || "", actual_amount: c.actual_amount?.toString() || "", status: c.status || "estimate", date: c.date || "", notes: c.notes || "" });
    setShowNew(false);
  }

  async function handleSave() {
    const body = { item: form.item, experience_id: form.experience_id || null, estimated_amount: form.estimated_amount ? Number(form.estimated_amount) : null, actual_amount: form.actual_amount ? Number(form.actual_amount) : null, status: form.status || null, date: form.date || null, notes: form.notes || null };
    if (editId) {
      await fetch(`/api/admin/exp-costs/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/admin/exp-costs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setShowNew(false); setEditId(null);
    fetchData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this cost?")) return;
    await fetch(`/api/admin/exp-costs/${id}`, { method: "DELETE" });
    fetchData();
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  const statusColor = (s: string | null) => {
    switch (s) {
      case "confirmed": return "bg-green-500/15 text-green-400";
      case "cancelled": return "bg-red-500/15 text-red-400";
      case "unlisted": return "bg-gray-500/15 text-gray-400";
      default: return "bg-amber-500/15 text-amber-400";
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Experience Costs</h1>
          <p className="text-sm admin-muted">{costs.length} cost item{costs.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => { setShowNew(!showNew); setEditId(null); setForm({ item: "", experience_id: "", estimated_amount: "", actual_amount: "", status: "estimate", date: "", notes: "" }); }} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors">
          New Cost
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <select value={filterExp} onChange={(e) => setFilterExp(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">All Experiences</option>
          {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        {filterExp && <button onClick={() => setFilterExp("")} className="text-xs admin-faint hover:admin-muted">Clear</button>}
      </div>

      {(showNew || editId) && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">{editId ? "Edit Cost" : "New Cost"}</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}>Item *</label><input className={inputClass} value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} /></div>
            <div><label className={labelClass}>Experience</label>
              <select className={inputClass} value={form.experience_id} onChange={(e) => setForm({ ...form, experience_id: e.target.value })}>
                <option value="">—</option>
                {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Status</label>
              <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Estimated (€)</label><input className={inputClass} type="number" step="0.01" value={form.estimated_amount} onChange={(e) => setForm({ ...form, estimated_amount: e.target.value })} /></div>
            <div><label className={labelClass}>Actual (€)</label><input className={inputClass} type="number" step="0.01" value={form.actual_amount} onChange={(e) => setForm({ ...form, actual_amount: e.target.value })} /></div>
            <div><label className={labelClass}>Date</label><input className={inputClass} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          </div>
          <div className="mb-4"><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!form.item} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors">{editId ? "Update" : "Create"}</button>
            <button onClick={() => { setShowNew(false); setEditId(null); }} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : costs.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No costs yet</p></div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid grid-cols-[1fr_160px_100px_100px_80px_80px] gap-3 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Item</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Experience</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Estimated</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Actual</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase"></span>
          </div>
          {costs.map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr_160px_100px_100px_80px_80px] gap-3 px-5 py-3 cursor-pointer transition-colors" style={{ borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              onClick={() => startEdit(c)}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium admin-heading truncate">{c.item}</div>
                {c.date && <div className="text-xs admin-faint">{formatDate(c.date)}</div>}
              </div>
              <span className="text-xs admin-muted self-center truncate">{c.exp_experiences?.title || "—"}</span>
              <span className="text-xs admin-muted self-center">{c.estimated_amount ? `€${Number(c.estimated_amount).toLocaleString()}` : "—"}</span>
              <span className={`text-xs self-center font-medium ${c.actual_amount ? "text-green-400" : "admin-faint"}`}>{c.actual_amount ? `€${Number(c.actual_amount).toLocaleString()}` : "—"}</span>
              <span className="self-center">
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${statusColor(c.status)}`}>{c.status || "—"}</span>
              </span>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} className="text-xs admin-faint hover:text-red-400 transition-colors self-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
