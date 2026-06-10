"use client";

import { useState, useEffect } from "react";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";

interface Scenario {
  id: string;
  name: string;
  experience_id: string | null;
  edition_id: string | null;
  assumptions: string | null;
  num_beginner: number | null;
  num_mixed: number | null;
  num_pro: number | null;
  beginner_package_id: string | null;
  mixed_package_id: string | null;
  pro_package_id: string | null;
  projected_revenue: number | null;
  projected_costs: number | null;
  projected_profit: number | null;
  total_revenue: number | null;
  margin_pct: number | null;
  notes: string | null;
  exp_experiences: { id: string; title: string } | null;
}

interface Experience { id: string; title: string; }
interface Pkg { id: string; name: string; }

function money(n: number | null | undefined) {
  return n != null ? `€${Number(n).toLocaleString()}` : "—";
}

type SortDir = "asc" | "desc" | null;

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", width: "1fr", required: true },
  { key: "experience", label: "Experience", width: "150px" },
  { key: "num_beginner", label: "Beg", width: "50px", defaultHidden: true },
  { key: "num_mixed", label: "Mix", width: "50px", defaultHidden: true },
  { key: "num_pro", label: "Pro", width: "50px", defaultHidden: true },
  { key: "total_revenue", label: "Calc Rev", width: "100px" },
  { key: "projected_revenue", label: "Proj Rev", width: "100px", defaultHidden: true },
  { key: "projected_costs", label: "Costs", width: "100px" },
  { key: "projected_profit", label: "Profit", width: "100px" },
  { key: "margin_pct", label: "Margin %", width: "80px" },
  { key: "notes", label: "Notes", width: "160px", defaultHidden: true },
  { key: "_actions", label: "", width: "60px", required: true },
];

const STORAGE_KEY = "np7-scenario-planner-columns";

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

