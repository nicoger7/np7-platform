"use client";

import { useState, useEffect } from "react";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";
import { RowActions } from "@/components/row-actions";

interface PipelineRule {
  id: string;
  name: string;
  trigger: string | null;
  type: string | null;
  action: string | null;
  status: string | null;
  language: string[] | null;
  subject_line: string | null;
  stop_if: string[] | null;
  tags: string[] | null;
  experience_id: string | null;
  days_after_trigger: number | null;
  active: boolean;
  notes: string | null;
  exp_experiences: { id: string; title: string } | null;
}

function arr(x: string[] | null) {
  return x && x.length ? x.join(", ") : "—";
}

interface Experience { id: string; title: string; }

type SortDir = "asc" | "desc" | null;

// Order trigger stages along the booking lifecycle (heuristic on the free-text trigger).
function stageRank(trigger: string | null): number {
  const t = (trigger || "").toLowerCase();
  if (t.includes("lead") || t.includes("enquir") || t.includes("new")) return 0;
  if (t.includes("reservation") || t.includes("downpayment") || t.includes("deposit")) return 1;
  if (t.includes("balance") || t.includes("final") || t.includes("invoice")) return 2;
  if (t.includes("pre-trip") || t.includes("pre trip") || t.includes("before") || t.includes("week")) return 3;
  if (t.includes("post") || t.includes("after") || t.includes("review") || t.includes("thank")) return 4;
  return 2.5;
}

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", width: "1fr", required: true },
  { key: "experience", label: "Experience", width: "140px", defaultHidden: true },
  { key: "trigger_stage", label: "Trigger", width: "140px" },
  { key: "type", label: "Type", width: "90px", defaultHidden: true },
  { key: "action", label: "Action", width: "120px" },
  { key: "status", label: "Status", width: "90px", defaultHidden: true },
  { key: "subject_line", label: "Subject", width: "160px", defaultHidden: true },
  { key: "language", label: "Language", width: "100px", defaultHidden: true },
  { key: "stop_if", label: "Stop If", width: "120px", defaultHidden: true },
  { key: "tags", label: "Tags", width: "120px", defaultHidden: true },
  { key: "days_after_trigger", label: "Delay", width: "60px" },
  { key: "notes", label: "Notes", width: "160px", defaultHidden: true },
  { key: "active", label: "Active", width: "60px" },
  { key: "_actions", label: "", width: "70px", required: true },
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
  const [groupView, setGroupView] = useState(true);
  const [scope, setScope] = useState(""); // "" all · "global" · experience id
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(STORAGE_KEY, COLUMNS)
  );
  const [form, setForm] = useState({ name: "", trigger: "", type: "", action: "", status: "", subject_line: "", language: "", stop_if: "", tags: "", experience_id: "", days_after_trigger: "", active: true, notes: "" });

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

  const scopedRules = scope === "global"
    ? rules.filter((r) => !r.experience_id)
    : scope
      ? rules.filter((r) => r.experience_id === scope)
      : rules;

  // Timeline groups: by trigger, ordered by lifecycle stage then delay.
  const groups = Array.from(
    scopedRules.reduce((m, r) => {
      const key = r.trigger || "(no trigger)";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
      return m;
    }, new Map<string, PipelineRule[]>())
  ).map(([trigger, items]) => ({
    trigger,
    items: items.sort((a, b) => (a.days_after_trigger ?? 0) - (b.days_after_trigger ?? 0)),
  })).sort((a, b) => stageRank(a.trigger) - stageRank(b.trigger) || a.trigger.localeCompare(b.trigger));

  const sorted = sortKey && sortDir
    ? [...scopedRules].sort((a, b) => {
        let aVal: unknown;
        let bVal: unknown;
        if (sortKey === "trigger_stage") { aVal = a.trigger; bVal = b.trigger; }
        else if (sortKey === "experience") { aVal = a.exp_experiences?.title; bVal = b.exp_experiences?.title; }
        else if (sortKey === "language" || sortKey === "stop_if" || sortKey === "tags") {
          aVal = (a[sortKey] || []).join(","); bVal = (b[sortKey] || []).join(",");
        }
        else { aVal = a[sortKey as keyof PipelineRule]; bVal = b[sortKey as keyof PipelineRule]; }
        return compareValues(aVal, bVal, sortDir);
      })
    : scopedRules;

  function startEdit(r: PipelineRule) {
    setEditId(r.id);
    setForm({ name: r.name, trigger: r.trigger || "", type: r.type || "", action: r.action || "", status: r.status || "", subject_line: r.subject_line || "", language: (r.language || []).join(", "), stop_if: (r.stop_if || []).join(", "), tags: (r.tags || []).join(", "), experience_id: r.experience_id || "", days_after_trigger: r.days_after_trigger?.toString() || "", active: r.active !== false, notes: r.notes || "" });
    setShowNew(false);
  }

  async function handleSave() {
    const toArr = (s: string) => { const a = s.split(",").map((x) => x.trim()).filter(Boolean); return a.length ? a : null; };
    const body = { name: form.name, trigger: form.trigger || null, type: form.type || null, action: form.action || null, status: form.status || null, subject_line: form.subject_line || null, language: toArr(form.language), stop_if: toArr(form.stop_if), tags: toArr(form.tags), experience_id: form.experience_id || null, days_after_trigger: form.days_after_trigger ? Number(form.days_after_trigger) : null, active: form.active, notes: form.notes || null };
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

  async function handleDuplicate(id: string) {
    await fetch(`/api/admin/pipeline-rules/${id}/duplicate`, { method: "POST" });
    fetchData();
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Email Rules</h1>
          <p className="text-sm admin-muted">{rules.length} automated email{rules.length !== 1 ? "s" : ""} across the booking lifecycle</p>
        </div>
        <div className="flex items-center gap-3">
          <ColumnToggle columns={COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} storageKey={STORAGE_KEY} />
          <button onClick={() => { setShowNew(!showNew); setEditId(null); setForm({ name: "", trigger: "", type: "", action: "", status: "", subject_line: "", language: "", stop_if: "", tags: "", experience_id: "", days_after_trigger: "", active: true, notes: "" }); }} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors">
            New Rule
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex items-center rounded-lg overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          <button onClick={() => setGroupView(true)} className={`px-3 py-1.5 text-xs font-medium ${groupView ? "bg-[#0aa3c7]/15 text-[#0aa3c7]" : "admin-muted"}`}>Timeline</button>
          <button onClick={() => setGroupView(false)} className={`px-3 py-1.5 text-xs font-medium ${!groupView ? "bg-[#0aa3c7]/15 text-[#0aa3c7]" : "admin-muted"}`}>Table</button>
        </div>
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="admin-input text-xs px-3 py-1.5 rounded-lg">
          <option value="">All rules</option>
          <option value="global">Global only</option>
          {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <span className="text-xs admin-faint">{scopedRules.length} shown</span>
        <span className="text-[11px] admin-faint ml-auto">Drives the email cron — edit carefully.</span>
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
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}>Status</label><input className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} /></div>
            <div className="col-span-2"><label className={labelClass}>Subject line</label><input className={inputClass} value={form.subject_line} onChange={(e) => setForm({ ...form, subject_line: e.target.value })} /></div>
            <div><label className={labelClass}>Language <span className="admin-faint">(comma-sep)</span></label><input className={inputClass} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="EN, DE" /></div>
            <div><label className={labelClass}>Stop if <span className="admin-faint">(comma-sep)</span></label><input className={inputClass} value={form.stop_if} onChange={(e) => setForm({ ...form, stop_if: e.target.value })} /></div>
            <div><label className={labelClass}>Tags <span className="admin-faint">(comma-sep)</span></label><input className={inputClass} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></div>
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
      ) : scopedRules.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No rules match this filter</p></div>
      ) : groupView ? (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.trigger}>
              <div className="flex items-baseline gap-2 mb-2">
                <h2 className="text-sm font-bold admin-heading">{g.trigger}</h2>
                <span className="text-[11px] admin-faint">{g.items.length} rule{g.items.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
                {g.items.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 px-4 py-2.5 text-xs transition-colors"
                    style={{ borderBottom: "1px solid var(--admin-border)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <span className="w-14 text-right font-mono admin-faint shrink-0">+{r.days_after_trigger ?? 0}d</span>
                    <button onClick={() => startEdit(r)} className="flex-1 text-left admin-heading truncate hover:text-[#0aa3c7]">{r.name}</button>
                    <span className="admin-faint truncate max-w-[140px] hidden sm:block">{r.exp_experiences?.title || "Global"}</span>
                    <span className="admin-faint w-12 hidden sm:block">{(r.language || []).join("/")}</span>
                    <span className={`w-10 text-right ${r.active !== false ? "text-green-400" : "admin-faint"}`}>{r.active !== false ? "on" : "off"}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
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
              {visibleColumns.has("experience") && <span className="text-xs admin-muted self-center truncate">{r.exp_experiences?.title || "All"}</span>}
              {visibleColumns.has("trigger_stage") && <span className="text-xs admin-muted self-center truncate">{r.trigger || "—"}</span>}
              {visibleColumns.has("type") && <span className="text-xs admin-muted self-center truncate">{r.type || "—"}</span>}
              {visibleColumns.has("action") && <span className="text-xs admin-muted self-center truncate">{r.action || r.type || "—"}</span>}
              {visibleColumns.has("status") && <span className="text-xs admin-muted self-center truncate">{r.status || "—"}</span>}
              {visibleColumns.has("subject_line") && <span className="text-xs admin-muted self-center truncate" title={r.subject_line || ""}>{r.subject_line || "—"}</span>}
              {visibleColumns.has("language") && <span className="text-xs admin-muted self-center truncate">{arr(r.language)}</span>}
              {visibleColumns.has("stop_if") && <span className="text-xs admin-muted self-center truncate">{arr(r.stop_if)}</span>}
              {visibleColumns.has("tags") && <span className="text-xs admin-muted self-center truncate">{arr(r.tags)}</span>}
              {visibleColumns.has("days_after_trigger") && <span className="text-xs admin-muted self-center">{r.days_after_trigger != null ? `${r.days_after_trigger}d` : "—"}</span>}
              {visibleColumns.has("notes") && <span className="text-xs admin-faint self-center truncate" title={r.notes || ""}>{r.notes || "—"}</span>}
              {visibleColumns.has("active") && <span className="self-center">{r.active ? <span className="text-green-400 text-xs">✓</span> : <span className="admin-faint text-xs">—</span>}</span>}
              {/* _actions — required */}
              <RowActions onDuplicate={() => handleDuplicate(r.id)} onDelete={() => handleDelete(r.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
