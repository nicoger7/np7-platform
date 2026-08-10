"use client";

import { useState, useEffect } from "react";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";
import { SearchableSelect } from "@/components/admin/searchable-select";
import { editionLabel, editionOptionLabel, editionSortKey } from "@/lib/edition-label";
import { SearchSelect } from "@/components/admin/search-select";

interface Experience {
  id: string;
  title: string;
  code: string | null;
}

interface Edition {
  id: string;
  experience_id: string;
  year: number;
  label: string | null;
}

interface Component {
  id: string;
  name: string;
  category: string;
  description: string | null;
  hotel_id?: string | null;
  room_type?: string | null;
  unit_cost: number | null;
  sell_price: number | null;
  addon_available: boolean;
  payment_mode?: string | null;
  payment_note?: string | null;
  scope: string | null;
  notes: string | null;
  is_global: boolean;
  experience_id: string | null;
  edition_id: string | null;
  exp_experiences: { id: string; title: string } | null;
  edition: { id: string; year: number; label: string | null } | null;
  created_at: string;
}

// Base categories with colours; new free-form categories fall back to gray.
const BASE_CATEGORIES = [
  { value: "coaching", color: "bg-blue-500" },
  { value: "accommodation", color: "bg-purple-500" },
  { value: "meals", color: "bg-orange-500" },
  { value: "transport", color: "bg-green-500" },
  { value: "gear", color: "bg-yellow-500" },
  { value: "activity", color: "bg-pink-500" },
  { value: "other", color: "bg-gray-500" },
];
const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(BASE_CATEGORIES.map((c) => [c.value, c.color]));
function categoryColor(cat: string | null) {
  return (cat && CATEGORY_COLORS[cat]) || "bg-gray-500";
}
function titleCase(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
function editionName(ed: { year: number; label: string | null } | null) {
  if (!ed) return "—";
  return editionLabel(ed) || "—";
}

type SortDir = "asc" | "desc" | null;

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", width: "minmax(220px,1.4fr)", required: true },
  { key: "category", label: "Category", width: "120px" },
  { key: "unit_cost", label: "Buy", width: "90px" },
  { key: "sell_price", label: "Sell", width: "90px" },
  { key: "addon_available", label: "Add-on", width: "80px" },
  { key: "scope", label: "Scope", width: "70px" },
  { key: "experience", label: "Experience", width: "140px", defaultHidden: true },
  { key: "edition", label: "Edition", width: "100px", defaultHidden: true },
  { key: "notes", label: "Notes", width: "160px", defaultHidden: true },
  { key: "_actions", label: "", width: "72px", required: true },
];

const STORAGE_KEY = "np7-components-columns";

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

