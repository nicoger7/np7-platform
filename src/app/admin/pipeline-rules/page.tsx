"use client";

import { useState, useEffect } from "react";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";

interface PipelineRule {
  id: string;
  name: string;
  trigger: string | null;
  type: string | null;
  action: string | null;
  experience_id: string | null;
  days_after_trigger: number | null;
  active: boolean;
  notes: string | null;
  exp_experiences: { id: string; title: string } | null;
}

interface Experience { id: string; title: string; }

type SortDir = "asc" | "desc" | null;

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", width: "1fr", required: true },
  { key: "trigger_stage", label: "Trigger", width: "140px" },
  { key: "action", label: "Action", width: "120px" },
  { key: "days_after_trigger", label: "Delay", width: "60px" },
  { key: "active", label: "Active", width: "60px" },
  { key: "_actions", label: "", width: "50px", required: true },
];

const STORAGE_KEY = "np7-pipeline-rules-columns";

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

export default function PipelineRulesPage() {
  const [rules, setRules] = useState<PipelineRule[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(STORAGE_KEY, COLUMNS)
  );
  const [form, setForm] = useState({ name: "", trigger: "", type: "", action: "", experience_id: "", days_after_trigger: "", active: true, notes: "" });

  function fetchData() {
    Promise.all([
      fetch("/api/admin/pipeline-rules").then((r) => r.json()),
      fetch("/api/admin/experiences").then((r) => r.json()),
    ]).then(([r, e]) => {
      setRules(r || []);
      setExperiences((e.experiences || e || []).map((x: Record<string, string>) => ({ id: x.id, title: x.title })));
      setLoading(false);
    });
  }

  useEffect(() => { fetchData(); }, []);

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
    ? [...rules].sort((a, b) => {
        let aVal: unknown;
        let bVal: unknown;
        if (sortKey === "trigger_stage") { aVal = a.trigger; bVal = b.trigger; }
        else { aVal = a[sortKey as keyof PipelineRule]; bVal = b[sortKey as keyof PipelineRule]; }
        return compareValues(aVal, bVal, sortDir);
      })
    : rules;

  function startEdit(r: PipelineRule) {
    setEditId(r.id);
    setForm({ name: r.name, trigger: r.trigger || "", type: r.type || "", action: r.action || "", experience_id: r.experience_id || "", days_after_trigger: r.days_after_trigger?.toString() || "", active: r.active !== false, notes: r.notes || "" });
    setShowNew(false);
  }

  async function handleSave() {
    const body = { name: form.name, trigger: form.trigger || null, type: form.type || null, action: form.action || null, experience_id: form.experience_id || null, days_after_trigger: form.days_after_trigger ? Number(form.days_after_trigger) : null, active: form.active, notes: form.notes || null };
    if (editId) {
      await fetch(`/api/admin/pipeline-rules/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/admin/pipeline-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setShowNew(false); setEditId(null); fetchData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this rule?")) return;
    await fetch(`/api/admin/pipeline-rules/${id}`, { method: "DELETE" });
    fetchData();
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Pipeline Rules</h1>
          <p className="text-sm admin-muted">{rules.length} rule{rules.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <ColumnToggle columns={COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} storageKey={STORAGE_KEY} />
          <button onClick={() => { setShowNew(!showNew); setEditId(null); setForm({ name: "", trigger: "", type: "", action: "", experience_id: "", days_after_trigger: "", active: true, notes: "" }); }} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors">
            New Rule
          </button>
        </div>
      </div>

      {(showNew || editId) && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">{editId ? "Edit Rule" : "New Rule"}</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}>Name *</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className={labelClass}>Trigger Stage</label><input className={inputClass} value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })} placeholder="booking_confirmed..." /></div>
            <div><label className={labelClass}>Type</label><input className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="email, task..." /></div>
            <div><label className={labelClass}>Action</label><input className={inputClass} value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} placeholder="send_email, create_task..." /></div>
            <div><label className={labelClass}>Delay (days)</label><input className={inputClass} type="number" value={form.days_after_trigger} onChange={(e) => setForm({ ...form, days_after_trigger: e.target.value })} /></div>
            <div><label className={labelClass}>Experience</label>
              <select className={inputClass} value={form.experience_id} onChange={(e) => setForm({ ...form, experience_id: e.target.value })}>
                <option value="">All Experiences</option>
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
        <div className="py-16 text-center"><p className="text-sm admin-faint">No pipeline rules yet</p></div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          {/* Header */}
          <div className="grid gap-3 px-5 py-3 admin-surface" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}>
            {COLUMNS.filter((c) => c.required || visibleColumns.has(c.key)).map((col) =>
              col.key === "_actions" ? <span key={col.key} /> : (
                <SortableHeader key={col.key} label={col.label} sortKey={col.key} currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              )
            )}
          </div>

          {/* Rows */}
          {sorted.map((r) => (
            <div key={r.id} className="grid gap-3 px-5 py-3 cursor-pointer transition-colors" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              onClick={() => startEdit(r)}
            >
              {/* name — required */}
              <div className="min-w-0 self-center">
                <div className="text-sm font-medium admin-heading truncate">{r.name}</div>
                {r.exp_experiences && <div className="text-xs admin-faint truncate">{r.exp_experiences.title}</div>}
              </div>
              {visibleColumns.has("trigger_stage") && <span className="text-xs admin-muted self-center truncate">{r.trigger || "—"}</span>}
              {visibleColumns.has("action") && <span className="text-xs admin-muted self-center truncate">{r.action || r.type || "—"}</span>}
              {visibleColumns.has("days_after_trigger") && <span className="text-xs admin-muted self-center">{r.days_after_trigger != null ? `${r.days_after_trigger}d` : "—"}</span>}
              {visibleColumns.has("active") && <span className="self-center">{r.active ? <span className="text-green-400 text-xs">✓</span> : <span className="admin-faint text-xs">—</span>}</span>}
              {/* _actions — required */}
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
