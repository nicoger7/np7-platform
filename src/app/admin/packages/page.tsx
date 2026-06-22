"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PackageComponentsEditor } from "@/components/package-components-editor";

interface Package {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number | null;
  cost_per_person: number | null;
  deposit: number | null;
  deposit_refund_days: number | null;
  downpayment_percent: number | null;
  final_days_before: number | null;
  max_spots: number | null;
  sort_order: number;
  status: string;
  category: string | null;
  date: string | null;
  includes: unknown; // jsonb — curated "what's included" list shown on the website
  experience_id: string | null;
  edition_id: string | null;
  hotel_id: string | null;
  exp_experiences: { id: string; title: string } | null;
  // computed in the API
  component_count: number;
  cost_estimate: number | null;
  margin: number | null;
}

interface Edition {
  id: string;
  experience_id: string;
  year: number;
  label: string | null;
  exp_experiences: { id: string; title: string } | null;
}

interface Experience {
  id: string;
  title: string;
  code: string | null;
}

const PKG_CATEGORIES = ["", "advanced", "beginner", "mixed"];

function money(n: number | null) {
  return n != null ? `€${Number(n).toLocaleString()}` : "—";
}

function editionLabel(ed: Edition) {
  const base = ed.exp_experiences?.title || "Unknown";
  return `${base} — ${ed.label || ed.year}`;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] ${
        status === "active"
          ? "bg-green-500/15 text-green-400"
          : status === "sold_out"
          ? "bg-red-500/15 text-red-400"
          : "bg-gray-500/15 text-gray-400"
      }`}
    >
      {status?.replace("_", " ") || "—"}
    </span>
  );
}

const emptyForm = {
  name: "", price: "", cost_per_person: "", deposit: "", max_spots: "",
  deposit_refund_days: "", downpayment_percent: "", final_days_before: "",
  category: "", status: "active", experience_id: "", edition_id: "", hotel_id: "", includes: "",
};

/** jsonb includes (array of strings / objects) → one-per-line text for the editor. */
function includesToText(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  return raw
    .map((it) => (typeof it === "string" ? it : it && typeof it === "object" ? String((it as Record<string, unknown>).name ?? (it as Record<string, unknown>).label ?? (it as Record<string, unknown>).text ?? "") : ""))
    .filter(Boolean)
    .join("\n");
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [hotels, setHotels] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterExperienceId, setFilterExperienceId] = useState("");
  const [filterEditionId, setFilterEditionId] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/admin/packages").then((r) => r.json()),
      fetch("/api/admin/editions").then((r) => r.json()),
      fetch("/api/admin/experiences").then((r) => r.json()),
      fetch("/api/admin/hotels").then((r) => r.json()),
    ]).then(([pkgs, eds, exps, hot]) => {
      setPackages(Array.isArray(pkgs) ? pkgs : []);
      setEditions(Array.isArray(eds) ? eds : []);
      const list = Array.isArray(exps) ? exps : exps.experiences || [];
      setExperiences(list.map((e: Record<string, string>) => ({ id: e.id, title: e.title, code: e.code ?? null })));
      setHotels((hot?.hotels || []).filter((h: { id: string | null }) => h.id).map((h: { id: string; name: string }) => ({ id: h.id, name: h.name })));
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Cascading: edition options narrow to the selected experience
  const editionOptions = filterExperienceId
    ? editions.filter((e) => e.experience_id === filterExperienceId)
    : editions;

  const filtered = packages.filter((p) => {
    if (filterEditionId) return p.edition_id === filterEditionId;
    if (filterExperienceId) return p.experience_id === filterExperienceId;
    return true;
  });

  const editionMap = new Map(editions.map((e) => [e.id, e]));
  const expCodeById = new Map(experiences.map((e) => [e.id, e.code]));

  // Group by edition (or experience fallback)
  const grouped = new Map<string, { pkgs: Package[]; editionId: string | null }>();
  for (const pkg of filtered) {
    const ed = pkg.edition_id ? editionMap.get(pkg.edition_id) : null;
    const key = ed ? editionLabel(ed) : pkg.exp_experiences?.title || "No Experience";
    if (!grouped.has(key)) grouped.set(key, { pkgs: [], editionId: pkg.edition_id });
    grouped.get(key)!.pkgs.push(pkg);
  }

  function startNew() {
    setEditId(null);
    setForm({ ...emptyForm, experience_id: filterExperienceId, edition_id: filterEditionId });
    setShowNew(true);
  }

  function startEdit(p: Package) {
    setEditId(p.id);
    setShowNew(false);
    setForm({
      name: p.name,
      price: p.price?.toString() || "",
      cost_per_person: p.cost_per_person?.toString() || "",
      deposit: p.deposit?.toString() || "",
      deposit_refund_days: p.deposit_refund_days?.toString() || "",
      downpayment_percent: p.downpayment_percent?.toString() || "",
      final_days_before: p.final_days_before?.toString() || "",
      max_spots: p.max_spots?.toString() || "",
      category: p.category || "",
      status: p.status || "active",
      experience_id: p.experience_id || "",
      edition_id: p.edition_id || "",
      hotel_id: p.hotel_id || "",
      includes: includesToText(p.includes),
    });
  }

  async function save() {
    const body = {
      name: form.name,
      price: form.price ? Number(form.price) : null,
      cost_per_person: form.cost_per_person ? Number(form.cost_per_person) : null,
      deposit: form.deposit ? Number(form.deposit) : null,
      // Milestone config (migration 032) — only sent when set, so package saves
      // keep working before 032 is applied.
      ...(form.deposit_refund_days ? { deposit_refund_days: Number(form.deposit_refund_days) } : {}),
      ...(form.downpayment_percent ? { downpayment_percent: Number(form.downpayment_percent) } : {}),
      ...(form.final_days_before ? { final_days_before: Number(form.final_days_before) } : {}),
      max_spots: form.max_spots ? Number(form.max_spots) : null,
      category: form.category || null,
      status: form.status,
      experience_id: form.experience_id || null,
      edition_id: form.edition_id || null,
      hotel_id: form.hotel_id || null,
      includes: form.includes.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    if (editId) {
      await fetch(`/api/admin/packages/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      await fetch(`/api/admin/packages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    setShowNew(false); setEditId(null); setForm(emptyForm); load();
  }

  async function duplicate(id: string) {
    await fetch(`/api/admin/packages/${id}/duplicate`, { method: "POST" });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this package? Component links will be removed too.")) return;
    await fetch(`/api/admin/packages/${id}`, { method: "DELETE" });
    load();
  }

  // Edition choices inside the form follow the form's experience
  const formEditionOptions = form.experience_id
    ? editions.filter((e) => e.experience_id === form.experience_id)
    : editions;

  const inputClass =
    "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Packages</h1>
          <p className="text-sm admin-muted">
            {filtered.length} package{filtered.length !== 1 ? "s" : ""} across {grouped.size} edition{grouped.size !== 1 ? "s" : ""}
          </p>
        </div>
        <button onClick={startNew} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">
          New Package
        </button>
      </div>

      {(showNew || editId) ? (
      <div className="flex flex-col lg:flex-row gap-4">
        {/* rail */}
        <div className="lg:w-64 shrink-0 flex lg:flex-col gap-1.5 lg:max-h-[80vh] lg:overflow-y-auto lg:pr-1">
          <button onClick={() => { setShowNew(false); setEditId(null); }} className="shrink-0 mb-1 flex items-center gap-1.5 text-xs font-semibold admin-muted hover:text-[var(--admin-accent)] transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            All packages
          </button>
          {filtered.map((pkg) => {
            const active = pkg.id === editId;
            const ed = editions.find((e) => e.id === pkg.edition_id);
            return (
              <button key={pkg.id} onClick={() => startEdit(pkg)} className="shrink-0 text-left px-3 py-2 rounded-lg transition-colors" style={{ background: active ? "var(--admin-accent)" : "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                <span className={`block text-xs font-semibold truncate ${active ? "text-[var(--admin-accent-contrast)]" : "admin-heading"}`}>{pkg.name}</span>
                <span className={`block text-[10px] mt-0.5 truncate ${active ? "text-[var(--admin-accent-contrast)]/80" : "admin-faint"}`}>{ed ? `${ed.label || ed.year} · ` : ""}{money(pkg.price)} · {pkg.status}</span>
              </button>
            );
          })}
        </div>
        {/* detail: edit form + component selector */}
        <div className="flex-1 min-w-0 space-y-4">
        <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-base font-bold admin-heading mb-4">{editId ? "Edit package" : "New package"}</h3>
          <div className="grid grid-cols-[1fr_180px_180px] gap-4 mb-4">
            <div><label className={labelClass}>Name *</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className={labelClass}>Experience</label>
              <select className={inputClass} value={form.experience_id} onChange={(e) => setForm({ ...form, experience_id: e.target.value, edition_id: "" })}>
                <option value="">—</option>
                {experiences.map((exp) => <option key={exp.id} value={exp.id}>{exp.title}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Edition</label>
              <select className={inputClass} value={form.edition_id} onChange={(e) => setForm({ ...form, edition_id: e.target.value })}>
                <option value="">—</option>
                {formEditionOptions.map((ed) => <option key={ed.id} value={ed.id}>{ed.label || ed.year}{form.experience_id ? "" : ` — ${ed.exp_experiences?.title || ""}`}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-6 gap-4 mb-4">
            <div><label className={labelClass}>Sell (€)</label><input type="number" className={inputClass} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div><label className={labelClass}>Cost / person</label><input type="number" className={inputClass} value={form.cost_per_person} onChange={(e) => setForm({ ...form, cost_per_person: e.target.value })} placeholder="auto" /></div>
            <div><label className={labelClass}>Deposit</label><input type="number" className={inputClass} value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} /></div>
            <div><label className={labelClass}>Spots</label><input type="number" className={inputClass} value={form.max_spots} onChange={(e) => setForm({ ...form, max_spots: e.target.value })} /></div>
            <div><label className={labelClass}>Category</label>
              <select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {PKG_CATEGORIES.map((c) => <option key={c} value={c}>{c ? c[0].toUpperCase() + c.slice(1) : "None"}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Status</label>
              <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="sold_out">Sold out</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          {/* Payment plan (Phase 2): deposit → downpayment → final. Needs migration 032. */}
          <div className="mb-4">
            <p className="text-[11px] font-bold uppercase tracking-wide admin-faint mb-1.5">Payment plan</p>
            <div className="grid grid-cols-3 gap-4">
              <div><label className={labelClass}>Deposit refundable (days)</label><input type="number" className={inputClass} value={form.deposit_refund_days} onChange={(e) => setForm({ ...form, deposit_refund_days: e.target.value })} placeholder="14" /></div>
              <div><label className={labelClass}>Downpayment (% of total)</label><input type="number" className={inputClass} value={form.downpayment_percent} onChange={(e) => setForm({ ...form, downpayment_percent: e.target.value })} placeholder="50" /></div>
              <div><label className={labelClass}>Final due (days before trip)</label><input type="number" className={inputClass} value={form.final_days_before} onChange={(e) => setForm({ ...form, final_days_before: e.target.value })} placeholder="90" /></div>
            </div>
          </div>
          <div className="grid grid-cols-[260px_1fr] gap-4 mb-4">
            <div><label className={labelClass}>Hotel</label>
              <select className={inputClass} value={form.hotel_id} onChange={(e) => setForm({ ...form, hotel_id: e.target.value })}>
                <option value="">No hotel / auto-detect</option>
                {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
              <p className="text-[11px] admin-faint mt-1">Drives the hotel name &amp; photos in the public booking step. Leave blank to auto-match by name.</p>
            </div>
            <div><label className={labelClass}>What&apos;s included (website)</label>
              <textarea className={`${inputClass} h-[120px] resize-y leading-relaxed`} value={form.includes} onChange={(e) => setForm({ ...form, includes: e.target.value })} placeholder={"One inclusion per line, e.g.\n6 days of pro coaching\nDaily video analysis\nAirport transfers on site"} />
              <p className="text-[11px] admin-faint mt-1">Marketing list shown in the package box on the website — one per line. Independent of the cost components below; add anything you want to advertise. Leave blank to show the standard list.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={!form.name} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">{editId ? "Update" : "Create"}</button>
            <button onClick={() => { setShowNew(false); setEditId(null); }} className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors">Cancel</button>
          </div>
        </div>
        {editId && (
          <div className="p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            <h3 className="text-base font-bold admin-heading mb-4">What&apos;s included</h3>
            <PackageComponentsEditor
              packageId={editId}
              experienceId={form.experience_id || null}
              editionId={form.edition_id || null}
              namePrefix={form.experience_id && expCodeById.get(form.experience_id) ? `${expCodeById.get(form.experience_id)} - ` : undefined}
              sellPrice={form.price ? Number(form.price) : null}
              onChanged={load}
            />
          </div>
        )}
        </div>
      </div>
      ) : (
      <>
      {/* Cascading filters: experience → edition */}
      <div className="flex items-center gap-3 mb-5">
        <select
          className={`${inputClass} max-w-[240px]`}
          value={filterExperienceId}
          onChange={(e) => { setFilterExperienceId(e.target.value); setFilterEditionId(""); }}
        >
          <option value="">All Experiences</option>
          {experiences.map((exp) => (
            <option key={exp.id} value={exp.id}>{exp.title}</option>
          ))}
        </select>
        <select
          className={`${inputClass} max-w-[220px]`}
          value={filterEditionId}
          onChange={(e) => setFilterEditionId(e.target.value)}
        >
          <option value="">All Editions</option>
          {editionOptions.map((ed) => (
            <option key={ed.id} value={ed.id}>{ed.label || ed.year}{filterExperienceId ? "" : ` — ${ed.exp_experiences?.title || ""}`}</option>
          ))}
        </select>
        {(filterExperienceId || filterEditionId) && (
          <button onClick={() => { setFilterExperienceId(""); setFilterEditionId(""); }} className="text-xs admin-faint hover:admin-muted transition-colors">
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No packages match</p></div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([label, group]) => (
            <div key={label}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
                <h2 className="text-sm font-bold admin-heading">{label}</h2>
                {group.editionId && (
                  <Link href={`/admin/editions/${group.editionId}`} className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors">
                    View edition →
                  </Link>
                )}
              </div>
              <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
                <div
                  className="grid grid-cols-[1fr_90px_80px_80px_90px_55px_70px_80px_70px] gap-3 px-5 py-3 admin-surface"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                >
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Name</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Category</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Sell</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Cost</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Margin</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Comps</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Deposit</span>
                  <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                  <span></span>
                </div>
                {group.pkgs.map((pkg) => {
                  return (
                    <div key={pkg.id} style={{ borderBottom: "1px solid var(--admin-border)" }}>
                      <div
                        className="grid grid-cols-[1fr_90px_80px_80px_90px_55px_70px_80px_70px] gap-3 px-5 py-3 transition-colors"
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        <span className="text-sm font-medium admin-heading truncate cursor-pointer self-center" onClick={() => startEdit(pkg)}>{pkg.name}</span>
                        <span className="text-xs admin-muted self-center capitalize">{pkg.category || "—"}</span>
                        <span className="text-xs admin-muted self-center">{money(pkg.price)}</span>
                        <span className="text-xs admin-muted self-center">
                          {money(pkg.cost_estimate)}
                          {pkg.cost_per_person == null && pkg.cost_estimate != null && (
                            <span className="ml-1 text-[9px] text-[#0aa3c7]" title="Derived from components">~</span>
                          )}
                        </span>
                        <span className={`text-xs self-center font-medium ${pkg.margin == null ? "admin-faint" : pkg.margin < 0 ? "text-red-400" : "text-green-400"}`}>{money(pkg.margin)}</span>
                        <span className="text-xs admin-muted self-center">{pkg.component_count || "—"}</span>
                        <span className="text-xs admin-muted self-center">{money(pkg.deposit)}</span>
                        <span className="self-center"><StatusBadge status={pkg.status} /></span>
                        <span className="flex items-center gap-2 self-center justify-end">
                          <button onClick={() => duplicate(pkg.id)} className="admin-faint hover:text-[#0aa3c7] transition-colors" title="Duplicate">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                          </button>
                          <button onClick={() => remove(pkg.id)} className="admin-faint hover:text-red-400 transition-colors" title="Delete">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                          </button>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
