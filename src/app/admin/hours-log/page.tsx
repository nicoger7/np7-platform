"use client";

import { useState, useEffect } from "react";

interface HoursEntry {
  id: string;
  date: string | null;
  hours: number;
  category: string | null;
  entry: string | null;
  notes: string | null;
  employee_id: string | null;
  experience_id: string | null;
  team_members: { id: string; name: string } | null;
  exp_experiences: { id: string; title: string } | null;
}

interface TeamMember { id: string; name: string; }
interface Experience { id: string; title: string; }

const CATEGORIES = ["coaching", "planning", "admin", "travel", "content", "other"];

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function HoursLogPage() {
  const [entries, setEntries] = useState<HoursEntry[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterExp, setFilterExp] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ date: "", hours: "", category: "", entry: "", employee_id: "", experience_id: "", notes: "" });

  function fetchData() {
    const params = new URLSearchParams();
    if (filterEmployee) params.set("employee_id", filterEmployee);
    if (filterExp) params.set("experience_id", filterExp);
    const qs = params.toString() ? `?${params}` : "";
    Promise.all([
      fetch(`/api/admin/hours-log${qs}`).then((r) => r.json()),
      fetch("/api/admin/team").then((r) => r.json()),
      fetch("/api/admin/experiences").then((r) => r.json()),
    ]).then(([h, t, e]) => {
      setEntries(h || []);
      setTeam(t || []);
      setExperiences((e.experiences || e || []).map((x: Record<string, string>) => ({ id: x.id, title: x.title })));
      setLoading(false);
    });
  }

  useEffect(() => { fetchData(); }, [filterEmployee, filterExp]);

  function startEdit(e: HoursEntry) {
    setEditId(e.id);
    setForm({ date: e.date || "", hours: e.hours?.toString() || "", category: e.category || "", entry: e.entry || "", employee_id: e.employee_id || "", experience_id: e.experience_id || "", notes: e.notes || "" });
    setShowNew(false);
  }

  async function handleSave() {
    const body = { date: form.date || null, hours: form.hours ? Number(form.hours) : 0, category: form.category || null, entry: form.entry || null, employee_id: form.employee_id || null, experience_id: form.experience_id || null, notes: form.notes || null };
    if (editId) {
      await fetch(`/api/admin/hours-log/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/admin/hours-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setShowNew(false); setEditId(null); fetchData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this entry?")) return;
    await fetch(`/api/admin/hours-log/${id}`, { method: "DELETE" });
    fetchData();
  }

  const totalHours = entries.reduce((s, e) => s + Number(e.hours || 0), 0);
  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Hours Log</h1>
          <p className="text-sm admin-muted">{entries.length} entries · {totalHours.toFixed(1)} total hours</p>
        </div>
        <button onClick={() => { setShowNew(!showNew); setEditId(null); setForm({ date: "", hours: "", category: "", entry: "", employee_id: "", experience_id: "", notes: "" }); }} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors">
          Log Hours
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">All Team Members</option>
          {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={filterExp} onChange={(e) => setFilterExp(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">All Experiences</option>
          {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        {(filterEmployee || filterExp) && <button onClick={() => { setFilterEmployee(""); setFilterExp(""); }} className="text-xs admin-faint hover:admin-muted">Clear</button>}
      </div>

      {(showNew || editId) && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">{editId ? "Edit Entry" : "Log Hours"}</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}>Date</label><input className={inputClass} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div><label className={labelClass}>Hours *</label><input className={inputClass} type="number" step="0.5" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></div>
            <div><label className={labelClass}>Category</label>
              <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">—</option>
                {CATEGORIES.map((c) => <option key={c} className="capitalize">{c}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Team Member</label>
              <select className={inputClass} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                <option value="">—</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Experience</label>
              <select className={inputClass} value={form.experience_id} onChange={(e) => setForm({ ...form, experience_id: e.target.value })}>
                <option value="">—</option>
                {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Description</label><input className={inputClass} value={form.entry} onChange={(e) => setForm({ ...form, entry: e.target.value })} /></div>
          </div>
          <div className="mb-4"><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!form.hours} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg">{editId ? "Update" : "Log"}</button>
            <button onClick={() => { setShowNew(false); setEditId(null); }} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No hours logged</p></div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid grid-cols-[80px_50px_120px_100px_1fr_60px] gap-3 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Date</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Hrs</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Member</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Category</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Description</span>
            <span></span>
          </div>
          {entries.map((e) => (
            <div key={e.id} className="grid grid-cols-[80px_50px_120px_100px_1fr_60px] gap-3 px-5 py-3 cursor-pointer transition-colors" style={{ borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(ev) => (ev.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(ev) => (ev.currentTarget.style.backgroundColor = "transparent")}
              onClick={() => startEdit(e)}
            >
              <span className="text-xs admin-muted self-center">{formatDate(e.date)}</span>
              <span className="text-xs font-medium admin-heading self-center">{e.hours}h</span>
              <span className="text-xs admin-muted self-center truncate">{e.team_members?.name || "—"}</span>
              <span className="text-xs admin-muted self-center capitalize">{e.category || "—"}</span>
              <span className="text-xs admin-faint self-center truncate">{e.entry || e.exp_experiences?.title || "—"}</span>
              <button onClick={(ev) => { ev.stopPropagation(); handleDelete(e.id); }} className="text-xs admin-faint hover:text-red-400 transition-colors self-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
