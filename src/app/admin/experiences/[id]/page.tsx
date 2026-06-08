"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ImagePickerModal from "@/components/image-picker-modal";

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
  notion_id: string | null;
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
  status: string;
  experience_code: string | null;
}

const HOTELS = ["Sorobon", "Wanapa", "Playa Surf", "Hotel Paradiso", "Alacati", "REF", "REF II"];

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
  const [showImagePicker, setShowImagePicker] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/experiences/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setExp(d);
        setEditions(d.editions || []);
        setLoading(false);
      });
  }, [id]);

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
        hero_image: exp.hero_image,
        gallery: exp.gallery,
        status: exp.status,
        timezone: exp.timezone,
        hotels: exp.hotels,
        airport_code: exp.airport_code,
        notes: exp.notes,
        cancellation_policy: exp.cancellation_policy,
        active_status: exp.active_status,
        notion_id: exp.notion_id,
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
    "w-full px-4 py-2.5 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1.5";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
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
                <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-[0.05em] bg-[#0aa3c7]/15 text-[#0aa3c7]">
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
            onClick={handleDelete}
            className="px-3 py-2 text-xs text-red-400/60 hover:text-red-400 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      {/* ── Editions (tiles) — first thing you see ── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
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
              <div className="flex items-center justify-between mb-3">
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
                  {ed.max_spots != null ? `${ed.spots_taken}/${ed.max_spots} spots` : `${ed.spots_taken} booked`}
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

      {/* ── Template details ── */}
      <div className="max-w-[720px]">
        <h2 className="text-sm font-bold admin-heading mb-4 pt-2">Template details</h2>
        <div className="space-y-5">
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

          {/* Hotels (multi-select) */}
          <div>
            <label className={labelClass}>Hotels</label>
            <p className="text-xs admin-faint mb-2">Select every hotel used across this experience&apos;s editions.</p>
            <div className="flex flex-wrap gap-2">
              {HOTELS.map((h) => {
                const active = selectedHotels.includes(h);
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => toggleHotel(h)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active ? "bg-[#0aa3c7]/15 text-[#0aa3c7]" : "admin-surface admin-muted"
                    }`}
                    style={{ border: `1px solid ${active ? "rgba(10,163,199,0.4)" : "var(--admin-border)"}` }}
                  >
                    {active && <span className="mr-1">✓</span>}
                    {h}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Timezone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Timezone</label>
              <input
                className={inputClass}
                value={exp.timezone || ""}
                onChange={(e) => update("timezone", e.target.value)}
                placeholder="Europe/Berlin"
              />
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

          {/* Hero image */}
          <div>
            <label className={labelClass}>Hero image</label>
            {exp.hero_image ? (
              <div className="relative group max-w-[400px]">
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={exp.hero_image} alt="Hero" className="w-full h-auto" />
                </div>
                <div className="absolute inset-0 rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowImagePicker(true)}
                    className="px-4 py-2 bg-white/15 hover:bg-white/25 rounded-lg text-sm text-white font-medium transition-colors"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={() => update("hero_image", "")}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-sm text-red-400 font-medium transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowImagePicker(true)}
                className="w-full max-w-[400px] py-10 rounded-xl border-2 border-dashed transition-colors flex flex-col items-center gap-2"
                style={{ borderColor: "var(--admin-border)" }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <svg className="w-8 h-8 admin-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
                <span className="text-sm admin-muted">Click to select image</span>
              </button>
            )}
          </div>

          {showImagePicker && (
            <ImagePickerModal
              onSelect={(url) => {
                update("hero_image", url);
                setShowImagePicker(false);
              }}
              onClose={() => setShowImagePicker(false)}
            />
          )}

          {/* Status */}
          <div>
            <label className={labelClass}>Template Status</label>
            <p className="text-xs admin-faint mb-2">Controls whether this template is active. Per-year status is set on each edition.</p>
            <div className="flex gap-2">
              {["draft", "published", "archived"].map((s) => (
                <button
                  key={s}
                  onClick={() => update("status", s)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                    exp.status === s
                      ? s === "published"
                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                        : s === "archived"
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "admin-heading border"
                      : "admin-surface admin-faint border"
                  }`}
                  style={{
                    borderColor: exp.status === s && s === "draft" ? "var(--admin-input-border)" :
                                 exp.status !== s ? "var(--admin-border)" : undefined,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
