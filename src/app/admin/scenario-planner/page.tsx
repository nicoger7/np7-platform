"use client";

import { useState, useEffect } from "react";

interface Scenario {
  id: string;
  name: string;
  experience_id: string | null;
  assumptions: string | null;
  projected_revenue: number | null;
  projected_costs: number | null;
  projected_profit: number | null;
  notes: string | null;
  exp_experiences: { id: string; title: string } | null;
}

interface Experience { id: string; title: string; }

export default function ScenarioPlannerPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", experience_id: "", assumptions: "", projected_revenue: "", projected_costs: "", projected_profit: "", notes: "" });

  function fetchData() {
    Promise.all([
      fetch("/api/admin/scenario-planner").then((r) => r.json()),
      fetch("/api/admin/experiences").then((r) => r.json()),
    ]).then(([s, e]) => {
      setScenarios(s || []);
      setExperiences((e.experiences || e || []).map((x: Record<string, string>) => ({ id: x.id, title: x.title })));
      setLoading(false);
    });
  }

  useEffect(() => { fetchData(); }, []);

  function startEdit(s: Scenario) {
    setEditId(s.id);
    setForm({ name: s.name, experience_id: s.experience_id || "", assumptions: s.assumptions || "", projected_revenue: s.projected_revenue?.toString() || "", projected_costs: s.projected_costs?.toString() || "", projected_profit: s.projected_profit?.toString() || "", notes: s.notes || "" });
    setShowNew(false);
  }

  async function handleSave() {
    const body = {
      name: form.name, experience_id: form.experience_id || null, assumptions: form.assumptions || null,
      projected_revenue: form.projected_revenue ? Number(form.projected_revenue) : null,
      projected_costs: form.projected_costs ? Number(form.projected_costs) : null,
      projected_profit: form.projected_profit ? Number(form.projected_profit) : null,
      notes: form.notes || null,
    };
    if (editId) {
      await fetch(`/api/admin/scenario-planner/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/admin/scenario-planner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setShowNew(false); setEditId(null); fetchData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this scenario?")) return;
    await fetch(`/api/admin/scenario-planner/${id}`, { method: "DELETE" });
    fetchData();
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  const profit = (s: Scenario) => {
    if (s.projected_revenue && s.projected_costs) return Number(s.projected_revenue) - Number(s.projected_costs);
    return s.projected_profit;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Scenario Planner</h1>
          <p className="text-sm admin-muted">{scenarios.length} scenario{scenarios.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => { setShowNew(!showNew); setEditId(null); setForm({ name: "", experience_id: "", assumptions: "", projected_revenue: "", projected_costs: "", projected_profit: "", notes: "" }); }} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors">
          New Scenario
        </button>
      </div>

      {(showNew || editId) && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">{editId ? "Edit Scenario" : "New Scenario"}</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div><label className={labelClass}>Name *</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className={labelClass}>Experience</label>
              <select className={inputClass} value={form.experience_id} onChange={(e) => setForm({ ...form, experience_id: e.target.value })}>
                <option value="">—</option>
                {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}>Projected Revenue (€)</label><input className={inputClass} type="number" value={form.projected_revenue} onChange={(e) => setForm({ ...form, projected_revenue: e.target.value })} /></div>
            <div><label className={labelClass}>Projected Costs (€)</label><input className={inputClass} type="number" value={form.projected_costs} onChange={(e) => setForm({ ...form, projected_costs: e.target.value })} /></div>
            <div><label className={labelClass}>Projected Profit (€)</label><input className={inputClass} type="number" value={form.projected_profit} onChange={(e) => setForm({ ...form, projected_profit: e.target.value })} /></div>
          </div>
          <div className="mb-4"><label className={labelClass}>Assumptions</label><textarea className={`${inputClass} min-h-[60px] resize-y`} value={form.assumptions} onChange={(e) => setForm({ ...form, assumptions: e.target.value })} /></div>
          <div className="mb-4"><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!form.name} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg">{editId ? "Update" : "Create"}</button>
            <button onClick={() => { setShowNew(false); setEditId(null); }} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : scenarios.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No scenarios yet</p></div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid grid-cols-[1fr_160px_100px_100px_100px_60px] gap-3 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Name</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Experience</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Revenue</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Costs</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Profit</span>
            <span></span>
          </div>
          {scenarios.map((s) => {
            const p = profit(s);
            return (
              <div key={s.id} className="grid grid-cols-[1fr_160px_100px_100px_100px_60px] gap-3 px-5 py-3 cursor-pointer transition-colors" style={{ borderBottom: "1px solid var(--admin-border)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                onClick={() => startEdit(s)}
              >
                <div className="min-w-0 self-center">
                  <div className="text-sm font-medium admin-heading truncate">{s.name}</div>
                  {s.assumptions && <div className="text-xs admin-faint truncate">{s.assumptions}</div>}
                </div>
                <span className="text-xs admin-muted self-center truncate">{s.exp_experiences?.title || "—"}</span>
                <span className="text-xs admin-muted self-center">{s.projected_revenue ? `€${Number(s.projected_revenue).toLocaleString()}` : "—"}</span>
                <span className="text-xs admin-muted self-center">{s.projected_costs ? `€${Number(s.projected_costs).toLocaleString()}` : "—"}</span>
                <span className={`text-xs self-center font-medium ${p && p > 0 ? "text-green-400" : p && p < 0 ? "text-red-400" : "admin-muted"}`}>{p !== null && p !== undefined ? `€${Number(p).toLocaleString()}` : "—"}</span>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} className="text-xs admin-faint hover:text-red-400 transition-colors self-center">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
