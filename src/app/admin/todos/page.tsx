"use client";

import { useState, useEffect } from "react";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";

interface Todo {
  id: string;
  name: string;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  assignee: string | null;
  experience_id: string | null;
  notes: string | null;
  team_members: { id: string; name: string } | null;
  exp_experiences: { id: string; title: string } | null;
}

interface TeamMember { id: string; name: string; }
interface Experience { id: string; title: string; }

const STATUSES = ["open", "in_progress", "done", "cancelled"];
const PRIORITIES = ["low", "medium", "high", "urgent"];

type SortDir = "asc" | "desc" | null;

// Columns: checkbox is fixed-left, not in COLUMNS (handled separately)
const COLUMNS: ColumnDef[] = [
  { key: "_check", label: "", width: "30px", required: true },
  { key: "title", label: "Title", width: "1fr", required: true },
  { key: "priority", label: "Priority", width: "80px" },
  { key: "status", label: "Status", width: "80px" },
  { key: "assignee", label: "Assignee", width: "100px" },
  { key: "due_date", label: "Due", width: "80px" },
  { key: "_actions", label: "", width: "50px", required: true },
];

const STORAGE_KEY = "np7-todos-columns";

function priorityColor(p: string | null) {
  switch (p) {
    case "urgent": return "bg-red-500/15 text-red-400";
    case "high": return "bg-orange-500/15 text-orange-400";
    case "low": return "bg-gray-500/15 text-gray-400";
    default: return "bg-blue-500/15 text-blue-400";
  }
}

function statusColor(s: string | null) {
  switch (s) {
    case "done": return "bg-green-500/15 text-green-400";
    case "in_progress": return "bg-blue-500/15 text-blue-400";
    case "cancelled": return "bg-gray-500/15 text-gray-400";
    default: return "bg-amber-500/15 text-amber-400";
  }
}

function formatDate(d: string | null) {
  if (!d) return <span className="admin-faint text-xs">—</span>;
  const date = new Date(d);
  const now = new Date();
  const isOverdue = date < now;
  return <span className={isOverdue ? "text-red-400 text-xs" : "text-xs admin-muted"}>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>;
}

function compareValues(a: unknown, b: unknown, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return dir === "asc" ? 1 : -1;
  if (b == null) return dir === "asc" ? -1 : 1;
  const cmp = String(a).localeCompare(String(b));
  return dir === "asc" ? cmp : -cmp;
}

