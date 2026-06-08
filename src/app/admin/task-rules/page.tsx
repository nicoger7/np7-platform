"use client";

import { useState, useEffect } from "react";

interface TaskRule {
  id: string;
  name: string;
  trigger: string | null;
  template: string | null;
  assignee: string | null;
  days_before_start: number | null;
  experience_id: string | null;
  active: boolean;
  notes: string | null;
  exp_experiences: { id: string; title: string } | null;
}

interface Experience { id: string; title: string; }

export default function TaskRulesPage() {
  const [rules, setRules] = useState<TaskRule[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", trigger: "", template: "", assignee: "", days_before_start: "", experience_id: "", active: true, notes: "" });

  function fetchData() {
    Promise.all([
      fetch("/api/admin/task-rules").then((r) => r.json()),
      fetch("/api/admin/experiences").then((r) => r.json()),
    ]).then(([r, e]) => {
      setRules(r || []);
      setExperiences((e.experiences || e || []).map((x: Record<string, string>) => ({ id: x.id, title: x.title })));
      setLoading(false);
    });
  }

  useEffect(() => { fetchData(); }, []);

  function startEdit(r: TaskRule) {
    setEditId(r.id);
    setForm({ name: r.name, trigger: r.trigger || "", template: r.template || "", assignee: r.assignee || "", days_before_start: r.days_before_start?.toString() || "", experience_id: r.experience_id || "", active: r.active !== false, notes: r.notes || "" });
    setShowNew(false);
  }

  async function handleSave() {
    const body = { name: form.name, trigger: form.trigger || null, template: form.template || null, assignee: form.assignee || null, days_before_start: form.days_before_start ? Number(form.days_before_start) : null, experience_id: form.experience_id || null, active: form.active, notes: form.notes || null };
    if (editId) {
      await fetch(`/api/admin/task-rules/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/admin/task-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setShowNew(false); setEditId(null); fetchData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this rule?")) return;
    await fetch(`/api/admin/task-rules/${id}`, { method: "DELETE" });
    fetchData();
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Task Rules</h1>
          <p className="text-sm admin-muted">{rules.length} rule{rules.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => { setShowNew(!showNew); setEditId(null); setForm({ name: "", trigger: "", template: "", assignee: "", days_before_start: "", experience_id: "", active: true, notes: "" }); }} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors">
          New Rule
        </button>
      </div>

      {(showNew || editId) && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">{editId ? "Edit Rule" : "New Rule"}</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}>Name *</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className={labelClass}>Trigger</label><input className={inputClass} value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })} placeholder="booking_confirmed..." /></div>
            <div><label className={labelClass}>Template</label><input className={inputClass} value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} /></div>
            <div><label className={labelClass}>Assignee</label><input className={inputClass} value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} /></div>
            <div><label className={labelClass}>Days Before Start</label><input className={inputClass} type="number" value={form.days_before_start} onChange={(e) => setForm({ ...form, days_before_start: e.target.value })} /></div>
            <div><label className={labelClass}>Experience</label>
              <select className={inputClass} value={form.experience_id} onChange={(e) => setForm({ ...form, experience_id: e.target.value })}>
                <option value="">—</option>
                {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-4 h-4 accent-[#0aa3c7]" />
                <span className="text-sm admin-muted">Active</span>
              </label>
            </div>
          </div>
          <div className="mb-4"><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!form.name} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg">{editId ? "Update" : "Create"}</button>
            <button onClick={() => { setShowNew(false); setEditId(null); }} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : rules.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No rules yet</p></div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid grid-cols-[1fr_160px_100px_60px_50px] gap-3 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Name</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Trigger</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Experience</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Active</span>
            <span></span>
          </div>
          {rules.map((r) => (
            <div key={r.id} className="grid grid-cols-[1fr_160px_100px_60px_50px] gap-3 px-5 py-3 cursor-pointer transition-colors" style={{ borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              onClick={() => startEdit(r)}
            >
              <div className="min-w-0 self-center">
                <div className="text-sm font-medium admin-heading truncate">{r.name}</div>
                {r.assignee && <div className="text-xs admin-faint">{r.assignee}</div>}
              </div>
              <span className="text-xs admin-muted self-center truncate">{r.trigger || "—"}</span>
              <span className="text-xs admin-muted self-center truncate">{r.exp_experiences?.title || "—"}</span>
              <span className="self-center">{r.active ? <span className="text-green-400 text-xs">✓</span> : <span className="admin-faint text-xs">—</span>}</span>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }} className="text-xs admin-faint hover:text-red-400 transition-colors self-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
