"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExperienceComponentsManager } from "@/components/experience-components-manager";

interface Experience {
  id: string;
  title: string;
  slug: string;
  code: string | null;
  location: string;
  description: string;
  hero_image: string;
  gallery: string[];
  status: string;
  timezone: string;
  hotels: string[] | null;
  airport_code: string | null;
  notes: string | null;
  cancellation_policy: string | null;
  active_status: string | null;
  website_visible: boolean | null;
  notion_id: string | null;
  destination_id: string | null;
  page_template: string | null;
  airport_distance: string | null;
  transport_options: string[] | null;
}

interface Edition {
  id: string;
  experience_id: string;
  year: number;
  label: string | null;
  date_start: string | null;
  date_end: string | null;
  computed_price_from: number | null;
  computed_price_to: number | null;
  max_spots: number | null;
  spots_taken: number;
  confirmed_count: number;
  status: string;
  experience_code: string | null;
}

interface Hotel { id: string | null; name: string; prefix: string | null; }

// UTC-offset timezone options
const TIMEZONES = [
  "UTC-5", "UTC-4", "UTC-3", "UTC-1", "UTC+0", "UTC+1", "UTC+2", "UTC+3", "UTC+4", "UTC+5", "UTC+8", "UTC+9", "UTC+10",
];

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start) return "Dates TBD";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const sMonth = s.toLocaleDateString("en-US", { month: "short" });
  if (!e) return `${sMonth} ${s.getDate()}, ${s.getFullYear()}`;
  const eMonth = e.toLocaleDateString("en-US", { month: "short" });
  if (sMonth === eMonth) {
    return `${sMonth} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${sMonth} ${s.getDate()} – ${eMonth} ${e.getDate()}, ${s.getFullYear()}`;
}

function priceLabel(from: number | null, to: number | null) {
  if (from == null && to == null) return "Price from packages";
  if (from != null && to != null && from !== to)
    return `€${from.toLocaleString()} – €${to.toLocaleString()}`;
  const v = from ?? to;
  return `€${Number(v).toLocaleString()}`;
}

const STATUS_STYLES: Record<string, string> = {
  published: "bg-green-500/15 text-green-400",
  archived: "bg-red-500/15 text-red-400",
  private: "bg-purple-500/15 text-purple-400",
  draft: "admin-surface admin-muted",
};