export default function ScenarioPlannerPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(STORAGE_KEY, COLUMNS)
  );
  const [form, setForm] = useState({ name: "", experience_id: "", assumptions: "", num_beginner: "", num_mixed: "", num_pro: "", beginner_package_id: "", mixed_package_id: "", pro_package_id: "", projected_revenue: "", projected_costs: "", projected_profit: "", notes: "" });

  function fetchData() {
    Promise.all([
      fetch("/api/admin/scenario-planner").then((r) => r.json()),
      fetch("/api/admin/experiences").then((r) => r.json()),
      fetch("/api/admin/packages").then((r) => r.json()),
    ]).then(([s, e, p]) => {
      setScenarios(s || []);
      setExperiences((e.experiences || e || []).map((x: Record<string, string>) => ({ id: x.id, title: x.title })));
      setPackages((Array.isArray(p) ? p : []).map((x: Record<string, string>) => ({ id: x.id, name: x.name })));
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
    ? [...scenarios].sort((a, b) => {
        let aVal: unknown;
        let bVal: unknown;
        if (sortKey === "experience") { aVal = a.exp_experiences?.title; bVal = b.exp_experiences?.title; }
        else { aVal = a[sortKey as keyof Scenario]; bVal = b[sortKey as keyof Scenario]; }
        return compareValues(aVal, bVal, sortDir);
      })
    : scenarios;

  function startEdit(s: Scenario) {
    setEditId(s.id);
    setForm({ name: s.name, experience_id: s.experience_id || "", assumptions: s.assumptions || "", num_beginner: s.num_beginner?.toString() || "", num_mixed: s.num_mixed?.toString() || "", num_pro: s.num_pro?.toString() || "", beginner_package_id: s.beginner_package_id || "", mixed_package_id: s.mixed_package_id || "", pro_package_id: s.pro_package_id || "", projected_revenue: s.projected_revenue?.toString() || "", projected_costs: s.projected_costs?.toString() || "", projected_profit: s.projected_profit?.toString() || "", notes: s.notes || "" });
    setShowNew(false);
  }

  async function handleSave() {
    const numOrNull = (v: string) => (v ? Number(v) : null);
    const body = {
      name: form.name, experience_id: form.experience_id || null, assumptions: form.assumptions || null,
      num_beginner: numOrNull(form.num_beginner), num_mixed: numOrNull(form.num_mixed), num_pro: numOrNull(form.num_pro),
      beginner_package_id: form.beginner_package_id || null, mixed_package_id: form.mixed_package_id || null, pro_package_id: form.pro_package_id || null,
      projected_revenue: numOrNull(form.projected_revenue),
      projected_costs: numOrNull(form.projected_costs),
      projected_profit: numOrNull(form.projected_profit),
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
  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);

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
        <div className="flex items-center gap-3">
          <ColumnToggle columns={COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} storageKey={STORAGE_KEY} />
          <button onClick={() => { setShowNew(!showNew); setEditId(null); setForm({ name: "", experience_id: "", assumptions: "", num_beginner: "", num_mixed: "", num_pro: "", beginner_package_id: "", mixed_package_id: "", pro_package_id: "", projected_revenue: "", projected_costs: "", projected_profit: "", notes: "" }); }} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors">
            New Scenario
          </button>
        </div>
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
          {/* Spot counts × package → drives the computed revenue */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}># Beginner</label><input className={inputClass} type="number" value={form.num_beginner} onChange={(e) => setForm({ ...form, num_beginner: e.target.value })} /></div>
            <div><label className={labelClass}># Mixed</label><input className={inputClass} type="number" value={form.num_mixed} onChange={(e) => setForm({ ...form, num_mixed: e.target.value })} /></div>
            <div><label className={labelClass}># Pro</label><input className={inputClass} type="number" value={form.num_pro} onChange={(e) => setForm({ ...form, num_pro: e.target.value })} /></div>
            <div><label className={labelClass}>Beginner package</label><select className={inputClass} value={form.beginner_package_id} onChange={(e) => setForm({ ...form, beginner_package_id: e.target.value })}><option value="">—</option>{packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label className={labelClass}>Mixed package</label><select className={inputClass} value={form.mixed_package_id} onChange={(e) => setForm({ ...form, mixed_package_id: e.target.value })}><option value="">—</option>{packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div><label className={labelClass}>Pro package</label><select className={inputClass} value={form.pro_package_id} onChange={(e) => setForm({ ...form, pro_package_id: e.target.value })}><option value="">—</option>{packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}>Projected Revenue (€) <span className="admin-faint">override</span></label><input className={inputClass} type="number" value={form.projected_revenue} onChange={(e) => setForm({ ...form, projected_revenue: e.target.value })} /></div>
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
          {/* Header */}
          <div className="grid gap-3 px-5 py-3 admin-surface" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}>
            {COLUMNS.filter((c) => c.required || visibleColumns.has(c.key)).map((col) =>
              col.key === "_actions" ? <span key={col.key} /> : (
                <SortableHeader key={col.key} label={col.label} sortKey={col.key} currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              )
            )}
          </div>

          {/* Rows */}
          {sorted.map((s) => {
            const p = profit(s);
            return (
              <div key={s.id} className="grid gap-3 px-5 py-3 cursor-pointer transition-colors" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                onClick={() => startEdit(s)}
              >
                {/* name — required */}
                <div className="min-w-0 self-center">
                  <div className="text-sm font-medium admin-heading truncate">{s.name}</div>
                  {s.assumptions && <div className="text-xs admin-faint truncate">{s.assumptions}</div>}
                </div>
                {visibleColumns.has("experience") && <span className="text-xs admin-muted self-center truncate">{s.exp_experiences?.title || "—"}</span>}
                {visibleColumns.has("num_beginner") && <span className="text-xs admin-muted self-center">{s.num_beginner ?? "—"}</span>}
                {visibleColumns.has("num_mixed") && <span className="text-xs admin-muted self-center">{s.num_mixed ?? "—"}</span>}
                {visibleColumns.has("num_pro") && <span className="text-xs admin-muted self-center">{s.num_pro ?? "—"}</span>}
                {visibleColumns.has("total_revenue") && <span className="text-xs admin-muted self-center">{money(s.total_revenue)}</span>}
                {visibleColumns.has("projected_revenue") && <span className="text-xs admin-muted self-center">{money(s.projected_revenue)}</span>}
                {visibleColumns.has("projected_costs") && <span className="text-xs admin-muted self-center">{money(s.projected_costs)}</span>}
                {visibleColumns.has("projected_profit") && (
                  <span className={`text-xs self-center font-medium ${p && p > 0 ? "text-green-400" : p && p < 0 ? "text-red-400" : "admin-muted"}`}>{p !== null && p !== undefined ? money(Number(p)) : "—"}</span>
                )}
                {visibleColumns.has("margin_pct") && <span className={`text-xs self-center font-medium ${s.margin_pct == null ? "admin-faint" : s.margin_pct < 0 ? "text-red-400" : "text-green-400"}`}>{s.margin_pct != null ? `${s.margin_pct}%` : "—"}</span>}
                {visibleColumns.has("notes") && <span className="text-xs admin-faint self-center truncate" title={s.notes || ""}>{s.notes || "—"}</span>}
                {/* _actions — required */}
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
