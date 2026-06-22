"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";
import { RowActions } from "@/components/row-actions";

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  phone: string | null;
  rate_per_hour: number | null;
  active: boolean;
  notes: string | null;
  total_hours: number;
  total_cost: number | null;
}

type SortDir = "asc" | "desc" | null;

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", width: "1fr", required: true },
  { key: "email", label: "Email", width: "160px" },
  { key: "phone", label: "Phone", width: "120px", defaultHidden: true },
  { key: "role", label: "Role", width: "120px" },
  { key: "rate_per_hour", label: "Rate/hr", width: "80px" },
  { key: "total_hours", label: "Hours", width: "70px" },
  { key: "total_cost", label: "Cost", width: "90px" },
  { key: "notes", label: "Notes", width: "150px", defaultHidden: true },
  { key: "active", label: "Active", width: "60px" },
  { key: "_actions", label: "", width: "70px", required: true },
];

const STORAGE_KEY = "np7-team-columns";

function compareValues(a: unknown, b: unknown, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return dir === "asc" ? 1 : -1;
  if (b == null) return dir === "asc" ? -1 : 1;
  const aNum = Number(a);
  const bNum = Number(b);
  if (!isNaN(aNum) && !isNaN(bNum)) return dir === "asc" ? aNum - bNum : bNum - aNum;
  const cmp = String(a).localeCompare(String(b));
  return dir === "asc" ? cmp : -cmp;
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(STORAGE_KEY, COLUMNS)
  );
  const [form, setForm] = useState({ name: "", email: "", role: "", phone: "", rate_per_hour: "", notes: "", role_ids: [] as string[] });
  const [roles, setRoles] = useState<{ id: string; name: string; system_key?: string | null }[]>([]);

  function fetchData() {
    fetch("/api/admin/team").then((r) => r.json()).then((d) => { setMembers(d || []); setLoading(false); });
  }

  useEffect(() => {
    fetchData();
    fetch("/api/admin/roles").then((r) => r.json()).then((d) => setRoles(d.roles ?? [])).catch(() => {});
  }, []);

  // New members default to the Manager built-in role.
  function openNew() {
    const mgr = roles.find((r) => r.system_key === "manager");
    setForm((f) => ({ ...f, role_ids: mgr ? [mgr.id] : [] }));
    setShowNew(true);
  }

  function handleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
      else setSortDir("asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = sortKey && sortDir
    ? [...members].sort((a, b) => compareValues(a[sortKey as keyof TeamMember], b[sortKey as keyof TeamMember], sortDir))
    : members;

  async function handleCreate() {
    const res = await fetch("/api/admin/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, rate_per_hour: form.rate_per_hour ? Number(form.rate_per_hour) : null }),
    });
    if (res.ok) { setShowNew(false); setForm({ name: "", email: "", role: "", phone: "", rate_per_hour: "", notes: "", role_ids: [] }); fetchData(); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this team member?")) return;
    await fetch(`/api/admin/team/${id}`, { method: "DELETE" });
    fetchData();
  }

  async function handleDuplicate(id: string) {
    await fetch(`/api/admin/team/${id}/duplicate`, { method: "POST" });
    fetchData();
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Team</h1>
          <p className="text-sm admin-muted">{members.length} member{members.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <ColumnToggle columns={COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} storageKey={STORAGE_KEY} />
          <button onClick={() => (showNew ? setShowNew(false) : openNew())} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">New Member</button>
        </div>
      </div>

      {showNew && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">New Team Member</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}>Name *</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className={labelClass}>Email</label><input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className={labelClass}>Phone</label><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className={labelClass}>Role <span className="admin-faint font-normal">(job title)</span></label><input className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
            <div><label className={labelClass}>Hourly Rate (€)</label><input className={inputClass} type="number" step="0.01" value={form.rate_per_hour} onChange={(e) => setForm({ ...form, rate_per_hour: e.target.value })} /></div>
            <div className="col-span-3"><label className={labelClass}>Access — role(s)</label>
              {roles.length === 0 ? (
                <p className="text-[11px] admin-faint">Roles load from Team › Roles…</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {roles.map((r) => {
                    const on = form.role_ids.includes(r.id);
                    return (
                      <button key={r.id} type="button" onClick={() => setForm((f) => ({ ...f, role_ids: on ? f.role_ids.filter((x) => x !== r.id) : [...f.role_ids, r.id] }))} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors" style={on ? { background: "var(--admin-accent)", color: "var(--admin-accent-contrast)", border: "1px solid transparent" } : { border: "1px solid var(--admin-border)" }}>
                        {on ? "✓ " : ""}{r.name}{r.system_key ? "" : ""}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="col-span-3"><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <p className="text-[11px] admin-faint mb-4 -mt-2">Pick the access role(s) — <strong>Owner</strong> / <strong>Manager</strong> are built-in; define more under <strong>Team › Roles</strong>. <strong>Role</strong> above is just a job-title label. After creating, open the member to send their login invite.</p>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!form.name} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg">Create</button>
            <button onClick={() => setShowNew(false)} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : members.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No team members yet</p></div>
      ) : (
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
          {/* Header */}
          <div className="grid gap-3 px-5 py-3 admin-surface" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}>
            {COLUMNS.filter((c) => c.required || visibleColumns.has(c.key)).map((col) =>
              col.key === "_actions" ? <span key={col.key} /> : (
                <SortableHeader key={col.key} label={col.label} sortKey={col.key} currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              )
            )}
          </div>

          {/* Rows */}
          {sorted.map((m) => (
            <div key={m.id} className="grid gap-3 px-5 py-3 transition-colors" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <Link href={`/admin/team/${m.id}`} className="text-sm font-medium admin-heading truncate hover:text-[#0aa3c7] transition-colors">{m.name}</Link>
              {visibleColumns.has("email") && <span className="text-xs admin-muted self-center truncate">{m.email || "—"}</span>}
              {visibleColumns.has("phone") && <span className="text-xs admin-muted self-center truncate">{m.phone || "—"}</span>}
              {visibleColumns.has("role") && <span className="text-xs admin-muted self-center">{m.role || "—"}</span>}
              {visibleColumns.has("rate_per_hour") && <span className="text-xs admin-muted self-center">{m.rate_per_hour ? `€${m.rate_per_hour}/h` : "—"}</span>}
              {visibleColumns.has("total_hours") && <span className="text-xs admin-muted self-center">{m.total_hours ? `${m.total_hours}h` : "—"}</span>}
              {visibleColumns.has("total_cost") && <span className="text-xs admin-muted self-center">{m.total_cost != null ? `€${m.total_cost.toLocaleString()}` : "—"}</span>}
              {visibleColumns.has("notes") && <span className="text-xs admin-faint self-center truncate" title={m.notes || ""}>{m.notes || "—"}</span>}
              {visibleColumns.has("active") && (
                <span className="self-center">{m.active ? <span className="text-green-400 text-xs">✓</span> : <span className="admin-faint text-xs">—</span>}</span>
              )}
              <RowActions onDuplicate={() => handleDuplicate(m.id)} onDelete={() => handleDelete(m.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
