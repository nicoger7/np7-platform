"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ACCESS_LEVELS, ACCESS_LABELS, normalizeLevel } from "@/lib/access";

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  phone: string | null;
  rate_per_hour: number | null;
  active: boolean;
  notes: string | null;
  access_level: string | null;
}

interface HoursEntry {
  id: string;
  date: string | null;
  hours: number;
  category: string | null;
  entry: string | null;
  exp_experiences: { title: string } | null;
}

export default function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [member, setMember] = useState<TeamMember | null>(null);
  const [hours, setHours] = useState<HoursEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [invited, setInvited] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/team/${id}`).then((r) => r.json()),
      fetch(`/api/admin/hours-log?employee_id=${id}`).then((r) => r.json()),
    ]).then(([m, h]) => { setMember(m); setHours(h || []); setLoading(false); });
  }, [id]);

  async function handleSave() {
    if (!member) return;
    setSaving(true);
    const { id: _id, ...fields } = member;
    await fetch(`/api/admin/team/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  async function handleDelete() {
    if (!confirm("Delete this team member?")) return;
    await fetch(`/api/admin/team/${id}`, { method: "DELETE" });
    router.push("/admin/team");
  }

  async function handleInvite() {
    if (!member?.email) { alert("Add an email and Save first, then send the invite."); return; }
    setInviting(true);
    const res = await fetch(`/api/admin/team/${id}/invite`, { method: "POST" });
    setInviting(false);
    if (res.ok) { setInvited(true); setTimeout(() => setInvited(false), 3000); }
    else { const j = await res.json().catch(() => ({})); alert(j.error || "Could not send the invite."); }
  }

  function update(field: string, value: unknown) {
    setMember((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  if (loading) return <div className="text-sm admin-faint">Loading...</div>;
  if (!member) return <div className="text-sm text-red-400">Team member not found</div>;

  const inputClass = "w-full px-4 py-2.5 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1.5";
  const totalHours = hours.reduce((s, h) => s + Number(h.hours || 0), 0);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/admin/team")} className="admin-faint transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold admin-heading">{member.name}</h1>
            <p className="text-sm admin-muted">{member.role || "Team Member"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleDelete} className="px-3 py-2 text-xs text-red-400/60 hover:text-red-400 transition-colors">Delete</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors">
            {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      <div className="max-w-[720px] space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelClass}>Name</label><input className={inputClass} value={member.name || ""} onChange={(e) => update("name", e.target.value)} /></div>
          <div><label className={labelClass}>Role</label><input className={inputClass} value={member.role || ""} onChange={(e) => update("role", e.target.value || null)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelClass}>Email</label><input className={inputClass} type="email" value={member.email || ""} onChange={(e) => update("email", e.target.value || null)} /></div>
          <div><label className={labelClass}>Phone</label><input className={inputClass} value={member.phone || ""} onChange={(e) => update("phone", e.target.value || null)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelClass}>Hourly Rate (€)</label><input className={inputClass} type="number" step="0.01" value={member.rate_per_hour || ""} onChange={(e) => update("rate_per_hour", e.target.value ? Number(e.target.value) : null)} /></div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={member.active || false} onChange={(e) => update("active", e.target.checked)} className="w-4 h-4 accent-[#0aa3c7]" />
              <span className="text-sm admin-muted">Active</span>
            </label>
          </div>
        </div>
        <div><label className={labelClass}>Notes</label>
          <textarea className={`${inputClass} min-h-[80px] resize-y`} value={member.notes || ""} onChange={(e) => update("notes", e.target.value || null)} />
        </div>

        {/* Access & login */}
        <div className="pt-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
          <h3 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase mb-3">Access &amp; login</h3>
          <div className="grid grid-cols-2 gap-4 items-start">
            <div>
              <label className={labelClass}>Access level</label>
              <select className={inputClass} value={normalizeLevel(member.access_level)} onChange={(e) => update("access_level", e.target.value)}>
                {ACCESS_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{ACCESS_LABELS[lvl]}</option>)}
              </select>
              <p className="text-[11px] admin-faint mt-1.5">Remember to <strong>Save</strong> after changing.</p>
            </div>
            <div>
              <label className={labelClass}>Login</label>
              <button onClick={handleInvite} disabled={inviting || !member.email}
                className="w-full px-4 py-2.5 border border-[#0aa3c7] text-[#0aa3c7] hover:bg-[#0aa3c7]/10 disabled:opacity-40 text-sm font-bold rounded-lg transition-colors">
                {inviting ? "Sending…" : invited ? "Invite sent ✓" : "Send login invite"}
              </button>
              <p className="text-[11px] admin-faint mt-1.5">Emails a one-time login link{member.email ? ` to ${member.email}` : " (add an email first)"}.</p>
            </div>
          </div>
        </div>

        {/* Hours Log */}
        <div className="pt-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
            <h3 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase">Hours Log</h3>
            <span className="text-xs admin-muted">{totalHours.toFixed(1)} total hrs</span>
          </div>
          {hours.length === 0 ? (
            <p className="text-sm admin-faint py-4">No hours logged</p>
          ) : (
            <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              <div className="grid grid-cols-[80px_50px_100px_1fr] gap-3 px-4 py-2.5 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Date</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Hrs</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Category</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Description</span>
              </div>
              {hours.slice(0, 20).map((h) => (
                <div key={h.id} className="grid grid-cols-[80px_50px_100px_1fr] gap-3 px-4 py-2.5" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                  <span className="text-xs admin-muted">{h.date ? new Date(h.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</span>
                  <span className="text-xs font-medium admin-heading">{h.hours}h</span>
                  <span className="text-xs admin-muted capitalize">{h.category || "—"}</span>
                  <span className="text-xs admin-faint truncate">{h.entry || h.exp_experiences?.title || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
