"use client";

import { useState, useEffect } from "react";

interface Experience {
  id: string;
  title: string;
}

interface Component {
  id: string;
  name: string;
  category: string;
  description: string | null;
  unit_cost: number | null;
  sell_price: number | null;
  addon_available: boolean;
  year: string[] | null;
  notes: string | null;
  is_global: boolean;
  experience_id: string | null;
  exp_experiences: { id: string; title: string } | null;
  created_at: string;
}

const CATEGORIES = [
  { value: "coaching", label: "Coaching", color: "bg-blue-500" },
  { value: "accommodation", label: "Accommodation", color: "bg-purple-500" },
  { value: "meals", label: "Meals", color: "bg-orange-500" },
  { value: "transport", label: "Transport", color: "bg-green-500" },
  { value: "gear", label: "Gear", color: "bg-yellow-500" },
  { value: "activity", label: "Activity", color: "bg-pink-500" },
  { value: "other", label: "Other", color: "bg-gray-500" },
];

export default function ComponentsPage() {
  const [components, setComponents] = useState<Component[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    category: "coaching",
    description: "",
    unit_cost: "",
    sell_price: "",
    addon_available: false,
    notes: "",
    is_global: true,
    experience_id: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  function fetchData() {
    Promise.all([
      fetch("/api/admin/components").then((r) => r.json()),
      fetch("/api/admin/experiences").then((r) => r.json()),
    ]).then(([comps, exps]) => {
      setComponents(comps || []);
      setExperiences(
        (exps.experiences || exps || []).map((e: Record<string, unknown>) => ({
          id: e.id,
          title: e.title,
        }))
      );
      setLoading(false);
    });
  }

  const filtered = filterCategory
    ? components.filter((c) => c.category === filterCategory)
    : components;

  function startEdit(c: Component) {
    setEditId(c.id);
    setForm({
      name: c.name,
      category: c.category,
      description: c.description || "",
      unit_cost: c.unit_cost?.toString() || "",
      sell_price: c.sell_price?.toString() || "",
      addon_available: c.addon_available || false,
      notes: c.notes || "",
      is_global: c.is_global,
      experience_id: c.experience_id || "",
    });
    setShowNew(false);
  }

  function startNew() {
    setEditId(null);
    setForm({ name: "", category: "coaching", description: "", unit_cost: "", sell_price: "", addon_available: false, notes: "", is_global: true, experience_id: "" });
    setShowNew(true);
  }

  async function handleSave() {
    const body = {
      name: form.name,
      category: form.category,
      description: form.description || null,
      unit_cost: form.unit_cost ? Number(form.unit_cost) : null,
      sell_price: form.sell_price ? Number(form.sell_price) : null,
      addon_available: form.addon_available,
      notes: form.notes || null,
      is_global: form.is_global,
      experience_id: form.is_global ? null : form.experience_id || null,
    };

    if (editId) {
      await fetch(`/api/admin/components/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/admin/components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    setShowNew(false);
    setEditId(null);
    fetchData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this component?")) return;
    await fetch(`/api/admin/components/${id}`, { method: "DELETE" });
    fetchData();
  }

  const inputClass =
    "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  const formPanel = (showNew || editId) && (
    <div
      className="mb-6 p-5 rounded-xl"
      style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}
    >
      <h3 className="text-sm font-bold admin-heading mb-4">
        {editId ? "Edit Component" : "New Component"}
      </h3>
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div>
          <label className={labelClass}>Name *</label>
          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Category</label>
          <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Buy Price (€)</label>
          <input className={inputClass} type="number" step="0.01" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} placeholder="0.00" />
        </div>
        <div>
          <label className={labelClass}>Sell Price (€)</label>
          <input className={inputClass} type="number" step="0.01" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} placeholder="0.00" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <label className={labelClass}>Description</label>
          <input className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Notes</label>
          <input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.addon_available} onChange={(e) => setForm({ ...form, addon_available: e.target.checked })} className="w-4 h-4 accent-[#0aa3c7]" />
            <span className="text-sm admin-muted">Add-on available</span>
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className={labelClass}>Scope</label>
          <div className="flex items-center gap-4 mt-1">
            <label className="flex items-center gap-2 text-sm admin-muted cursor-pointer">
              <input type="radio" checked={form.is_global} onChange={() => setForm({ ...form, is_global: true, experience_id: "" })} className="accent-[#0aa3c7]" />
              Global
            </label>
            <label className="flex items-center gap-2 text-sm admin-muted cursor-pointer">
              <input type="radio" checked={!form.is_global} onChange={() => setForm({ ...form, is_global: false })} className="accent-[#0aa3c7]" />
              Experience-specific
            </label>
          </div>
        </div>
      </div>
      {!form.is_global && (
        <div className="mb-4 max-w-xs">
          <label className={labelClass}>Experience</label>
          <select className={inputClass} value={form.experience_id} onChange={(e) => setForm({ ...form, experience_id: e.target.value })}>
            <option value="">Select experience...</option>
            {experiences.map((exp) => (
              <option key={exp.id} value={exp.id}>{exp.title}</option>
            ))}
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!form.name}
          className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors"
        >
          {editId ? "Update" : "Create"}
        </button>
        <button
          onClick={() => { setShowNew(false); setEditId(null); }}
          className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Components</h1>
          <p className="text-sm admin-muted">
            Building blocks for packages — coaching, meals, transport, etc.
          </p>
        </div>
        <button
          onClick={startNew}
          className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors"
        >
          New Component
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={() => setFilterCategory("")}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            !filterCategory ? "bg-[#0aa3c7]/15 text-[#0aa3c7]" : "admin-surface admin-muted"
          }`}
          style={{ border: "1px solid var(--admin-border)" }}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setFilterCategory(filterCategory === cat.value ? "" : cat.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filterCategory === cat.value ? "bg-[#0aa3c7]/15 text-[#0aa3c7]" : "admin-surface admin-muted"
            }`}
            style={{ border: "1px solid var(--admin-border)" }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {formPanel}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm admin-faint">No components yet</p>
          <p className="text-xs admin-faint mt-1">Create components to build packages</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          <div
            className="grid grid-cols-[1fr_120px_90px_90px_80px_70px_60px] gap-3 px-5 py-3 admin-surface"
            style={{ borderBottom: "1px solid var(--admin-border)" }}
          >
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Name</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Category</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Buy</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Sell</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Add-on</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Scope</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase"></span>
          </div>
          {filtered.map((c) => {
            const cat = CATEGORIES.find((x) => x.value === c.category);
            return (
              <div
                key={c.id}
                className="grid grid-cols-[1fr_120px_90px_90px_80px_70px_60px] gap-3 px-5 py-3 transition-colors cursor-pointer"
                style={{ borderBottom: "1px solid var(--admin-border)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                onClick={() => startEdit(c)}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium admin-heading truncate">{c.name}</div>
                  {c.description && <div className="text-xs admin-faint truncate">{c.description}</div>}
                </div>
                <span className="self-center">
                  <span className={`inline-flex items-center gap-1.5 text-xs`}>
                    <span className={`w-2 h-2 rounded-full ${cat?.color || "bg-gray-500"}`} />
                    <span className="admin-muted">{cat?.label || c.category}</span>
                  </span>
                </span>
                <span className="text-xs admin-muted self-center">
                  {c.unit_cost ? `€${Number(c.unit_cost).toLocaleString("de-DE", { minimumFractionDigits: 2 })}` : "—"}
                </span>
                <span className="text-xs admin-muted self-center">
                  {c.sell_price ? `€${Number(c.sell_price).toLocaleString("de-DE", { minimumFractionDigits: 2 })}` : "—"}
                </span>
                <span className="self-center">
                  {c.addon_available ? (
                    <span className="text-green-400 text-xs font-medium">✓</span>
                  ) : (
                    <span className="admin-faint text-xs">—</span>
                  )}
                </span>
                <span className="self-center">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    c.is_global ? "bg-green-500/15 text-green-400" : "bg-blue-500/15 text-blue-400"
                  }`}>
                    {c.is_global ? "Global" : "Local"}
                  </span>
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                  className="text-xs admin-faint hover:text-red-400 transition-colors self-center"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
