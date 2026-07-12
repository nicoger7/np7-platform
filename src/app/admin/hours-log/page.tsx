"use client";

import { useState, useEffect } from "react";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";
import { editionOptionLabel } from "@/lib/edition-label";

interface HoursEntry {
  id: string;
  date: string | null;
  hours: number;
  category: string | null;
  entry: string | null;
  notes: string | null;
  is_general: boolean | null;
  processed_at: string | null;
  employee_id: string | null;
  experience_id: string | null;
  edition_id: string | null;
  booking_id: string | null;
  team_members: { id: string; name: string; rate_per_hour: number | null } | null;
  exp_experiences: { id: string; title: string } | null;
  booking: { id: string; name: string } | null;
}

function cost(e: HoursEntry): number | null {
  const rate = e.team_members?.rate_per_hour;
  return rate != null ? Number(e.hours || 0) * Number(rate) : null;
}

interface TeamMember { id: string; name: string; }
interface Experience { id: string; title: string; }

const CATEGORIES = ["coaching", "planning", "admin", "travel", "content", "other"];

type SortDir = "asc" | "desc" | null;

const COLUMNS: ColumnDef[] = [
  { key: "date", label: "Date", width: "80px", required: true },
  { key: "hours", label: "Hrs", width: "50px" },
  { key: "team_member", label: "Member", width: "120px" },
  { key: "cost", label: "Cost", width: "80px" },
  { key: "category", label: "Category", width: "100px" },
  { key: "experience", label: "Experience", width: "140px", defaultHidden: true },
  { key: "booking", label: "Booking", width: "130px", defaultHidden: true },
  { key: "is_general", label: "General", width: "70px", defaultHidden: true },
  { key: "processed_at", label: "Processed", width: "90px", defaultHidden: true },
  { key: "description", label: "Description", width: "1fr" },
  { key: "notes", label: "Notes", width: "140px", defaultHidden: true },
  { key: "_actions", label: "", width: "60px", required: true },
];

const STORAGE_KEY = "np7-hours-log-columns";

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

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