export default function ExperienceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exp, setExp] = useState<Experience | null>(null);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [activeSection, setActiveSection] = useState("editions");
  const [destinations, setDestinations] = useState<{ id: string; name: string }[]>([]);
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [showAddHotel, setShowAddHotel] = useState(false);
  const [newHotel, setNewHotel] = useState({ name: "", prefix: "" });

  useEffect(() => {
    fetch(`/api/admin/experiences/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setExp(d);
        setEditions(d.editions || []);
        setLoading(false);
      });
    fetch(`/api/admin/hotels`)
      .then((r) => r.json())
      .then((d) => setHotels(d.hotels || []));
    fetch(`/api/admin/destinations`)
      .then((r) => r.json())
      .then((d) => setDestinations(Array.isArray(d) ? d.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })) : []));
  }, [id]);

  async function addHotel() {
    if (!newHotel.name) return;
    const res = await fetch(`/api/admin/hotels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newHotel.name, prefix: newHotel.prefix || null }),
    });
    if (res.ok) {
      const created = await res.json();
      setHotels((h) => [...h, { id: created.id, name: created.name, prefix: created.prefix }]);
      toggleHotel(created.name);
      setNewHotel({ name: "", prefix: "" });
      setShowAddHotel(false);
    }
  }

  async function handleSave() {
    if (!exp) return;
    setSaving(true);
    await fetch(`/api/admin/experiences/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: exp.title,
        slug: exp.slug,
        code: exp.code,
        location: exp.location,
        description: exp.description,
        gallery: exp.gallery,
        status: exp.status,
        timezone: exp.timezone,
        hotels: exp.hotels,
        airport_code: exp.airport_code,
        notes: exp.notes,
        cancellation_policy: exp.cancellation_policy,
        active_status: exp.active_status,
        website_visible: exp.website_visible,
        notion_id: exp.notion_id,
        page_template: exp.page_template,
        airport_distance: exp.airport_distance,
        transport_options: exp.transport_options,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleDelete() {
    if (!confirm("Delete this experience? All editions will also be deleted. This cannot be undone.")) return;
    await fetch(`/api/admin/experiences/${id}`, { method: "DELETE" });
    router.push("/admin/experiences");
  }

  async function handleAddEdition() {
    // Multiple editions per year are allowed — default to the latest year
    // (or current) and give a placeholder label the user can rename.
    const year = editions.length > 0
      ? Math.max(...editions.map((e) => e.year))
      : new Date().getFullYear();
    const res = await fetch("/api/admin/editions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experience_id: id, year, label: "New edition" }),
    });
    if (res.ok) {
      const newEdition = await res.json();
      router.push(`/admin/editions/${newEdition.id}`);
    }
  }

  function update(field: string, value: unknown) {
    setExp((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function toggleHotel(hotel: string) {
    const current = exp?.hotels || [];
    const next = current.includes(hotel)
      ? current.filter((h) => h !== hotel)
      : [...current, hotel];
    update("hotels", next);
  }

  if (loading) {
    return <div className="text-sm admin-faint">Loading...</div>;
  }

  if (!exp) {
    return <div className="text-sm text-red-400">Experience not found</div>;
  }

  const selectedHotels = exp.hotels || [];
  const inputClass =
    "w-full px-4 py-2.5 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1.5";

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/admin/experiences")}
            className="admin-faint transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold admin-heading">{exp.title}</h1>
              {exp.code && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-[0.05em] bg-[var(--admin-accent)]/15 text-[#0aa3c7]">
                  {exp.code}
                </span>
              )}
            </div>
            <p className="text-sm admin-muted">
              {exp.location}
              {selectedHotels.length > 0 ? ` • ${selectedHotels.join(", ")}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              const r = await fetch(`/api/admin/experiences/${id}/duplicate`, { method: "POST" });
              if (r.ok) { const d = await r.json(); router.push(`/admin/experiences/${d.id}`); }
            }}
            className="px-3 py-2 text-xs admin-muted hover:admin-heading transition-colors"
            title="Duplicate template + components (not editions)"
          >
            Duplicate
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-2 text-xs text-red-400/60 hover:text-red-400 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-50 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex items-center gap-1 mb-6" style={{ borderBottom: "1px solid var(--admin-border)" }}>
        {[["editions", "Editions"], ["template", "Template"], ["components", "Components"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveSection(key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${activeSection === key ? "admin-heading border-[var(--admin-accent)]" : "admin-muted border-transparent"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Editions (tiles) ── */}
      <div className={`mb-8 ${activeSection === "editions" ? "" : "hidden"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
          <h2 className="text-sm font-bold admin-heading">
            Editions <span className="admin-faint font-normal">({editions.length})</span>
          </h2>
          <p className="text-xs admin-faint">Year-specific instances — dates, spots, pricing, costs</p>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {editions.map((ed) => (
            <Link
              key={ed.id}
              href={`/admin/editions/${ed.id}`}
              className="rounded-xl p-4 transition-all group"
              style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--admin-text-faint)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--admin-border)")}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
                <div className="min-w-0">
                  <span className="block text-xl font-bold admin-heading truncate">{ed.label || ed.year}</span>
                  {ed.label && <span className="text-[11px] admin-faint">{ed.year}</span>}
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] shrink-0 ${
                    STATUS_STYLES[ed.status] || "admin-surface admin-muted"
                  }`}
                >
                  {ed.status}
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs admin-muted">
                  <svg className="w-3.5 h-3.5 admin-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  {formatDateRange(ed.date_start, ed.date_end)}
                </div>
                <div className="flex items-center gap-2 text-xs admin-muted">
                  <svg className="w-3.5 h-3.5 admin-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                  {priceLabel(ed.computed_price_from, ed.computed_price_to)}
                </div>
                <div className="flex items-center gap-2 text-xs admin-muted">
                  <svg className="w-3.5 h-3.5 admin-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  {ed.max_spots != null ? `${ed.confirmed_count}/${ed.max_spots} spots` : `${ed.confirmed_count} confirmed`}
                </div>
              </div>
              {ed.experience_code && (
                <div className="mt-3 pt-3 text-[10px] admin-faint font-mono" style={{ borderTop: "1px solid var(--admin-border)" }}>
                  {ed.experience_code}
                </div>
              )}
            </Link>
          ))}

          {/* Add edition tile */}
          <button
            onClick={handleAddEdition}
            className="rounded-xl p-4 flex flex-col items-center justify-center gap-2 min-h-[140px] border-2 border-dashed transition-colors"
            style={{ borderColor: "var(--admin-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <svg className="w-6 h-6 admin-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="text-xs admin-muted font-medium">Add Edition</span>
          </button>
        </div>
      </div>

      {/* ── Template / Components / Media tabs ── */}
      <div className="max-w-[720px]">
        <div className={activeSection === "template" ? "space-y-5" : "hidden"}>
          {/* Page template */}
          <div>
            <label className={labelClass}>Event-page template</label>
            <p className="text-xs admin-faint mb-2">Controls the public event-page layout. Smaller events can use a lighter template.</p>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "full", label: "Full", desc: "The complete, image-rich page" },
                { key: "compact", label: "Compact", desc: "Lighter layout for small events (coming soon)", disabled: true },
              ].map((t) => {
                const current = (exp.page_template || "full") === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    disabled={t.disabled}
                    onClick={() => !t.disabled && update("page_template", t.key)}
                    title={t.desc}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium border text-left transition-colors ${
                      current ? "admin-heading border-[var(--admin-accent)] bg-[var(--admin-accent)]/10" : "admin-surface admin-muted"
                    } ${t.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                    style={{ borderColor: current ? undefined : "var(--admin-border)" }}
                  >
                    <span className="block">{t.label}</span>
                    <span className="block text-[11px] admin-faint font-normal mt-0.5">{t.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title, Slug, Code */}
          <div className="grid grid-cols-[1fr_1fr_120px] gap-4">
            <div>
              <label className={labelClass}>Title</label>
              <input
                className={inputClass}
                value={exp.title}
                onChange={(e) => {
                  update("title", e.target.value);
                  update("slug", slugify(e.target.value));
                }}
              />
            </div>
            <div>
              <label className={labelClass}>Slug</label>
              <input
                className={inputClass}
                value={exp.slug}
                onChange={(e) => update("slug", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Code</label>
              <input
                className={`${inputClass} uppercase`}
                value={exp.code || ""}
                onChange={(e) => update("code", e.target.value.toUpperCase() || null)}
                placeholder="BON"
                maxLength={8}
              />
            </div>
          </div>
          <p className="text-xs admin-faint -mt-3">
            Editions auto-generate their slug (<span className="font-mono">{exp.slug}-2026</span>)
            and code (<span className="font-mono">{exp.code || "CODE"}-2026</span>) from these.
          </p>

          {/* Location & Airport */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Location</label>
              <input
                className={inputClass}
                value={exp.location}
                onChange={(e) => update("location", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Airport code</label>
              <input
                className={inputClass}
                value={exp.airport_code || ""}
                onChange={(e) => update("airport_code", e.target.value || null)}
                placeholder="e.g. ADB, BON, VRN"
              />
            </div>
          </div>

          {/* Arrival info (shown to members in Trip prep) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Distance from airport</label>
              <input
                className={inputClass}
                value={exp.airport_distance || ""}
                onChange={(e) => update("airport_distance", e.target.value || null)}
                placeholder="e.g. ≈ 30 min · 25 km"
              />
            </div>
            <div>
              <label className={labelClass}>Transport options <span className="admin-faint">(comma-separated)</span></label>
              <input
                className={inputClass}
                value={(exp.transport_options || []).join(", ")}
                onChange={(e) => update("transport_options", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                placeholder="Airport transfer, Taxi, Rental car (recommended)"
              />
            </div>
          </div>

          {/* Hotels (multi-select, DB-backed) */}
          <div>
            <label className={labelClass}>Hotels</label>
            <p className="text-xs admin-faint mb-2">Select every hotel used across this experience&apos;s editions. Prefix shown in brackets.</p>
            <div className="flex flex-wrap gap-2 items-center">
              {hotels.map((h) => {
                const active = selectedHotels.includes(h.name);
                return (
                  <button
                    key={h.name}
                    type="button"
                    onClick={() => toggleHotel(h.name)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active ? "bg-[var(--admin-accent)]/15 text-[#0aa3c7]" : "admin-surface admin-muted"
                    }`}
                    style={{ border: `1px solid ${active ? "rgba(10,163,199,0.4)" : "var(--admin-border)"}` }}
                  >
                    {active && <span className="mr-1">✓</span>}
                    {h.name}{h.prefix ? <span className="ml-1 admin-faint">({h.prefix})</span> : null}
                  </button>
                );
              })}
              {/* selected hotels not in the DB list (legacy) stay toggleable */}
              {selectedHotels.filter((s) => !hotels.some((h) => h.name === s)).map((s) => (
                <button key={s} type="button" onClick={() => toggleHotel(s)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--admin-accent)]/15 text-[#0aa3c7]" style={{ border: "1px solid rgba(10,163,199,0.4)" }}>
                  <span className="mr-1">✓</span>{s}
                </button>
              ))}
              <button type="button" onClick={() => setShowAddHotel((v) => !v)} className="px-3 py-1.5 rounded-lg text-xs font-medium admin-surface admin-faint" style={{ border: "1px dashed var(--admin-border)" }}>
                + Add hotel
              </button>
            </div>
            {showAddHotel && (
              <div className="flex items-center gap-2 mt-3">
                <input className={`${inputClass} max-w-[220px]`} placeholder="Hotel name" value={newHotel.name} onChange={(e) => setNewHotel({ ...newHotel, name: e.target.value })} />
                <input className={`${inputClass} max-w-[120px]`} placeholder="Prefix (e.g. BON)" value={newHotel.prefix} onChange={(e) => setNewHotel({ ...newHotel, prefix: e.target.value.toUpperCase() })} />
                <button type="button" onClick={addHotel} disabled={!newHotel.name} className="px-3 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors">Add</button>
              </div>
            )}
          </div>

          {/* Timezone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Timezone</label>
              <select
                className={inputClass}
                value={exp.timezone || ""}
                onChange={(e) => update("timezone", e.target.value)}
              >
                <option value="">Select timezone…</option>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                {exp.timezone && !TIMEZONES.includes(exp.timezone) && <option value={exp.timezone}>{exp.timezone}</option>}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>Description</label>
            <textarea
              className={`${inputClass} min-h-[120px] resize-y`}
              value={exp.description || ""}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>

          {/* Destination */}
          <div>
            <label className={labelClass}>Destination <span className="admin-faint">(links to the destination page)</span></label>
            <select
              className={inputClass}
              value={exp.destination_id || ""}
              onChange={(e) => update("destination_id", e.target.value || null)}
            >
              <option value="">— none</option>
              {destinations.map((dst) => <option key={dst.id} value={dst.id}>{dst.name}</option>)}
            </select>
          </div>

          {/* Internal Notes */}
          <div>
            <label className={labelClass}>Internal notes</label>
            <textarea
              className={`${inputClass} min-h-[80px] resize-y`}
              value={exp.notes || ""}
              onChange={(e) => update("notes", e.target.value || null)}
              placeholder="Private notes (not shown publicly)"
            />
          </div>

          {/* Cancellation Policy */}
          <div>
            <label className={labelClass}>Cancellation policy</label>
            <textarea
              className={`${inputClass} min-h-[80px] resize-y`}
              value={exp.cancellation_policy || ""}
              onChange={(e) => update("cancellation_policy", e.target.value || null)}
              placeholder="Cancellation terms..."
            />
          </div>

          {/* Note: What's included now lives on packages */}
          <div className="rounded-lg p-3 text-xs admin-faint" style={{ border: "1px dashed var(--admin-border)" }}>
            <span className="font-medium admin-muted">What&apos;s included</span> is now defined per package
            (in each edition&apos;s Packages tab), not on the experience template.
          </div>

          {/* Main image note — single source is Event Content */}
          <div className="rounded-lg p-3 text-xs admin-faint" style={{ border: "1px dashed var(--admin-border)" }}>
            <span className="font-medium admin-muted">Main image</span> (hero + listing card) is managed in{" "}
            <span className="admin-muted">Website → Event Content → Media</span>, the single source for all imagery.
          </div>

          {/* Status — operational lifecycle. "Active" = published value; whether it
              shows on the public website is a SEPARATE toggle below. */}
          <div>
            <label className={labelClass}>Template Status</label>
            <p className="text-xs admin-faint mb-2">Is this experience live for the team? <span className="admin-muted">Active</span> means it&apos;s running and taking bookings (per-year status is set on each edition). Showing it on the public website is a separate switch.</p>
            <div className="flex gap-2">
              {[
                { value: "draft", label: "Draft" },
                { value: "published", label: "Active" },
                { value: "archived", label: "Archived" },
              ].map((s) => (
                <button
                  key={s.value}
                  onClick={() => update("status", s.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    exp.status === s.value
                      ? s.value === "published"
                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                        : s.value === "archived"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "admin-heading border"
                      : "admin-surface admin-faint border"
                  }`}
                  style={{
                    borderColor: exp.status === s.value && s.value === "draft" ? "var(--admin-input-border)" :
                                 exp.status !== s.value ? "var(--admin-border)" : undefined,
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Public website visibility — independent of Active. An active experience
              can be invite-only (off the public site), e.g. Madagascar. */}
          <div>
            <label className={labelClass}>Public website</label>
            <p className="text-xs admin-faint mb-2">Show this experience on the public site &amp; gift options. Turn off for active-but-invite-only trips — it stays fully live in admin.</p>
            <button
              onClick={() => update("website_visible", exp.website_visible === false)}
              className="inline-flex items-center gap-2.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
              style={{ borderColor: "var(--admin-border)", backgroundColor: "var(--admin-surface)" }}
            >
              <span
                className="relative inline-block w-9 h-5 rounded-full transition-colors"
                style={{ backgroundColor: exp.website_visible === false ? "var(--admin-input-border)" : "#0aa3c7" }}
              >
                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: exp.website_visible === false ? "2px" : "18px" }} />
              </span>
              <span className="admin-heading">{exp.website_visible === false ? "Off website (invite-only)" : "Shown on website"}</span>
            </button>
          </div>

        </div>

        {/* Components tab */}
        <div className={activeSection === "components" ? "" : "hidden"}>
          <ExperienceComponentsManager experienceId={id} code={exp.code} />
        </div>

      </div>
    </div>
  );
}
