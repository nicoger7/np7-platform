"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  phone: string | null;
  rate_per_hour: number | null;
  active: boolean;
  notes: string | null;
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "", phone: "", rate_per_hour: "", notes: "" });

  function fetchData() {
    fetch("/api/admin/team").then((r) => r.json()).then((d) => { setMembers(d || []); setLoading(false); });
  }

  useEffect(() => { fetchData(); }, []);

  async function handleCreate() {
    const res = await fetch("/api/admin/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, rate_per_hour: form.rate_per_hour ? Number(form.rate_per_hour) : null }),
    });
    if (res.ok) { setShowNew(false); setForm({ name: "", email: "", role: "", phone: "", rate_per_hour: "", notes: "" }); fetchData(); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this team member?")) return;
    await fetch(`/api/admin/team/${id}`, { method: "DELETE" });
    fetchData();
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Team</h1>
          <p className="text-sm admin-muted">{members.length} member{members.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors">New Member</button>
      </div>

      {showNew && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">New Team Member</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}>Name *</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className={labelClass}>Email</label><input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className={labelClass}>Phone</label><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className={labelClass}>Role</label><input className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
            <div><label className={labelClass}>Hourly Rate (€)</label><input className={inputClass} type="number" step="0.01" value={form.rate_per_hour} onChange={(e) => setForm({ ...form, rate_per_hour: e.target.value })} /></div>
            <div><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!form.name} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg">Create</button>
            <button onClick={() => setShowNew(false)} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : members.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No team members yet</p></div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid grid-cols-[1fr_160px_120px_80px_60px_50px] gap-3 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Name</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Email</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Role</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Rate/hr</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Active</span>
            <span></span>
          </div>
          {members.map((m) => (
            <div key={m.id} className="grid grid-cols-[1fr_160px_120px_80px_60px_50px] gap-3 px-5 py-3 transition-colors" style={{ borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <Link href={`/admin/team/${m.id}`} className="text-sm font-medium admin-heading truncate hover:text-[#0aa3c7] transition-colors">{m.name}</Link>
              <span className="text-xs admin-muted self-center truncate">{m.email || "—"}</span>
              <span className="text-xs admin-muted self-center">{m.role || "—"}</span>
              <span className="text-xs admin-muted self-center">{m.rate_per_hour ? `€${m.rate_per_hour}/h` : "—"}</span>
              <span className="self-center">{m.active ? <span className="text-green-400 text-xs">✓</span> : <span className="admin-faint text-xs">—</span>}</span>
              <button onClick={() => handleDelete(m.id)} className="text-xs admin-faint hover:text-red-400 transition-colors self-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
