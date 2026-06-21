"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";
import { RowActions } from "@/components/row-actions";

interface Vendor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  category: string | null;
  chatwoot_contact_id: string | null;
  notes: string | null;
  created_at: string;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const CATEGORIES = ["Hotel", "Transport", "Catering", "Gear", "Photography", "Media", "Other"];

type SortDir = "asc" | "desc" | null;

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", width: "1fr", required: true },
  { key: "company", label: "Company", width: "140px" },
  { key: "email", label: "Email", width: "140px" },
  { key: "phone", label: "Phone", width: "120px", defaultHidden: true },
  { key: "category", label: "Category", width: "100px" },
  { key: "chatwoot_contact_id", label: "Chatwoot ID", width: "100px", defaultHidden: true },
  { key: "notes", label: "Notes", width: "150px", defaultHidden: true },
  { key: "created_at", label: "Created", width: "100px", defaultHidden: true },
  { key: "_actions", label: "", width: "80px", required: true },
];

const STORAGE_KEY = "np7-vendors-columns";

function compareValues(a: unknown, b: unknown, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return dir === "asc" ? 1 : -1;
  if (b == null) return dir === "asc" ? -1 : 1;
  const cmp = String(a).localeCompare(String(b));
  return dir === "asc" ? cmp : -cmp;
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(STORAGE_KEY, COLUMNS)
  );
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", category: "", notes: "" });

  function fetchData() {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    fetch(`/api/admin/vendors${qs}`)
      .then((r) => r.json())
      .then((d) => { setVendors(d || []); setLoading(false); });
  }

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    const t = setTimeout(fetchData, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

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
    ? [...vendors].sort((a, b) => compareValues(a[sortKey as keyof Vendor], b[sortKey as keyof Vendor], sortDir))
    : vendors;

  async function handleCreate() {
    const res = await fetch("/api/admin/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowNew(false);
      setForm({ name: "", email: "", phone: "", company: "", category: "", notes: "" });
      fetchData();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this vendor?")) return;
    await fetch(`/api/admin/vendors/${id}`, { method: "DELETE" });
    fetchData();
  }

  async function handleDuplicate(id: string) {
    await fetch(`/api/admin/vendors/${id}/duplicate`, { method: "POST" });
    fetchData();
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Vendors</h1>
          <p className="text-sm admin-muted">{vendors.length} vendor{vendors.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <ColumnToggle columns={COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} storageKey={STORAGE_KEY} />
          <button onClick={() => setShowNew(!showNew)} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors">
            New Vendor
          </button>
        </div>
      </div>

      <div className="mb-5">
        <input className={`${inputClass} max-w-sm`} placeholder="Search by name, company, email..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {showNew && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">New Vendor</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}>Name *</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className={labelClass}>Company</label><input className={inputClass} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div><label className={labelClass}>Category</label>
              <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">—</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Email</label><input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className={labelClass}>Phone</label><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!form.name} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors">Create</button>
            <button onClick={() => setShowNew(false)} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : vendors.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No vendors yet</p></div>
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
          {sorted.map((v) => (
            <div key={v.id} className="grid gap-3 px-5 py-3 transition-colors" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <Link href={`/admin/vendors/${v.id}`} className="text-sm font-medium admin-heading truncate hover:text-[#0aa3c7] transition-colors">{v.name}</Link>
              {visibleColumns.has("company") && <span className="text-xs admin-muted self-center truncate">{v.company || "—"}</span>}
              {visibleColumns.has("email") && <span className="text-xs admin-muted self-center truncate">{v.email || "—"}</span>}
              {visibleColumns.has("phone") && <span className="text-xs admin-muted self-center truncate">{v.phone || "—"}</span>}
              {visibleColumns.has("category") && <span className="text-xs admin-muted self-center">{v.category || "—"}</span>}
              {visibleColumns.has("chatwoot_contact_id") && <span className="text-xs admin-faint self-center truncate">{v.chatwoot_contact_id || "—"}</span>}
              {visibleColumns.has("notes") && <span className="text-xs admin-faint self-center truncate" title={v.notes || ""}>{v.notes || "—"}</span>}
              {visibleColumns.has("created_at") && <span className="text-xs admin-faint self-center">{fmtDate(v.created_at)}</span>}
              <RowActions onDuplicate={() => handleDuplicate(v.id)} onDelete={() => handleDelete(v.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
