"use client";

import { useState, useEffect } from "react";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";
import { RowActions } from "@/components/row-actions";

interface ExpCost {
  id: string;
  item: string;
  experience_id: string | null;
  edition_id: string | null;
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

type SortDir = "asc" | "desc" | null;

const COLUMNS: ColumnDef[] = [
  { key: "item", label: "Item", width: "1fr", required: true },
  { key: "experience", label: "Experience", width: "160px" },
  { key: "estimated_amount", label: "Estimated", width: "100px" },
  { key: "actual_amount", label: "Actual", width: "100px" },
  { key: "status", label: "Status", width: "80px" },
  { key: "_actions", label: "", width: "80px", required: true },
];

const STORAGE_KEY = "np7-exp-costs-columns";

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

const statusColor = (s: string | null) => {
  switch (s) {
    case "confirmed": return "bg-green-500/15 text-green-400";
    case "cancelled": return "bg-red-500/15 text-red-400";
    case "unlisted": return "bg-gray-500/15 text-gray-400";
    default: return "bg-amber-500/15 text-amber-400";
  }
};

export default function ExpCostsPage() {
  const [costs, setCosts] = useState<ExpCost[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [editions, setEditions] = useState<{ id: string; experience_id: string; year: number | null; label: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterExp, setFilterExp] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(STORAGE_KEY, COLUMNS)
  );
  const [form, setForm] = useState({ item: "", experience_id: "", edition_id: "", estimated_amount: "", actual_amount: "", status: "estimate", date: "", notes: "" });

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
    ? [...costs].sort((a, b) => {
        let aVal: unknown;
        let bVal: unknown;
        if (sortKey === "experience") {
          aVal = a.exp_experiences?.title;
          bVal = b.exp_experiences?.title;
        } else {
          aVal = a[sortKey as keyof ExpCost];
          bVal = b[sortKey as keyof ExpCost];
        }
        return compareValues(aVal, bVal, sortDir);
      })
    : costs;

  function startEdit(c: ExpCost) {
    setEditId(c.id);
    setForm({ item: c.item, experience_id: c.experience_id || "", edition_id: c.edition_id || "", estimated_amount: c.estimated_amount?.toString() || "", actual_amount: c.actual_amount?.toString() || "", status: c.status || "estimate", date: c.date || "", notes: c.notes || "" });
    setShowNew(false);
  }

  async function handleSave() {
    const body = { item: form.item, experience_id: form.experience_id || null, edition_id: form.experience_id ? (form.edition_id || null) : null, estimated_amount: form.estimated_amount ? Number(form.estimated_amount) : null, actual_amount: form.actual_amount ? Number(form.actual_amount) : null, status: form.status || null, date: form.date || null, notes: form.notes || null };
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

  async function handleDuplicate(id: string) {
    await fetch(`/api/admin/exp-costs/${id}/duplicate`, { method: "POST" });
    fetchData();
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Experience Costs</h1>
          <p className="text-sm admin-muted">{costs.length} cost item{costs.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <ColumnToggle columns={COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} storageKey={STORAGE_KEY} />
          <button onClick={() => { setShowNew(!showNew); setEditId(null); setForm({ item: "", experience_id: "", edition_id: "", estimated_amount: "", actual_amount: "", status: "estimate", date: "", notes: "" }); }} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
            New Cost
          </button>
        </div>
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
              <select className={inputClass} value={form.experience_id} onChange={(e) => setForm({ ...form, experience_id: e.target.value, edition_id: "" })}>
                <option value="">—</option>
                {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Edition <span className="admin-faint">(optional)</span></label>
              <select className={inputClass} value={form.edition_id} onChange={(e) => setForm({ ...form, edition_id: e.target.value })} disabled={!form.experience_id}>
                <option value="">— all / experience-wide</option>
                {editions.filter((ed) => ed.experience_id === form.experience_id).map((ed) => <option key={ed.id} value={ed.id}>{ed.label || ed.year}</option>)}
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
            <button onClick={handleSave} disabled={!form.item} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">{editId ? "Update" : "Create"}</button>
            <button onClick={() => { setShowNew(false); setEditId(null); }} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : costs.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No costs yet</p></div>
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
          {sorted.map((c) => (
            <div key={c.id} className="grid gap-3 px-5 py-3 cursor-pointer transition-colors" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              onClick={() => startEdit(c)}
            >
              {/* item — required */}
              <div className="min-w-0">
                <div className="text-sm font-medium admin-heading truncate">{c.item}</div>
                {c.date && <div className="text-xs admin-faint">{formatDate(c.date)}</div>}
              </div>
              {visibleColumns.has("experience") && (
                <span className="text-xs admin-muted self-center truncate">{c.exp_experiences?.title || "—"}</span>
              )}
              {visibleColumns.has("estimated_amount") && (
                <span className="text-xs admin-muted self-center">{c.estimated_amount ? `€${Number(c.estimated_amount).toLocaleString()}` : "—"}</span>
              )}
              {visibleColumns.has("actual_amount") && (
                <span className={`text-xs self-center font-medium ${c.actual_amount ? "text-green-400" : "admin-faint"}`}>{c.actual_amount ? `€${Number(c.actual_amount).toLocaleString()}` : "—"}</span>
              )}
              {visibleColumns.has("status") && (
                <span className="self-center">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${statusColor(c.status)}`}>{c.status || "—"}</span>
                </span>
              )}
              {/* _actions — required */}
              <RowActions onDuplicate={() => handleDuplicate(c.id)} onDelete={() => handleDelete(c.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
