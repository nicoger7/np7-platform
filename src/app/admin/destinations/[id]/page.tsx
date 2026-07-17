"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ImagePickerModal from "@/components/image-picker-modal";
import { LEVELS, DESTINATION_CRITERIA, DESTINATION_TAGS, VERIFICATION_META, type Verification } from "@/lib/spotguide";

type Partner = { name: string; description: string; url: string; image?: string };
interface Dest {
  id: string; name: string; slug: string | null; region: string | null; country: string | null;
  hero_image: string | null; tagline: string | null; intro: string | null;
  hero_video_url: string | null; hero_video_start: number | null; hero_video_end: number | null;
  tags: string[] | null;
  wind_probability: string | null; wind_season: string | null; wind_speed: string | null;
  best_season: string | null; conditions: string | null; skill_levels: string | null;
  gallery: string[] | null; partners: Partner[] | null; status: string;
  // Spotguide (migration 062)
  np7_ratings: Record<string, number> | null; level_min: string | null; level_max: string | null; levels: string[] | null;
  spotguide_status: string | null;
}
interface Trip { id: string; title: string; slug: string; status: string }
interface SpotRow { id: string; name: string; slug: string | null; status: string; verification: string; level: string | null; hero_image: string | null; source: string }

export default function DestinationEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [d, setD] = useState<Dest | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [spots, setSpots] = useState<SpotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [addingSpot, setAddingSpot] = useState(false);
  const [picker, setPicker] = useState<{ kind: "hero" } | { kind: "gallery" } | { kind: "partner"; index: number } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/destinations/${id}`).then((r) => r.json()).then((x) => {
      if (x.destination) { setD({ ...x.destination, gallery: x.destination.gallery ?? [], partners: x.destination.partners ?? [], np7_ratings: x.destination.np7_ratings ?? {} }); setTrips(x.trips ?? []); setSpots(x.spots ?? []); }
      setLoading(false);
    });
  }, [id]);

  function set<K extends keyof Dest>(k: K, v: Dest[K]) { setD((p) => (p ? { ...p, [k]: v } : p)); }

  async function addSpot() {
    const name = prompt("New spot name (e.g. Sotavento)");
    if (!name?.trim()) return;
    setAddingSpot(true);
    const res = await fetch("/api/admin/spots", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination_id: id, name: name.trim() }),
    });
    setAddingSpot(false);
    if (res.ok) { const sp = await res.json(); router.push(`/admin/spots/${sp.id}`); }
    else { const j = await res.json().catch(() => ({})); alert(j.error || "Couldn't add spot."); }
  }

  async function save() {
    if (!d) return;
    await fetch(`/api/admin/destinations/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...d, partners: (d.partners ?? []).filter((p) => p.name.trim()) }),
    });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }
  async function remove() {
    if (!confirm("Delete this destination?")) return;
    await fetch(`/api/admin/destinations/${id}`, { method: "DELETE" });
    router.push("/admin/destinations");
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-sm admin-faint">Loading…</p></div>;
  if (!d) return <div className="py-16 text-center"><p className="text-sm admin-faint">Destination not found</p><p className="text-xs admin-faint mt-1">Run migration 022 if you just added it.</p></div>;

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)]";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const folder = d.slug ? `destinations/${d.slug}` : undefined;
  const partners = d.partners ?? [];
  const gallery = d.gallery ?? [];

  return (
    <div className="max-w-[760px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <Link href="/admin/destinations" className="text-xs admin-faint hover:admin-heading">← Destinations</Link>
          <h1 className="text-2xl font-bold admin-heading mt-1">{d.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={remove} className="px-3 py-2 text-xs text-red-400/60 hover:text-red-400">Delete</button>
          {d.slug && (
            <Link href={`/spotguide/${d.slug}`} target="_blank"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--admin-accent)] text-[var(--admin-accent)] text-[13px] font-bold px-4 py-2 hover:bg-[var(--admin-accent)]/10 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
              Preview page ↗
            </Link>
          )}
          <button onClick={save} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg">{saved ? "Saved!" : "Save"}</button>
        </div>
      </div>

      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-4">
          <div><label className={labelClass}>Name</label><input className={inputClass} value={d.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div><label className={labelClass}>Region</label><input className={inputClass} value={d.region ?? ""} onChange={(e) => set("region", e.target.value)} /></div>
          <div><label className={labelClass}>Country</label><input className={inputClass} value={d.country ?? ""} onChange={(e) => set("country", e.target.value)} /></div>
        </div>

        <div>
          <label className={labelClass}>Hero image</label>
          {d.hero_image ? (
            <div className="flex items-center gap-3">
              <div className="w-40 aspect-[16/9] bg-cover bg-center rounded-lg" style={{ backgroundImage: `url('${d.hero_image}')`, border: "1px solid var(--admin-border)" }} />
              <button onClick={() => setPicker({ kind: "hero" })} className="text-xs text-[#0aa3c7] hover:underline">Change</button>
              <button onClick={() => set("hero_image", "")} className="text-xs admin-faint hover:text-red-400">Remove</button>
            </div>
          ) : <button onClick={() => setPicker({ kind: "hero" })} className={`${inputClass} text-left admin-muted max-w-[200px]`}>Pick hero image…</button>}
        </div>

        <div><label className={labelClass}>Tagline</label><input className={inputClass} value={d.tagline ?? ""} onChange={(e) => set("tagline", e.target.value)} placeholder="Dream destination Alaçatı" /></div>
        <div><label className={labelClass}>Intro</label><textarea className={`${inputClass} min-h-[100px] resize-y`} value={d.intro ?? ""} onChange={(e) => set("intro", e.target.value)} /></div>

        {/* Hero video — a looped YouTube segment behind the header (falls back to the hero image). */}
        <div className="rounded-lg p-3" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <label className={labelClass}>Hero video (YouTube) — optional</label>
          <input className={inputClass} value={d.hero_video_url ?? ""} onChange={(e) => set("hero_video_url", e.target.value || null)} placeholder="https://youtu.be/… or the 11-char video ID" />
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div><label className={labelClass}>Loop from (seconds)</label><input type="number" min={0} className={inputClass} value={d.hero_video_start ?? ""} onChange={(e) => set("hero_video_start", e.target.value === "" ? null : Number(e.target.value))} placeholder="0" /></div>
            <div><label className={labelClass}>Loop to (seconds)</label><input type="number" min={0} className={inputClass} value={d.hero_video_end ?? ""} onChange={(e) => set("hero_video_end", e.target.value === "" ? null : Number(e.target.value))} placeholder="e.g. 42" /></div>
          </div>
          <p className="text-xs admin-faint mt-1.5">Muted, auto-looping just the chosen window. Leave both blank to loop the whole clip. The hero image is the poster while it loads.</p>
        </div>

        {/* Vibe tags — power the spotguide filter (country · level · vibe). */}
        <div>
          <label className={labelClass}>Vibe tags <span className="admin-faint">(for the spotguide filter)</span></label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {DESTINATION_TAGS.map((t) => {
              const on = (d.tags ?? []).includes(t);
              return (
                <button key={t} type="button"
                  onClick={() => set("tags", on ? (d.tags ?? []).filter((x) => x !== t) : [...(d.tags ?? []), t])}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${on ? "border-[#0aa3c7] bg-[#0aa3c7]/10 admin-heading" : "admin-surface admin-muted"}`}
                  style={{ borderColor: on ? undefined : "var(--admin-border)" }}>
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div><label className={labelClass}>Wind probability</label><input className={inputClass} value={d.wind_probability ?? ""} onChange={(e) => set("wind_probability", e.target.value)} placeholder="80–90%" /></div>
          <div><label className={labelClass}>Wind season</label><input className={inputClass} value={d.wind_season ?? ""} onChange={(e) => set("wind_season", e.target.value)} placeholder="May–October" /></div>
          <div><label className={labelClass}>Wind speed</label><input className={inputClass} value={d.wind_speed ?? ""} onChange={(e) => set("wind_speed", e.target.value)} placeholder="15–25 kn" /></div>
          <div><label className={labelClass}>Best season</label><input className={inputClass} value={d.best_season ?? ""} onChange={(e) => set("best_season", e.target.value)} /></div>
          <div><label className={labelClass}>Skill levels</label><input className={inputClass} value={d.skill_levels ?? ""} onChange={(e) => set("skill_levels", e.target.value)} placeholder="All levels" /></div>
          <div><label className={labelClass}>Status</label>
            <select className={inputClass} value={d.status} onChange={(e) => set("status", e.target.value)}>
              {["draft", "published", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div><label className={labelClass}>Conditions</label><textarea className={`${inputClass} min-h-[60px] resize-y`} value={d.conditions ?? ""} onChange={(e) => set("conditions", e.target.value)} /></div>

        {/* Gallery */}
        <div>
          <label className={labelClass}>Gallery</label>
          <div className="grid grid-cols-4 gap-2">
            {gallery.map((url, i) => (
              <div key={i} className="relative group aspect-square rounded-lg overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button onClick={() => set("gallery", gallery.filter((_, j) => j !== i))} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-black/60 text-white rounded w-5 h-5 text-xs">✕</button>
              </div>
            ))}
            <button onClick={() => setPicker({ kind: "gallery" })} className="aspect-square rounded-lg border-2 border-dashed grid place-items-center admin-faint hover:admin-heading" style={{ borderColor: "var(--admin-border)" }}>+</button>
          </div>
        </div>

        {/* Partners */}
        <div>
          <label className={labelClass}>Local partners</label>
          <p className="text-[11px] admin-faint mb-2">Hotels show automatically from the trips&apos; packages. Add other local partners (surf school, rental, transfer) here — give each a logo or photo.</p>
          <div className="space-y-2">
            {partners.map((p, i) => (
              <div key={i} className="flex items-start gap-2">
                <button
                  onClick={() => setPicker({ kind: "partner", index: i })}
                  className="w-12 h-12 shrink-0 rounded-lg bg-cover bg-center grid place-items-center text-[10px] admin-faint hover:admin-heading"
                  style={{ border: "1px solid var(--admin-border)", backgroundImage: p.image ? `url('${p.image}')` : undefined }}
                  title="Partner logo / photo"
                >{p.image ? "" : "Img"}</button>
                <div className="grid grid-cols-[1fr_2fr_1fr_auto] gap-2 flex-1">
                  <input className={inputClass} placeholder="Name" value={p.name} onChange={(e) => set("partners", partners.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  <input className={inputClass} placeholder="Description" value={p.description} onChange={(e) => set("partners", partners.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                  <input className={inputClass} placeholder="URL" value={p.url} onChange={(e) => set("partners", partners.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
                  <button onClick={() => set("partners", partners.filter((_, j) => j !== i))} className="admin-faint hover:text-red-400 px-2">✕</button>
                </div>
              </div>
            ))}
            <button onClick={() => set("partners", [...partners, { name: "", description: "", url: "", image: "" }])} className="text-xs text-[#0aa3c7] hover:underline">+ Add partner</button>
          </div>
        </div>

        {/* ── Spotguide ──────────────────────────────────────────────── */}
        <div className="rounded-xl p-4 space-y-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold admin-heading">Spotguide</h3>
              <p className="text-[11px] admin-faint">The member-interactive guide — rate the destination, set its level range, manage its spots. Published independently of the marketing page.</p>
            </div>
            <select className={`${inputClass} max-w-[150px]`} value={d.spotguide_status ?? "draft"} onChange={(e) => set("spotguide_status", e.target.value)}>
              <option value="draft">Spotguide: draft</option>
              <option value="published">Spotguide: live</option>
            </select>
          </div>

          {/* Levels it suits — multi-select; stored as levels[] + derived min/max */}
          <div>
            <label className={labelClass}>Levels it suits <span className="admin-faint font-normal">(pick any that fit)</span></label>
            {(() => {
              const rankIdx = (l: string | null) => (l ? LEVELS.indexOf(l as (typeof LEVELS)[number]) : -1);
              // source of truth = levels[]; before migration 085 fall back to the min→max span
              const selected: string[] = d.levels?.length
                ? d.levels
                : (d.level_min && d.level_max ? LEVELS.slice(rankIdx(d.level_min), rankIdx(d.level_max) + 1) : []);
              return (
                <div className="flex flex-wrap gap-2">
                  {LEVELS.map((l) => {
                    const on = selected.includes(l);
                    return (
                      <button key={l} type="button" onClick={() => {
                        const next = on ? selected.filter((x) => x !== l) : [...selected, l];
                        const ordered = LEVELS.filter((x) => next.includes(x));
                        set("levels", ordered);
                        set("level_min", ordered[0] ?? null);        // derived for the public range label
                        set("level_max", ordered[ordered.length - 1] ?? null);
                      }}
                        className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                        style={on ? { backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" } : { border: "1px solid var(--admin-border)" }}>
                        {l}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            <p className="text-[11px] admin-faint mt-1">Shows on the public spotguide as a range (e.g. “Intermediate–Pro”).</p>
          </div>

          {/* NP7 destination rating */}
          <div>
            <p className="text-xs font-bold admin-heading mb-2">NP7 rating <span className="admin-faint font-normal">(the whole-trip experience)</span></p>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
              {DESTINATION_CRITERIA.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3 py-1" title={c.hint}>
                  <span className="text-xs admin-muted">{c.label}</span>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => {
                      const cur = (d.np7_ratings ?? {})[c.key] ?? 0;
                      return <button key={n} onClick={() => set("np7_ratings", { ...(d.np7_ratings ?? {}), [c.key]: n === cur ? 0 : n })} className="text-lg leading-none" style={{ color: n <= cur ? "#f5a623" : "var(--admin-border)" }}>★</button>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Spots */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold admin-heading">Spots <span className="admin-faint font-normal">({spots.length})</span></p>
              <button onClick={addSpot} disabled={addingSpot} className="text-xs font-bold text-[#0aa3c7] hover:underline disabled:opacity-50">{addingSpot ? "Adding…" : "+ Add spot"}</button>
            </div>
            {spots.length === 0 ? (
              <p className="text-xs admin-faint">No spots yet. Add the launches people sail at here.</p>
            ) : (
              <div className="space-y-1.5">
                {spots.map((sp) => {
                  const vm = VERIFICATION_META[(sp.verification as Verification)] ?? VERIFICATION_META.np7;
                  return (
                    <Link key={sp.id} href={`/admin/spots/${sp.id}`} className="flex items-center gap-3 p-2 rounded-lg transition-colors hover:bg-black/5" style={{ border: "1px solid var(--admin-border)" }}>
                      <div className="w-12 h-9 rounded bg-cover bg-center shrink-0 admin-surface" style={{ backgroundImage: sp.hero_image ? `url('${sp.hero_image}')` : undefined }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold admin-heading truncate">{sp.name}</p>
                        <p className="text-[11px] admin-faint">{[sp.level, sp.status, sp.source === "member" ? "member" : null].filter(Boolean).join(" · ")}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0" style={{ backgroundColor: `${vm.color}1f`, color: vm.color }}>{vm.short}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Trips */}
        <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-2">Trips to this destination <span className="admin-faint font-normal">({trips.length})</span></h3>
          {trips.length === 0 ? (
            <p className="text-xs admin-faint">No experiences point here yet. Set the destination on an experience&apos;s Template tab.</p>
          ) : (
            <div className="space-y-1">
              {trips.map((t) => (
                <Link key={t.id} href={`/admin/experiences/${t.id}`} className="flex items-center gap-2 text-xs py-1 admin-muted hover:text-[#0aa3c7]">
                  <span className="flex-1 truncate">{t.title}</span>
                  <span className="admin-faint">{t.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {picker && (
        <ImagePickerModal
          defaultFolder={folder}
          onSelect={(url) => {
            if (picker.kind === "hero") set("hero_image", url);
            else if (picker.kind === "gallery") set("gallery", [...gallery, url]);
            else set("partners", partners.map((x, j) => (j === picker.index ? { ...x, image: url } : x)));
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
