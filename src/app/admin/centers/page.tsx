"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import ImagePickerModal from "@/components/image-picker-modal";
import { PublicBadge } from "@/components/admin/public-badge";
import { SearchSelect } from "@/components/admin/search-select";

interface Center {
  id: string;
  name: string;
  prefix: string | null;
  location: string | null;
  image_url: string | null;
  images: string[] | null;
  description: string | null;
  website: string | null;
  maps_url: string | null;
  notes: string | null;
  destination_id: string | null;
}

type Destination = { id: string; name: string; country: string | null };
type PickTarget = { id: string; kind: "primary" | "gallery" };

export default function CentersPage() {
  const [centers, setCenters] = useState<Center[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [pick, setPick] = useState<PickTarget | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newCenter, setNewCenter] = useState<{ name: string; destination_id: string | null }>({ name: "", destination_id: null });
  const [selId, setSelId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/centers").then((r) => r.json()).then((d) => {
      setCenters((d.centers || []).map((c: Center) => ({ ...c, images: c.images || [] })));
      setDestinations(d.destinations || []);
      setLoading(false);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  const destName = useCallback(
    (id: string | null) => destinations.find((d) => d.id === id)?.name ?? null,
    [destinations],
  );

  // The list is short today and will not stay that way — every new season adds
  // the station it is run from. Search by name, by where it is, and by the
  // destination it hangs under, because "which one was the Tenerife one?" is
  // the question you actually arrive with.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return centers;
    return centers.filter((c) =>
      `${c.name ?? ""} ${c.location ?? ""} ${destName(c.destination_id) ?? ""} ${c.prefix ?? ""}`.toLowerCase().includes(q));
  }, [centers, query, destName]);

  const setField = (id: string, key: keyof Center, value: unknown) =>
    setCenters((cs) => cs.map((c) => (c.id === id ? { ...c, [key]: value } : c)));

  async function save(c: Center) {
    setSavingId(c.id);
    await fetch(`/api/admin/centers/${c.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: c.name, prefix: c.prefix, location: c.location, destination_id: c.destination_id,
        image_url: c.image_url, images: c.images, description: c.description,
        website: c.website, maps_url: c.maps_url, notes: c.notes,
      }),
    });
    setSavingId(null);
    setSavedId(c.id);
    setTimeout(() => setSavedId((s) => (s === c.id ? null : s)), 2000);
  }

  async function remove(c: Center) {
    if (!confirm(`Delete center "${c.name}"? It disappears from its destination page; the vendor record keeps its contact and terms.`)) return;
    await fetch(`/api/admin/centers/${c.id}`, { method: "DELETE" });
    setSelId((s) => (s === c.id ? null : s));
    load();
  }

  async function create() {
    if (!newCenter.name) return;
    await fetch("/api/admin/centers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCenter.name, destination_id: newCenter.destination_id }),
    });
    setNewCenter({ name: "", destination_id: null });
    setShowNew(false);
    load();
  }

  function applyPick(url: string) {
    if (!pick) return;
    if (pick.kind === "primary") setField(pick.id, "image_url", url);
    else setCenters((cs) => cs.map((c) => (c.id === pick.id ? { ...c, images: [...(c.images || []), url] } : c)));
    setPick(null);
  }

  const destOptions = destinations.map((d) => ({ value: d.id, label: d.name, hint: d.country ?? undefined }));
  const inputClass = "admin-input w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-[var(--admin-accent)]";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  if (loading) return <div className="p-8 text-sm admin-faint">Loading…</div>;

  return (
    <div className="p-6 sm:p-8 max-w-[920px] mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Centers</h1>
          <p className="text-sm admin-muted">The windsurf stations the weeks run from — shown as &ldquo;Where you ride&rdquo; on their destination page.</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">New Center</button>
      </div>

      {showNew && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <div className="flex items-end gap-3">
            <div className="flex-1"><label className={labelClass}>Name</label><input className={inputClass} value={newCenter.name} onChange={(e) => setNewCenter({ ...newCenter, name: e.target.value })} /></div>
            <div className="w-56">
              <label className={labelClass}>Destination</label>
              <SearchSelect value={newCenter.destination_id} onChange={(v) => setNewCenter({ ...newCenter, destination_id: v })}
                options={destOptions} placeholder="Pick a destination" searchPlaceholder="Search destinations…" clearLabel="No destination" />
            </div>
            <button onClick={create} disabled={!newCenter.name} className="px-4 py-2 bg-[var(--admin-accent)] disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg">Add</button>
          </div>
        </div>
      )}

      {selId ? (
      <div className="flex flex-col lg:flex-row gap-4">
        {/* rail */}
        <div className="lg:w-56 shrink-0 flex lg:flex-col gap-1.5 lg:max-h-[80vh] lg:overflow-y-auto lg:pr-1">
          <button onClick={() => setSelId(null)} className="shrink-0 mb-1 flex items-center gap-1.5 text-xs font-semibold admin-muted hover:text-[var(--admin-accent)] transition-colors">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            All centers
          </button>
          {centers.map((rc) => {
            const active = rc.id === selId;
            return (
              <button key={rc.id} onClick={() => setSelId(rc.id)} className="shrink-0 text-left px-3 py-2 rounded-lg transition-colors" style={{ background: active ? "var(--admin-accent)" : "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
                <span className={`block text-xs font-semibold truncate ${active ? "text-[var(--admin-accent-contrast)]" : "admin-heading"}`}>{rc.name}</span>
                <span className={`block text-[10px] mt-0.5 truncate ${active ? "text-[var(--admin-accent-contrast)]/80" : "admin-faint"}`}>{destName(rc.destination_id) || rc.location || "—"}</span>
              </button>
            );
          })}
        </div>
        {/* editor card */}
        <div className="flex-1 min-w-0 space-y-4">
        {centers.filter((c) => c.id === selId).map((c) => (
          <div key={c.id} className="rounded-2xl p-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
            <div className="flex gap-5">
              {/* primary image */}
              <div className="shrink-0">
                <label className={labelClass}>Preview photo<PublicBadge note="Center card photo on the destination page" /></label>
                {c.image_url ? (
                  <div className="relative w-44 h-32 rounded-xl overflow-hidden group" style={{ border: "1px solid var(--admin-border)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.image_url} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button onClick={() => setPick({ id: c.id, kind: "primary" })} className="px-2.5 py-1 bg-white/15 hover:bg-white/25 rounded text-[11px] text-white font-bold">Change</button>
                      <button onClick={() => setField(c.id, "image_url", "")} className="px-2.5 py-1 bg-red-500/25 hover:bg-red-500/40 rounded text-[11px] text-white font-bold">Remove</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setPick({ id: c.id, kind: "primary" })} className="w-44 h-32 rounded-xl border-2 border-dashed grid place-items-center admin-muted text-xs" style={{ borderColor: "var(--admin-border)" }}>+ Photo</button>
                )}
              </div>

              {/* fields */}
              <div className="flex-1 min-w-0 grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Name<PublicBadge /></label><input className={inputClass} value={c.name ?? ""} onChange={(e) => setField(c.id, "name", e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={labelClass}>Prefix</label><input className={inputClass} value={c.prefix ?? ""} onChange={(e) => setField(c.id, "prefix", e.target.value)} /></div>
                  <div><label className={labelClass}>Location<PublicBadge /></label><input className={inputClass} value={c.location ?? ""} onChange={(e) => setField(c.id, "location", e.target.value)} /></div>
                </div>
                {/* A hotel finds its destination through the packages that sell
                    its rooms. A center sells nothing, so this field IS the link:
                    empty means it appears on no destination page at all. */}
                <div className="col-span-2">
                  <label className={labelClass}>Destination<PublicBadge note="Decides which destination page this center appears on" /></label>
                  <SearchSelect value={c.destination_id} onChange={(v) => setField(c.id, "destination_id", v)}
                    options={destOptions} placeholder="Pick a destination" searchPlaceholder="Search destinations…" clearLabel="No destination — shows nowhere" />
                </div>
                <div className="col-span-2"><label className={labelClass}>Website<PublicBadge note="The “Visit centre” link on the destination page" /></label><input className={inputClass} value={c.website ?? ""} onChange={(e) => setField(c.id, "website", e.target.value)} placeholder="https://…" /></div>
                <div className="col-span-2"><label className={labelClass}>Google Maps link</label><input className={inputClass} value={c.maps_url ?? ""} onChange={(e) => setField(c.id, "maps_url", e.target.value)} placeholder="Paste a Maps link — or leave empty to search by name" /></div>
                <div className="col-span-2"><label className={labelClass}>Short description<PublicBadge note="Shown under the center name on the destination page" /></label><textarea className={`${inputClass} min-h-[56px] resize-y`} value={c.description ?? ""} onChange={(e) => setField(c.id, "description", e.target.value)} placeholder="Two or three sentences — what it is and why guests care." /></div>
                <div className="col-span-2"><label className={labelClass}>Internal notes</label><textarea className={`${inputClass} min-h-[44px] resize-y`} value={c.notes ?? ""} onChange={(e) => setField(c.id, "notes", e.target.value)} placeholder="Never shown to guests. Contact and cancellation terms live on the Vendors page." /></div>
              </div>
            </div>

            {/* gallery */}
            <div className="mt-4">
              <label className={labelClass}>More photos<PublicBadge note="Extra photos of the center" /></label>
              <div className="flex flex-wrap gap-2">
                {(c.images || []).map((src, i) => (
                  <div key={i} className="relative w-20 h-16 rounded-lg overflow-hidden group" style={{ border: "1px solid var(--admin-border)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setField(c.id, "images", (c.images || []).filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded bg-black/60 text-white text-xs grid place-items-center opacity-0 group-hover:opacity-100">×</button>
                  </div>
                ))}
                <button onClick={() => setPick({ id: c.id, kind: "gallery" })} className="w-20 h-16 rounded-lg border-2 border-dashed grid place-items-center admin-faint text-lg" style={{ borderColor: "var(--admin-border)" }}>+</button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-4">
              <button onClick={() => remove(c)} className="text-xs admin-faint hover:text-red-400 transition-colors">Delete</button>
              {savedId === c.id && <span className="text-xs text-green-400">Saved ✓</span>}
              <button onClick={() => save(c)} disabled={savingId === c.id} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors">{savingId === c.id ? "Saving…" : "Save"}</button>
            </div>
          </div>
        ))}
        </div>
      </div>
      ) : (
      <>
      <div className="mb-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search centers…" className="admin-input text-sm px-3 py-1.5 rounded-lg w-[240px]" />
      </div>
      <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelId(c.id)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
            style={{ borderBottom: "1px solid var(--admin-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            {c.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.image_url} alt="" className="w-14 h-10 object-cover rounded-md shrink-0" style={{ border: "1px solid var(--admin-border)" }} />
            ) : (
              <div className="w-14 h-10 rounded-md grid place-items-center text-[9px] admin-faint shrink-0" style={{ border: "1px dashed var(--admin-border)" }}>No photo</div>
            )}
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium admin-heading truncate">{c.name}</span>
              <span className="block text-xs admin-faint truncate">
                {destName(c.destination_id) || c.location || "No destination"}
                {c.images?.length ? ` · ${c.images.length} photo${c.images.length !== 1 ? "s" : ""}` : ""}
              </span>
            </span>
            <svg className="w-4 h-4 shrink-0 admin-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm admin-faint">
            {centers.length === 0 ? "No centers yet." : `Nothing matches “${query}”.`}
          </div>
        )}
      </div>
      </>
      )}

      {pick && (
        <ImagePickerModal defaultFolder="centers" onSelect={applyPick} onClose={() => setPick(null)} />
      )}
    </div>
  );
}
