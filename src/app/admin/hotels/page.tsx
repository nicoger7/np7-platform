"use client";

import { useState, useEffect, useCallback } from "react";
import ImagePickerModal from "@/components/image-picker-modal";
import { PublicBadge } from "@/components/admin/public-badge";

interface Hotel {
  id: string | null;
  name: string;
  prefix: string | null;
  location: string | null;
  image_url: string | null;
  images: string[] | null;
  description: string | null;
  website: string | null;
}

type PickTarget = { id: string; kind: "primary" | "gallery" };

export default function HotelsPage() {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);
  const [legacy, setLegacy] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [pick, setPick] = useState<PickTarget | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newHotel, setNewHotel] = useState({ name: "", prefix: "" });
  const [selId, setSelId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/hotels").then((r) => r.json()).then((d) => {
      setHotels((d.hotels || []).map((h: Hotel) => ({ ...h, images: h.images || [] })));
      setLegacy(d.source === "legacy");
      setLoading(false);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const setField = (id: string, key: keyof Hotel, value: unknown) =>
    setHotels((hs) => hs.map((h) => (h.id === id ? { ...h, [key]: value } : h)));

  async function save(h: Hotel) {
    if (!h.id) return;
    setSavingId(h.id);
    await fetch(`/api/admin/hotels/${h.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: h.name, prefix: h.prefix, location: h.location,
        image_url: h.image_url, images: h.images, description: h.description, website: h.website,
      }),
    });
    setSavingId(null);
    setSavedId(h.id);
    setTimeout(() => setSavedId((s) => (s === h.id ? null : s)), 2000);
  }

  async function remove(h: Hotel) {
    if (!h.id || !confirm(`Delete hotel "${h.name}"? Packages keep their data but lose the link.`)) return;
    await fetch(`/api/admin/hotels/${h.id}`, { method: "DELETE" });
    load();
  }

  async function create() {
    if (!newHotel.name) return;
    await fetch("/api/admin/hotels", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newHotel.name, prefix: newHotel.prefix || null }),
    });
    setNewHotel({ name: "", prefix: "" });
    setShowNew(false);
    load();
  }

  function applyPick(url: string) {
    if (!pick) return;
    if (pick.kind === "primary") setField(pick.id, "image_url", url);
    else setHotels((hs) => hs.map((h) => (h.id === pick.id ? { ...h, images: [...(h.images || []), url] } : h)));
    setPick(null);
  }

  const inputClass = "admin-input w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-[var(--admin-accent)]";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  if (loading) return <div className="p-8 text-sm admin-faint">Loading…</div>;

  return (
    <div className="p-6 sm:p-8 max-w-[920px] mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Hotels</h1>
          <p className="text-sm admin-muted">Hotel details &amp; photos shown in the booking accommodation step.</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">New Hotel</button>
      </div>

      {legacy && (
        <div className="mb-5 rounded-lg p-3 text-xs" style={{ border: "1px dashed var(--admin-border)", color: "var(--admin-text-muted)" }}>
          The hotels table isn&apos;t available yet (showing the legacy list). Apply migration 023 to edit hotel photos.
        </div>
      )}

      {showNew && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <div className="flex items-end gap-3">
            <div className="flex-1"><label className={labelClass}>Name</label><input className={inputClass} value={newHotel.name} onChange={(e) => setNewHotel({ ...newHotel, name: e.target.value })} /></div>
            <div className="w-32"><label className={labelClass}>Prefix</label><input className={inputClass} value={newHotel.prefix} onChange={(e) => setNewHotel({ ...newHotel, prefix: e.target.value })} placeholder="e.g. SOR" /></div>
            <button onClick={create} disabled={!newHotel.name} className="px-4 py-2 bg-[var(--admin-accent)] disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg">Add</button>
          </div>
        </div>
      )}

      {selId ? (
      <div className="flex flex-col lg:flex-row gap-4">
        {/* rail */}
        <div className="lg:w-56 shrink-0 flex lg:flex-col gap-1.5 lg:max-h-[80vh] lg:overflow-y-auto lg:pr-1">
          <button onClick={() => setSelId(null)} className="shrink-0 mb-1 flex items-center gap-1.5 text-xs font-semibold admin-muted hover:text-[var(--admin-accent)] transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            All hotels
          </button>
          {hotels.map((rh) => {
            const active = rh.id === selId;
            return (
              <button key={rh.id ?? rh.name} onClick={() => rh.id && setSelId(rh.id)} className="shrink-0 text-left px-3 py-2 rounded-lg transition-colors" style={{ background: active ? "var(--admin-accent)" : "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                <span className={`block text-xs font-semibold truncate ${active ? "text-[var(--admin-accent-contrast)]" : "admin-heading"}`}>{rh.name}</span>
                <span className={`block text-[10px] mt-0.5 truncate ${active ? "text-[var(--admin-accent-contrast)]/80" : "admin-faint"}`}>{rh.location || rh.prefix || "—"}</span>
              </button>
            );
          })}
        </div>
        {/* editor card */}
        <div className="flex-1 min-w-0 space-y-4">
        {hotels.filter((h) => h.id === selId).map((h) => (
          <div key={h.id ?? h.name} className="rounded-2xl p-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            <div className="flex gap-5">
              {/* primary image */}
              <div className="shrink-0">
                <label className={labelClass}>Preview photo<PublicBadge note="Hotel card photo in the public booking step + destination pages" /></label>
                {h.image_url ? (
                  <div className="relative w-44 h-32 rounded-xl overflow-hidden group" style={{ border: "1px solid var(--admin-border)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={h.image_url} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button onClick={() => h.id && setPick({ id: h.id, kind: "primary" })} className="px-2.5 py-1 bg-white/15 hover:bg-white/25 rounded text-[11px] text-white font-bold">Change</button>
                      <button onClick={() => h.id && setField(h.id, "image_url", "")} className="px-2.5 py-1 bg-red-500/25 hover:bg-red-500/40 rounded text-[11px] text-white font-bold">Remove</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => h.id && setPick({ id: h.id, kind: "primary" })} disabled={!h.id} className="w-44 h-32 rounded-xl border-2 border-dashed grid place-items-center admin-muted text-xs disabled:opacity-40" style={{ borderColor: "var(--admin-border)" }}>+ Photo</button>
                )}
              </div>

              {/* fields */}
              <div className="flex-1 min-w-0 grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Name<PublicBadge /></label><input className={inputClass} value={h.name ?? ""} onChange={(e) => h.id && setField(h.id, "name", e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelClass}>Prefix</label><input className={inputClass} value={h.prefix ?? ""} onChange={(e) => h.id && setField(h.id, "prefix", e.target.value)} /></div>
                  <div><label className={labelClass}>Location</label><input className={inputClass} value={h.location ?? ""} onChange={(e) => h.id && setField(h.id, "location", e.target.value)} /></div>
                </div>
                <div className="col-span-2"><label className={labelClass}>Website</label><input className={inputClass} value={h.website ?? ""} onChange={(e) => h.id && setField(h.id, "website", e.target.value)} placeholder="https://…" /></div>
                <div className="col-span-2"><label className={labelClass}>Short description<PublicBadge note="Shown under the hotel name in the public booking step" /></label><textarea className={`${inputClass} min-h-[56px] resize-y`} value={h.description ?? ""} onChange={(e) => h.id && setField(h.id, "description", e.target.value)} placeholder="One or two lines shown under the hotel name in the booking step." /></div>
              </div>
            </div>

            {/* gallery */}
            <div className="mt-4">
              <label className={labelClass}>More photos<PublicBadge note="Swappable photos on the expanded hotel card in the booking step" /></label>
              <div className="flex flex-wrap gap-2">
                {(h.images || []).map((src, i) => (
                  <div key={i} className="relative w-20 h-16 rounded-lg overflow-hidden group" style={{ border: "1px solid var(--admin-border)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => h.id && setField(h.id, "images", (h.images || []).filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded bg-black/60 text-white text-xs grid place-items-center opacity-0 group-hover:opacity-100">×</button>
                  </div>
                ))}
                <button onClick={() => h.id && setPick({ id: h.id, kind: "gallery" })} disabled={!h.id} className="w-20 h-16 rounded-lg border-2 border-dashed grid place-items-center admin-faint text-lg disabled:opacity-40" style={{ borderColor: "var(--admin-border)" }}>+</button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-4">
              <button onClick={() => remove(h)} disabled={!h.id} className="text-xs admin-faint hover:text-red-400 transition-colors disabled:opacity-40">Delete</button>
              {savedId === h.id && <span className="text-xs text-green-400">Saved ✓</span>}
              <button onClick={() => save(h)} disabled={!h.id || savingId === h.id} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors">{savingId === h.id ? "Saving…" : "Save"}</button>
            </div>
          </div>
        ))}
        </div>
      </div>
      ) : (
      <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
        {hotels.map((h) => (
          <button
            key={h.id ?? h.name}
            onClick={() => h.id && setSelId(h.id)}
            disabled={!h.id}
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors disabled:opacity-50"
            style={{ borderBottom: "1px solid var(--admin-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            {h.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={h.image_url} alt="" className="w-14 h-10 object-cover rounded-md shrink-0" style={{ border: "1px solid var(--admin-border)" }} />
            ) : (
              <div className="w-14 h-10 rounded-md grid place-items-center text-[9px] admin-faint shrink-0" style={{ border: "1px dashed var(--admin-border)" }}>No photo</div>
            )}
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium admin-heading truncate">{h.name}</span>
              <span className="block text-xs admin-faint truncate">{h.location || h.prefix || "—"}{h.images?.length ? ` · ${h.images.length} photo${h.images.length !== 1 ? "s" : ""}` : ""}</span>
            </span>
            <svg className="w-4 h-4 shrink-0 admin-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        ))}
      </div>
      )}

      {pick && (
        <ImagePickerModal defaultFolder="hotels" onSelect={applyPick} onClose={() => setPick(null)} />
      )}
    </div>
  );
}