export default function HoursLogPage() {
  const [entries, setEntries] = useState<HoursEntry[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [editions, setEditions] = useState<{ id: string; experience_id: string; year: number | null; label: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterExp, setFilterExp] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(STORAGE_KEY, COLUMNS)
  );
  const [form, setForm] = useState({ date: "", hours: "", category: "", entry: "", employee_id: "", experience_id: "", edition_id: "", notes: "", is_general: false, processed_at: "" });
  // Current user: hours auto-attach to them; non-managers can't pick anyone else.
  const [me, setMe] = useState<{ id: string; name: string; canManageHours: boolean } | null>(null);
  useEffect(() => {
    fetch("/api/admin/me").then((r) => r.json()).then((d) => { if (d?.member) setMe({ id: d.member.id, name: d.member.name, canManageHours: !!d.canManageHours }); }).catch(() => {});
  }, []);
  const blankForm = () => ({ date: "", hours: "", category: "", entry: "", employee_id: me?.id ?? "", experience_id: "", edition_id: "", notes: "", is_general: false, processed_at: "" });

  // Auto-tracked active time the member hasn't logged yet (suggestion, never auto-logged).
  const [pending, setPending] = useState<{ date: string; active_seconds: number }[]>([]);
  const [fromSuggestion, setFromSuggestion] = useState<string | null>(null);
  const roundQ = (sec: number) => Math.round((sec / 3600) * 4) / 4;
  function fetchPending() {
    fetch("/api/admin/active-time").then((r) => r.json()).then((d) => setPending(Array.isArray(d?.pending) ? d.pending : [])).catch(() => {});
  }
  useEffect(() => { fetchPending(); }, []);
  function logSuggestion(p: { date: string; active_seconds: number }) {
    setEditId(null); setShowNew(true); setFromSuggestion(p.date);
    setForm({ ...blankForm(), date: p.date, hours: String(roundQ(p.active_seconds)) });
  }
  async function dismissSuggestion(date: string) {
    await fetch("/api/admin/active-time", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date }) }).catch(() => {});
    fetchPending();
  }

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
      setEntries(Array.isArray(h) ? h : []);
      setTeam(Array.isArray(t) ? t : []); // non-managers can't read /api/admin/team → keep it an array
      setExperiences((e.experiences || e || []).map((x: Record<string, string>) => ({ id: x.id, title: x.title })));
      setLoading(false);
    });
  }

  useEffect(() => { fetchData(); }, [filterEmployee, filterExp]);
  useEffect(() => {
    fetch("/api/admin/editions").then((r) => r.json()).then((d) => setEditions(Array.isArray(d) ? d : []));
  }, []);

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
    ? [...entries].sort((a, b) => {
        let aVal: unknown;
        let bVal: unknown;
        if (sortKey === "team_member") { aVal = a.team_members?.name; bVal = b.team_members?.name; }
        else if (sortKey === "cost") { aVal = cost(a); bVal = cost(b); }
        else if (sortKey === "experience") { aVal = a.exp_experiences?.title; bVal = b.exp_experiences?.title; }
        else if (sortKey === "booking") { aVal = a.booking?.name; bVal = b.booking?.name; }
        else { aVal = a[sortKey as keyof HoursEntry]; bVal = b[sortKey as keyof HoursEntry]; }
        return compareValues(aVal, bVal, sortDir);
      })
    : entries;

  function startEdit(e: HoursEntry) {
    setEditId(e.id);
    setForm({ date: e.date || "", hours: e.hours?.toString() || "", category: e.category || "", entry: e.entry || "", employee_id: e.employee_id || "", experience_id: e.experience_id || "", edition_id: e.edition_id || "", notes: e.notes || "", is_general: e.is_general ?? false, processed_at: e.processed_at || "" });
    setShowNew(false);
  }

  async function handleSave() {
    // date + hours + entry are NOT NULL in the DB — don't let a silent 400 eat the log
    if (!form.date) { alert("Pick a date for this entry."); return; }
    if (!form.hours || Number(form.hours) <= 0) { alert("Enter the hours worked."); return; }
    const body = { date: form.date, hours: Number(form.hours), category: form.category || null, entry: form.entry.trim() || "Untitled", employee_id: form.employee_id || null, experience_id: form.experience_id || null, edition_id: form.experience_id ? (form.edition_id || null) : null, notes: form.notes || null, is_general: form.is_general, processed_at: form.processed_at || null };
    const res = editId
      ? await fetch(`/api/admin/hours-log/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch("/api/admin/hours-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      const j = await res.json().catch(() => ({} as { error?: string }));
      alert(j.error || "Couldn't save this entry — please try again.");
      return; // keep the form open so nothing typed is lost
    }
    setShowNew(false); setEditId(null); fetchData();
    if (fromSuggestion && !editId) {
      await fetch("/api/admin/active-time", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: fromSuggestion }) }).catch(() => {});
      setFromSuggestion(null); fetchPending();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this entry?")) return;
    await fetch(`/api/admin/hours-log/${id}`, { method: "DELETE" });
    fetchData();
  }

  const totalHours = entries.reduce((s, e) => s + Number(e.hours || 0), 0);
  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Hours Log</h1>
          <p className="text-sm admin-muted">{entries.length} entries · {totalHours.toFixed(1)} total hours</p>
        </div>
        <div className="flex items-center gap-3">
          <ColumnToggle columns={COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} storageKey={STORAGE_KEY} />
          <button onClick={() => { setShowNew(!showNew); setEditId(null); setForm(blankForm()); }} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
            Log Hours
          </button>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="mb-5 rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <p className="text-xs admin-muted mb-2">⏱ Active time tracked in the admin that you haven&apos;t logged yet — review, attribute &amp; confirm (nothing is logged until you do):</p>
          <div className="flex flex-col gap-1.5">
            {pending.map((p) => {
              const now = new Date();
              const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
              return (
                <div key={p.date} className="flex items-center justify-between gap-3">
                  <span className="text-sm admin-heading">{p.date === localToday ? "Today" : formatDate(p.date)} · <b>{roundQ(p.active_seconds).toFixed(2)} h</b> active</span>
                  <span className="flex gap-2">
                    <button onClick={() => logSuggestion(p)} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] hover:opacity-90 transition-opacity">Log it</button>
                    <button onClick={() => dismissSuggestion(p.date)} className="px-3 py-1.5 text-xs admin-faint hover:admin-muted transition-colors">Dismiss</button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List filters — hidden while the Log Hours form is open (the form has its
          own Experience field; showing both at once looked like a duplicate). */}
      {!(showNew || editId) && (
      <div className="flex gap-3 mb-5">
        {me?.canManageHours && (
          <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
            <option value="">All Team Members</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <select value={filterExp} onChange={(e) => setFilterExp(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">All Experiences</option>
          {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        {(filterEmployee || filterExp) && <button onClick={() => { setFilterEmployee(""); setFilterExp(""); }} className="text-xs admin-faint hover:admin-muted">Clear</button>}
      </div>
      )}

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
              {me?.canManageHours ? (
                <select className={inputClass} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                  <option value="">—</option>
                  {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              ) : (
                <input className={`${inputClass} opacity-70`} value={me?.name ?? "You"} disabled title="Hours log automatically to your account" />
              )}
            </div>
            <div><label className={labelClass}>Experience</label>
              <select className={inputClass} value={form.experience_id} onChange={(e) => setForm({ ...form, experience_id: e.target.value, edition_id: "" })}>
                <option value="">—</option>
                {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Edition <span className="admin-faint">(optional)</span></label>
              <select className={inputClass} value={form.edition_id} onChange={(e) => setForm({ ...form, edition_id: e.target.value })} disabled={!form.experience_id}>
                <option value="">— experience-wide</option>
                {editions.filter((ed) => ed.experience_id === form.experience_id).map((ed) => <option key={ed.id} value={ed.id}>{editionOptionLabel(ed)}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Description</label><input className={inputClass} value={form.entry} onChange={(e) => setForm({ ...form, entry: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div><label className={labelClass}>Processed on</label><input className={inputClass} type="date" value={form.processed_at} onChange={(e) => setForm({ ...form, processed_at: e.target.value })} /></div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_general} onChange={(e) => setForm({ ...form, is_general: e.target.checked })} className="w-4 h-4 accent-[#0aa3c7]" />
                <span className="text-sm admin-muted">General (not experience-specific)</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!form.hours} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg">{editId ? "Update" : "Log"}</button>
            <button onClick={() => { setShowNew(false); setEditId(null); }} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No hours logged</p></div>
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
          {sorted.map((e) => (
            <div key={e.id} className="grid gap-3 px-5 py-3 cursor-pointer transition-colors" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(ev) => (ev.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(ev) => (ev.currentTarget.style.backgroundColor = "transparent")}
              onClick={() => startEdit(e)}
            >
              {/* date — required */}
              <span className="text-xs admin-muted self-center">{formatDate(e.date)}</span>
              {visibleColumns.has("hours") && (
                <span className="text-xs font-medium admin-heading self-center">{e.hours}h</span>
              )}
              {visibleColumns.has("team_member") && (
                <span className="text-xs admin-muted self-center truncate">{e.team_members?.name || "—"}</span>
              )}
              {visibleColumns.has("cost") && (
                <span className="text-xs self-center" title="hours × rate">{cost(e) != null ? `€${cost(e)!.toLocaleString()}` : "—"}</span>
              )}
              {visibleColumns.has("category") && (
                <span className="text-xs admin-muted self-center capitalize">{e.category || "—"}</span>
              )}
              {visibleColumns.has("experience") && (
                <span className="text-xs admin-muted self-center truncate">{e.exp_experiences?.title || (e.is_general ? "General" : "—")}</span>
              )}
              {visibleColumns.has("booking") && (
                <span className="text-xs admin-muted self-center truncate">{e.booking?.name || "—"}</span>
              )}
              {visibleColumns.has("is_general") && (
                <span className="self-center">{e.is_general ? <span className="text-green-400 text-xs">✓</span> : <span className="admin-faint text-xs">—</span>}</span>
              )}
              {visibleColumns.has("processed_at") && (
                <span className="text-xs admin-faint self-center">{formatDate(e.processed_at)}</span>
              )}
              {visibleColumns.has("description") && (
                <span className="text-xs admin-faint self-center truncate">{e.entry || "—"}</span>
              )}
              {visibleColumns.has("notes") && (
                <span className="text-xs admin-faint self-center truncate" title={e.notes || ""}>{e.notes || "—"}</span>
              )}
              {/* _actions — required */}
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