export default function ComponentsPage() {
  const [components, setComponents] = useState<Component[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterExperience, setFilterExperience] = useState("");
  const [filterEdition, setFilterEdition] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  // Deep link from the experience's Components tab: /admin/components?id=<id>
  // opens that component's editor directly, so the row there can lead to the
  // FULL component rather than only its two price fields.
  useEffect(() => {
    if (typeof window === "undefined" || components.length === 0) return;
    const want = new URLSearchParams(window.location.search).get("id");
    if (!want) return;
    const c = components.find((x) => x.id === want);
    if (c) startEdit(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components]);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(STORAGE_KEY, COLUMNS)
  );
  const emptyForm = {
    name: "", category: "coaching", description: "", unit_cost: "", sell_price: "",
    addon_available: false, payment_mode: "np7", payment_note: "", notes: "", is_global: true, experience_id: "", edition_id: "",
    hotel_id: "", room_type: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [hotels, setHotels] = useState<{ id: string; name: string }[]>([]);
  const [allRooms, setAllRooms] = useState<{ hotel: string | null; room_type: string | null }[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  function fetchData() {
    Promise.all([
      fetch("/api/admin/components").then((r) => r.json()),
      fetch("/api/admin/experiences").then((r) => r.json()),
      fetch("/api/admin/editions").then((r) => r.json()),
      fetch("/api/admin/hotels").then((r) => r.json()).catch(() => ({})),
      fetch("/api/admin/rooms").then((r) => r.json()).catch(() => ({})),
    ]).then(([comps, exps, eds, hot, rms]) => {
      setHotels(((hot?.hotels ?? []) as { id: string | null; name: string }[]).filter((h) => h.id) as { id: string; name: string }[]);
      setAllRooms(Array.isArray(rms?.rooms) ? rms.rooms : []);
      setComponents(comps || []);
      setExperiences(
        (exps.experiences || exps || []).map((e: Record<string, string>) => ({
          id: e.id,
          title: e.title,
          code: e.code ?? null,
        }))
      );
      setEditions(Array.isArray(eds) ? eds : []);
      setLoading(false);
    });
  }

  // Distinct categories (base + any custom ones already in use) for the datalist + filters
  const allCategories = Array.from(
    new Set([...BASE_CATEGORIES.map((c) => c.value), ...components.map((c) => c.category).filter(Boolean)])
  );
  const expCodeById = new Map(experiences.map((e) => [e.id, e.code]));
  const formEditions = form.experience_id ? editions.filter((e) => e.experience_id === form.experience_id) : [];

  // No name prefixing — the component is linked to its experience, the code in
  // the name was redundant noise ("BON - …").
  function pickExperience(experience_id: string) {
    setForm((f) => ({ ...f, is_global: false, experience_id, edition_id: "" }));
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

  const expTitleById = new Map(experiences.map((e) => [e.id, e.title]));
  const filterEditionOptions = (filterExperience
    ? editions.filter((e) => e.experience_id === filterExperience)
    : editions
  ).slice().sort((a, b) => editionSortKey(a).localeCompare(editionSortKey(b)));
  const filtered = components.filter((c) => {
    if (filterCategory && c.category !== filterCategory) return false;
    if (filterExperience && !(c.is_global || c.experience_id === filterExperience)) return false;
    if (filterEdition && c.edition_id !== filterEdition) return false;
    return true;
  });

  const sorted = sortKey && sortDir
    ? [...filtered].sort((a, b) => {
        let aVal: unknown;
        let bVal: unknown;
        if (sortKey === "scope") {
          aVal = a.is_global ? "global" : "local";
          bVal = b.is_global ? "global" : "local";
        } else if (sortKey === "experience") {
          aVal = a.exp_experiences?.title; bVal = b.exp_experiences?.title;
        } else if (sortKey === "edition") {
          aVal = editionName(a.edition); bVal = editionName(b.edition);
        } else {
          aVal = a[sortKey as keyof Component];
          bVal = b[sortKey as keyof Component];
        }
        return compareValues(aVal, bVal, sortDir);
      })
    : filtered;

  function startEdit(c: Component) {
    setEditId(c.id);
    setForm({
      name: c.name,
      category: c.category,
      description: c.description || "",
      unit_cost: c.unit_cost?.toString() || "",
      sell_price: c.sell_price?.toString() || "",
      addon_available: c.addon_available || false,
      payment_mode: c.payment_mode || "np7",
      payment_note: c.payment_note || "",
      notes: c.notes || "",
      is_global: c.is_global,
      experience_id: c.experience_id || "",
      edition_id: c.edition_id || "",
      hotel_id: c.hotel_id || "",
      room_type: c.room_type || "",
    });
    setShowNew(false);
  }

  function startNew() {
    setEditId(null);
    // Pre-scope a new component to whatever the list is filtered to — so adding
    // a component while viewing one experience/edition lands it there by default.
    setForm(filterExperience
      ? { ...emptyForm, is_global: false, experience_id: filterExperience, edition_id: filterEdition || "" }
      : emptyForm);
    setShowNew(true);
  }

  async function handleSave() {
    const body = {
      name: form.name,
      category: form.category || "other",
      description: form.description || null,
      unit_cost: form.unit_cost ? Number(form.unit_cost) : null,
      sell_price: form.sell_price ? Number(form.sell_price) : null,
      addon_available: form.addon_available,
      payment_mode: form.payment_mode,
      payment_note: form.payment_mode === "direct" ? (form.payment_note.trim() || null) : null,
      notes: form.notes || null,
      is_global: form.is_global,
      experience_id: form.is_global ? null : form.experience_id || null,
      edition_id: form.is_global ? null : form.edition_id || null,
      hotel_id: form.category === "accommodation" ? form.hotel_id || null : null,
      room_type: form.category === "accommodation" ? form.room_type || null : null,
    };

    if (editId) {
      await fetch(`/api/admin/components/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch("/api/admin/components", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }

    setShowNew(false);
    setEditId(null);
    fetchData();
  }

  async function handleDuplicate(id: string) {
    await fetch(`/api/admin/components/${id}/duplicate`, { method: "POST" });
    fetchData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this component?")) return;
    await fetch(`/api/admin/components/${id}`, { method: "DELETE" });
    fetchData();
  }

  const inputClass =
    "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);

  const formPanel = (showNew || editId) && (
    <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
      <h3 className="text-sm font-bold admin-heading mb-4">{editId ? "Edit Component" : "New Component"}</h3>
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div><label className={labelClass}>Name *</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className={labelClass}>Category <span className="admin-faint">(or type new)</span></label>
          <input className={inputClass} list="component-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="coaching, meals…" />
          <datalist id="component-categories">
            {allCategories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div><label className={labelClass}>Buy Price (€)</label><input className={inputClass} type="number" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} placeholder="0.00" /></div>
        <div><label className={labelClass}>Sell Price (€)</label><input className={inputClass} type="number" step="0.01" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} placeholder="0.00" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div><label className={labelClass}>Website text <span className="normal-case font-normal admin-faint">— how it appears in a package's &quot;What's included&quot;</span></label><input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Healthy lunch on the beach daily" /><p className="text-[11px] admin-faint mt-1">Shown for every package where this component is ✓-checked for the website. Blank = the component name is used.</p></div>
        {form.category === "accommodation" && (
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Hotel</label>
              <select className={inputClass} value={form.hotel_id}
                onChange={(e) => {
                  const hotel_id = e.target.value;
                  const hName = hotels.find((h) => h.id === hotel_id)?.name || "";
                  setForm((f) => ({ ...f, hotel_id, name: f.name.trim() ? f.name : (hName && f.room_type ? `${hName} – ${f.room_type}` : f.name) }));
                }}>
                <option value="">—</option>
                {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Room type <span className="normal-case font-normal admin-faint">(or type new)</span></label>
              <input className={inputClass} list="component-room-types" value={form.room_type}
                onChange={(e) => {
                  const room_type = e.target.value;
                  const hName = hotels.find((h) => h.id === form.hotel_id)?.name || "";
                  setForm((f) => ({ ...f, room_type, name: f.name.trim() ? f.name : (hName && room_type ? `${hName} – ${room_type}` : f.name) }));
                }} placeholder="e.g. Double Deluxe Balcony" />
              <datalist id="component-room-types">
                {[...new Set(allRooms
                  .filter((r) => { const hName = hotels.find((h) => h.id === form.hotel_id)?.name; return !hName || r.hotel === hName; })
                  .map((r) => r.room_type).filter(Boolean))].map((t) => <option key={String(t)} value={String(t)} />)}
              </datalist>
              <p className="text-[11px] admin-faint mt-1">Suggestions come from that hotel&apos;s real rooms.</p>
            </div>
          </div>
        )}
        <div><label className={labelClass}>Notes</label><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.addon_available} onChange={(e) => setForm({ ...form, addon_available: e.target.checked })} className="w-4 h-4 accent-[#0aa3c7]" />
            <span className="text-sm admin-muted">Add-on available</span>
          </label>
        </div>
      </div>
      {/* Payment mode belongs under the "Add-on available" row it depends on —
          full width, not squeezed into that checkbox's grid column. */}
      {form.addon_available && (
        <div className="mb-4 max-w-xl rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <label className={labelClass}>Who takes the money?</label>
          <div className="grid sm:grid-cols-2 gap-2.5 mt-2">
            {[
              { v: "np7", t: "We charge it", d: "Goes on their invoice and the trip total." },
              { v: "direct", t: "They pay directly", d: "We arrange it, they settle with the provider." },
            ].map((o) => (
              <button key={o.v} type="button" onClick={() => setForm({ ...form, payment_mode: o.v })}
                className={`text-left rounded-lg p-3 border transition-colors ${form.payment_mode === o.v ? "border-[var(--admin-accent)] bg-[var(--admin-accent)]/10" : "admin-surface hover:border-[var(--admin-accent)]/40"}`}
                style={form.payment_mode === o.v ? undefined : { borderColor: "var(--admin-border)" }}>
                <span className="block text-[13px] font-bold admin-heading">{o.t}</span>
                <span className="block text-[11.5px] admin-faint mt-0.5 leading-snug">{o.d}</span>
              </button>
            ))}
          </div>
          {form.payment_mode === "direct" && (
            <div className="mt-3.5">
              <label className={labelClass}>How they pay <span className="text-[10px] admin-faint font-normal">— shown to the guest</span></label>
              <input className={inputClass} value={form.payment_note}
                onChange={(e) => setForm({ ...form, payment_note: e.target.value })}
                placeholder="Pay the driver in cash on arrival — €95 for up to 3 people" />
              <p className="text-[11px] admin-faint mt-1.5">
                Nothing is invoiced and nothing joins the trip total. Sell price stays as your own reference.
              </p>
            </div>
          )}
        </div>
      )}

      {/* One control for scope: Global, or a specific experience (+ optional edition). */}
      <div className="grid grid-cols-2 gap-4 mb-4 max-w-xl">
        <div>
          <label className={labelClass}>Available for</label>
          <SearchableSelect
            ariaLabel="Available for"
            value={form.is_global ? "__global__" : (form.experience_id || "")}
            onChange={(v) => { if (v === "__global__") setForm({ ...form, is_global: true, experience_id: "", edition_id: "" }); else pickExperience(v); }}
            options={[
              { value: "__global__", label: "🌐 Global — all experiences" },
              ...experiences.map((exp) => ({ value: exp.id, label: exp.title, sublabel: exp.code || undefined })),
            ]}
          />
        </div>
        <div>
          <label className={labelClass}>Edition <span className="admin-faint">(optional)</span></label>
          <SearchableSelect
            ariaLabel="Edition"
            disabled={form.is_global || !form.experience_id}
            value={form.edition_id}
            onChange={(v) => setForm({ ...form, edition_id: v })}
            placeholder="All editions"
            options={[
              { value: "", label: "All editions" },
              ...formEditions.map((ed) => ({ value: ed.id, label: editionOptionLabel(ed) })),
            ]}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={!form.name} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
          {editId ? "Update" : "Create"}
        </button>
        <button onClick={() => { setShowNew(false); setEditId(null); }} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Components</h1>
          <p className="text-sm admin-muted">Building blocks for packages — coaching, meals, transport, etc.</p>
        </div>
        <div className="flex items-center gap-3">
          {!(showNew || editId) && <ColumnToggle columns={COLUMNS} visible={visibleColumns} onChange={setVisibleColumns} storageKey={STORAGE_KEY} />}
          <button onClick={startNew} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
            New Component
          </button>
        </div>
      </div>

      {(showNew || editId) ? (
      <div className="flex flex-col lg:flex-row gap-4">
        {/* rail */}
        <div className="lg:w-64 shrink-0 flex lg:flex-col gap-1.5 lg:max-h-[80vh] lg:overflow-y-auto lg:pr-1">
          <button onClick={() => { setShowNew(false); setEditId(null); }} className="shrink-0 mb-1 flex items-center gap-1.5 text-xs font-semibold admin-muted hover:text-[var(--admin-accent)] transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            All components
          </button>
          {filtered.map((c) => {
            const active = c.id === editId;
            return (
              <button key={c.id} onClick={() => startEdit(c)} className="shrink-0 text-left px-3 py-2 rounded-lg transition-colors" style={{ background: active ? "var(--admin-accent)" : "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                <span className={`block text-xs font-semibold truncate ${active ? "text-[var(--admin-accent-contrast)]" : "admin-heading"}`}>{c.name}</span>
                <span className={`block text-[10px] mt-0.5 truncate capitalize ${active ? "text-[var(--admin-accent-contrast)]/80" : "admin-faint"}`}>{c.category || "uncategorised"}{c.is_global ? " · global" : ""}</span>
              </button>
            );
          })}
        </div>
        {/* detail: component editor */}
        <div className="flex-1 min-w-0">{formPanel}</div>
      </div>
      ) : (
      <>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {/* growing lists get search; the fixed category pills below stay as-is */}
        <div className="w-56">
          <SearchSelect
            value={filterExperience || null}
            onChange={(v) => { setFilterExperience(v ?? ""); setFilterEdition(""); }}
            options={experiences.map((exp) => ({ value: exp.id, label: exp.title }))}
            placeholder="All experiences" clearLabel="All experiences" searchPlaceholder="Search experiences…"
          />
        </div>
        <div className="w-64">
          <SearchSelect
            value={filterEdition || null}
            onChange={(v) => setFilterEdition(v ?? "")}
            options={filterEditionOptions.map((ed) => ({ value: ed.id, label: editionOptionLabel(ed, filterExperience ? null : expTitleById.get(ed.experience_id)) }))}
            placeholder="All editions" clearLabel="All editions" searchPlaceholder="Search editions…"
          />
        </div>
        {(filterExperience || filterEdition) && (
          <button onClick={() => { setFilterExperience(""); setFilterEdition(""); }} className="text-xs admin-faint hover:admin-muted transition-colors px-1">Clear</button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <button onClick={() => setFilterCategory("")} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${!filterCategory ? "bg-[var(--admin-accent)]/15 text-[#0aa3c7]" : "admin-surface admin-muted"}`} style={{ border: "1px solid var(--admin-border)" }}>All</button>
        {allCategories.map((cat) => (
          <button key={cat} onClick={() => setFilterCategory(filterCategory === cat ? "" : cat)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${filterCategory === cat ? "bg-[var(--admin-accent)]/15 text-[#0aa3c7]" : "admin-surface admin-muted"}`} style={{ border: "1px solid var(--admin-border)" }}>
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm admin-faint">No components yet</p>
          <p className="text-xs admin-faint mt-1">Create components to build packages</p>
        </div>
      ) : (
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)", overflowX: "auto" }}>
          {/* Header */}
          <div className="grid gap-3 px-5 py-3 admin-surface" style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}>
            {COLUMNS.filter((c) => c.required || visibleColumns.has(c.key)).map((col) =>
              col.key === "_actions" ? (
                <span key={col.key} />
              ) : (
                <SortableHeader key={col.key} label={col.label} sortKey={col.key} currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              )
            )}
          </div>

          {/* Rows */}
          {sorted.map((c) => {
            return (
              <div
                key={c.id}
                className="grid gap-3 px-5 py-3 transition-colors cursor-pointer"
                style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                onClick={() => startEdit(c)}
              >
                {/* name — required */}
                <div className="min-w-0">
                  <div className="text-sm font-medium admin-heading truncate">{c.name}</div>
                  {c.description && <div className="text-xs admin-faint truncate">{c.description}</div>}
                </div>
                {visibleColumns.has("category") && (
                  <span className="self-center">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className={`w-2 h-2 rounded-full ${categoryColor(c.category)}`} />
                      <span className="admin-muted capitalize">{c.category}</span>
                    </span>
                  </span>
                )}
                {visibleColumns.has("unit_cost") && (
                  <span className="text-xs admin-muted self-center">
                    {c.unit_cost ? `€${Number(c.unit_cost).toLocaleString("de-DE", { minimumFractionDigits: 2 })}` : "—"}
                  </span>
                )}
                {visibleColumns.has("sell_price") && (
                  <span className="text-xs admin-muted self-center">
                    {c.sell_price ? `€${Number(c.sell_price).toLocaleString("de-DE", { minimumFractionDigits: 2 })}` : "—"}
                  </span>
                )}
                {visibleColumns.has("addon_available") && (
                  <span className="self-center">
                    {c.addon_available ? (
                      <span className="text-green-400 text-xs font-medium">✓</span>
                    ) : (
                      <span className="admin-faint text-xs">—</span>
                    )}
                  </span>
                )}
                {visibleColumns.has("scope") && (
                  <span className="self-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${c.is_global ? "bg-green-500/15 text-green-400" : "bg-blue-500/15 text-blue-400"}`}>
                      {c.is_global ? "Global" : "Local"}
                    </span>
                  </span>
                )}
                {visibleColumns.has("experience") && (
                  <span className="text-xs admin-muted self-center truncate">{c.exp_experiences?.title || (c.is_global ? "All" : "—")}</span>
                )}
                {visibleColumns.has("edition") && (
                  <span className="text-xs admin-muted self-center truncate">{editionName(c.edition)}</span>
                )}
                {visibleColumns.has("notes") && (
                  <span className="text-xs admin-faint self-center truncate" title={c.notes || ""}>{c.notes || "—"}</span>
                )}
                {/* _actions — required */}
                <span className="flex items-center gap-2 self-center justify-end">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDuplicate(c.id); }}
                    className="text-xs admin-faint hover:text-[#0aa3c7] transition-colors"
                    title="Duplicate"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                    className="text-xs admin-faint hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
  );
}
