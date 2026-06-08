"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ImagePickerModal from "@/components/image-picker-modal";

interface Experience {
  id: string;
  title: string;
  slug: string;
  location: string;
  description: string;
  whats_included: string[];
  hero_image: string;
  gallery: string[];
  status: string;
  currency: string;
  timezone: string;
  hotel: string | null;
  airport_code: string | null;
  whatsapp_group_link: string | null;
  notes: string | null;
  cancellation_policy: string | null;
  active_status: string | null;
  total_fixed_costs: number | null;
  notion_id: string | null;
}

interface Edition {
  id: string;
  experience_id: string;
  year: number;
  date_start: string | null;
  date_end: string | null;
  price_from: number | null;
  price_to: number | null;
  deposit: number | null;
  max_spots: number | null;
  spots_taken: number;
  status: string;
  coaches: string | null;
  experience_code: string | null;
  po_code: string | null;
}

const HOTELS = ["Sorobon", "Wanapa", "Playa Surf", "Hotel Paradiso", "Alacati", "REF", "REF II"];

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start) return "—";
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

function EditionStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] ${
        status === "published"
          ? "bg-green-500/15 text-green-400"
          : status === "archived"
          ? "bg-red-500/15 text-red-400"
          : status === "private"
          ? "bg-purple-500/15 text-purple-400"
          : "admin-surface admin-muted"
      }`}
    >
      {status}
    </span>
  );
}

export default function ExperienceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [tab, setTab] = useState<"details" | "editions">("details");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exp, setExp] = useState<Experience | null>(null);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [includedItem, setIncludedItem] = useState("");
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
        location: exp.location,
        description: exp.description,
        whats_included: exp.whats_included,
        hero_image: exp.hero_image,
        gallery: exp.gallery,
        status: exp.status,
        currency: exp.currency,
        timezone: exp.timezone,
        hotel: exp.hotel,
        airport_code: exp.airport_code,
        whatsapp_group_link: exp.whatsapp_group_link,
        notes: exp.notes,
        cancellation_policy: exp.cancellation_policy,
        active_status: exp.active_status,
        total_fixed_costs: exp.total_fixed_costs,
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
    const nextYear = editions.length > 0
      ? Math.max(...editions.map((e) => e.year)) + 1
      : new Date().getFullYear();
    const res = await fetch("/api/admin/editions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experience_id: id, year: nextYear }),
    });
    if (res.ok) {
      const newEdition = await res.json();
      router.push(`/admin/editions/${newEdition.id}`);
    }
  }

  function update(field: string, value: unknown) {
    setExp((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  if (loading) {
    return <div className="text-sm admin-faint">Loading...</div>;
  }

  if (!exp) {
    return <div className="text-sm text-red-400">Experience not found</div>;
  }

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
            <h1 className="text-2xl font-bold admin-heading">{exp.title}</h1>
            <p className="text-sm admin-muted">{exp.location}{exp.hotel ? ` • ${exp.hotel}` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDelete}
            className="px-3 py-2 text-xs text-red-400/60 hover:text-red-400 transition-colors"
          >
            Delete
          </button>
          {tab === "details" && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save"}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6" style={{ borderBottom: "1px solid var(--admin-border)" }}>
        {(["details", "editions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] capitalize ${
              tab === t
                ? "admin-heading border-[#0aa3c7]"
                : "admin-muted border-transparent"
            }`}
          >
            {t === "editions" ? `Editions (${editions.length})` : t}
          </button>
        ))}
      </div>

      {tab === "details" && (
        <div className="max-w-[720px] space-y-5">
          {/* Title & Slug */}
          <div className="grid grid-cols-2 gap-4">
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
          </div>

          {/* Location & Hotel */}
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
              <label className={labelClass}>Hotel</label>
              <select
                className={inputClass}
                value={exp.hotel || ""}
                onChange={(e) => update("hotel", e.target.value || null)}
              >
                <option value="">No hotel</option>
                {HOTELS.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Airport & Timezone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Airport code</label>
              <input
                className={inputClass}
                value={exp.airport_code || ""}
                onChange={(e) => update("airport_code", e.target.value || null)}
                placeholder="e.g. ADB, BON, VRN"
              />
            </div>
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

          {/* Currency */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Currency</label>
              <select
                className={inputClass}
                value={exp.currency || "EUR"}
                onChange={(e) => update("currency", e.target.value)}
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Total Fixed Costs ({exp.currency || "EUR"})</label>
              <input
                type="number"
                className={inputClass}
                value={exp.total_fixed_costs || ""}
                onChange={(e) => update("total_fixed_costs", e.target.value ? Number(e.target.value) : null)}
                placeholder="Template-level fixed costs"
              />
            </div>
          </div>

          {/* WhatsApp Group Link */}
          <div>
            <label className={labelClass}>WhatsApp group link</label>
            <input
              className={inputClass}
              value={exp.whatsapp_group_link || ""}
              onChange={(e) => update("whatsapp_group_link", e.target.value || null)}
              placeholder="https://chat.whatsapp.com/..."
            />
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

          {/* What's included */}
          <div>
            <label className={labelClass}>What&apos;s included</label>
            <div className="space-y-1.5 mb-2">
              {(exp.whats_included || []).map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 px-3 py-1.5 admin-surface rounded-lg text-sm admin-muted" style={{ border: "1px solid var(--admin-border)" }}>
                    {item}
                  </span>
                  <button
                    onClick={() => {
                      const arr = [...(exp.whats_included || [])];
                      arr.splice(i, 1);
                      update("whats_included", arr);
                    }}
                    className="admin-faint hover:text-red-400 transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="Add item..."
                value={includedItem}
                onChange={(e) => setIncludedItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && includedItem.trim()) {
                    update("whats_included", [...(exp.whats_included || []), includedItem.trim()]);
                    setIncludedItem("");
                  }
                }}
              />
              <button
                onClick={() => {
                  if (includedItem.trim()) {
                    update("whats_included", [...(exp.whats_included || []), includedItem.trim()]);
                    setIncludedItem("");
                  }
                }}
                className="px-3 py-2 admin-surface admin-muted text-sm rounded-lg transition-colors"
                style={{ border: "1px solid var(--admin-border)" }}
              >
                Add
              </button>
            </div>
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
      )}

      {tab === "editions" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs admin-faint">Year-specific instances of this experience</p>
            <button
              onClick={handleAddEdition}
              className="px-3 py-1.5 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-xs font-bold rounded-lg transition-colors"
            >
              Add Edition
            </button>
          </div>

          {editions.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No editions yet</p>
              <p className="text-xs admin-faint mt-1">Create editions to define year-specific dates, pricing, and spots</p>
              <button
                onClick={handleAddEdition}
                className="mt-4 px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors"
              >
                Add First Edition
              </button>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              {/* Header */}
              <div
                className="grid grid-cols-[80px_180px_160px_80px_100px_1fr] gap-4 px-5 py-3 admin-surface"
                style={{ borderBottom: "1px solid var(--admin-border)" }}
              >
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Year</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Dates</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Price</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Spots</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Code</span>
              </div>

              {editions.map((ed) => (
                <Link
                  key={ed.id}
                  href={`/admin/editions/${ed.id}`}
                  className="grid grid-cols-[80px_180px_160px_80px_100px_1fr] gap-4 px-5 py-3.5 transition-colors"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <span className="text-sm font-bold admin-heading self-center">{ed.year}</span>
                  <span className="text-xs admin-muted self-center">
                    {formatDateRange(ed.date_start, ed.date_end)}
                  </span>
                  <span className="text-xs admin-muted self-center">
                    {ed.price_from && ed.price_to
                      ? `€${Number(ed.price_from).toLocaleString()} – €${Number(ed.price_to).toLocaleString()}`
                      : ed.price_from
                      ? `from €${Number(ed.price_from).toLocaleString()}`
                      : "—"}
                  </span>
                  <span className="text-xs admin-muted self-center">
                    {ed.max_spots != null ? `${ed.spots_taken}/${ed.max_spots}` : "—"}
                  </span>
                  <span className="self-center">
                    <EditionStatusBadge status={ed.status} />
                  </span>
                  <span className="text-xs admin-faint self-center truncate">
                    {ed.experience_code || ed.po_code || "—"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