export default function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(STORAGE_KEY, COLUMNS)
  );
  const [form, setForm] = useState({ name: "", status: "open", priority: "medium", due_date: "", assignee: "", experience_id: "", notes: "" });

  function fetchData() {
    Promise.all([
      fetch("/api/admin/todos").then((r) => r.json()),
      fetch("/api/admin/team").then((r) => r.json()),
      fetch("/api/admin/experiences").then((r) => r.json()),
    ]).then(([t, tm, e]) => {
      setTodos(t || []);
      setTeam(tm || []);
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

  function startEdit(t: Todo) {
    setEditId(t.id);
    setForm({ name: t.name, status: t.status || "open", priority: t.priority || "medium", due_date: t.due_date || "", assignee: t.assignee || "", experience_id: t.experience_id || "", notes: t.notes || "" });
    setShowNew(false);
  }

  async function handleSave() {
    const body = { name: form.name, status: form.status, priority: form.priority, due_date: form.due_date || null, assignee: form.assignee || null, experience_id: form.experience_id || null, notes: form.notes || null };
    if (editId) {
      await fetch(`/api/admin/todos/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/admin/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setShowNew(false); setEditId(null); fetchData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this to-do?")) return;
    await fetch(`/api/admin/todos/${id}`, { method: "DELETE" });
    fetchData();
  }

  async function toggleDone(todo: Todo) {
    const newStatus = todo.status === "done" ? "open" : "done";
    await fetch(`/api/admin/todos/${todo.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
    fetchData();
  }

  const baseFiltered = filterStatus ? todos.filter((t) => t.status === filterStatus) : todos;

  const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  const sorted = sortKey && sortDir
    ? [...baseFiltered].sort((a, b) => {
        let aVal: unknown;
        let bVal: unknown;
        if (sortKey === "title") { aVal = a.name; bVal = b.name; }
        else if (sortKey === "priority") {
          aVal = PRIORITY_ORDER[a.priority || "medium"] ?? 2;
          bVal = PRIORITY_ORDER[b.priority || "medium"] ?? 2;
          const numA = Number(aVal);
          const numB = Number(bVal);
          return sortDir === "asc" ? numA - numB : numB - numA;
        }
        else if (sortKey === "assignee") { aVal = a.team_members?.name; bVal = b.team_members?.name; }
        else { aVal = a[sortKey as keyof Todo]; bVal = b[sortKey as keyof Todo]; }
        return compareValues(aVal, bVal, sortDir);
      })
    : baseFiltered;

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">To-Dos</h1>
          <p className="text-sm admin-muted">{todos.filter((t) => t.status !== "done").length} open · {todos.length} total</p>
        </div>
        <div className="flex items-center gap-3">
          <ColumnToggle columns={COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} storageKey={STORAGE_KEY} />
          <button onClick={() => { setShowNew(!showNew); setEditId(null); setForm({ name: "", status: "open", priority: "medium", due_date: "", assignee: "", experience_id: "", notes: "" }); }} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors">
            New To-Do
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-5">
        {["", ...STATUSES].map((s) => (
          <button key={s} onClick={() => setFilterStatus(s)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${filterStatus === s ? "bg-[#0aa3c7]/15 text-[#0aa3c7]" : "admin-surface admin-muted"}`} style={{ border: "1px solid var(--admin-border)" }}>
            {s || "All"}
          </button>
        ))}
      </div>

      {(showNew || editId) && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">{editId ? "Edit To-Do" : "New To-Do"}</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="col-span-2"><label className={labelClass}>Title *</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className={labelClass}>Priority</label>
              <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Status</label>
              <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s.replace("_", " ")}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Due Date</label><input className={inputClass} type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
            <div><label className={labelClass}>Assigned To</label>
              <select className={inputClass} value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
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
            <div><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!form.name} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg">{editId ? "Update" : "Create"}</button>
            <button onClick={() => { setShowNew(false); setEditId(null); }} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : sorted.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No to-dos</p></div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          {/* Header */}
          <div className="grid gap-3 px-5 py-3 admin-surface" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}>
            {COLUMNS.filter((c) => c.required || visibleColumns.has(c.key)).map((col) =>
              col.key === "_check" || col.key === "_actions" ? (
                <span key={col.key} />
              ) : (
                <SortableHeader key={col.key} label={col.label} sortKey={col.key} currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              )
            )}
          </div>

          {/* Rows */}
          {sorted.map((t) => (
            <div key={t.id} className="grid gap-3 px-5 py-3 cursor-pointer transition-colors" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              onClick={() => startEdit(t)}
            >
              {/* _check — required */}
              <button onClick={(e) => { e.stopPropagation(); toggleDone(t); }} className={`w-4 h-4 rounded border self-center flex-shrink-0 flex items-center justify-center transition-colors ${t.status === "done" ? "bg-green-500 border-green-500" : "border-[var(--admin-border)]"}`}>
                {t.status === "done" && <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
              </button>

              {/* title — required */}
              <div className={`min-w-0 self-center ${t.status === "done" ? "line-through admin-faint" : ""}`}>
                <div className="text-sm font-medium admin-heading truncate">{t.name}</div>
                {t.exp_experiences && <div className="text-xs admin-faint truncate">{t.exp_experiences.title}</div>}
              </div>

              {visibleColumns.has("priority") && (
                <span className="self-center"><span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase capitalize ${priorityColor(t.priority)}`}>{t.priority || "—"}</span></span>
              )}
              {visibleColumns.has("status") && (
                <span className="self-center"><span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${statusColor(t.status)}`}>{(t.status || "open").replace("_", " ")}</span></span>
              )}
              {visibleColumns.has("assignee") && (
                <span className="text-xs admin-muted self-center truncate">{t.team_members?.name || "—"}</span>
              )}
              {visibleColumns.has("due_date") && (
                <span className="self-center">{formatDate(t.due_date)}</span>
              )}

              {/* _actions — required */}
              <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} className="text-xs admin-faint hover:text-red-400 transition-colors self-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
