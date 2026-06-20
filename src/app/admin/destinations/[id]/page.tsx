"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ImagePickerModal from "@/components/image-picker-modal";

type Partner = { name: string; description: string; url: string; image?: string };
interface Dest {
  id: string; name: string; slug: string | null; region: string | null; country: string | null;
  hero_image: string | null; tagline: string | null; intro: string | null;
  wind_probability: string | null; wind_season: string | null; wind_speed: string | null;
  best_season: string | null; conditions: string | null; skill_levels: string | null;
  gallery: string[] | null; partners: Partner[] | null; status: string;
}
interface Trip { id: string; title: string; slug: string; status: string }

export default function DestinationEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [d, setD] = useState<Dest | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [picker, setPicker] = useState<{ kind: "hero" } | { kind: "gallery" } | { kind: "partner"; index: number } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/destinations/${id}`).then((r) => r.json()).then((x) => {
      if (x.destination) { setD({ ...x.destination, gallery: x.destination.gallery ?? [], partners: x.destination.partners ?? [] }); setTrips(x.trips ?? []); }
      setLoading(false);
    });
  }, [id]);

  function set<K extends keyof Dest>(k: K, v: Dest[K]) { setD((p) => (p ? { ...p, [k]: v } : p)); }

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

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7]";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const folder = d.slug ? `destinations/${d.slug}` : undefined;
  const partners = d.partners ?? [];
  const gallery = d.gallery ?? [];

  return (
    <div className="max-w-[760px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/admin/destinations" className="text-xs admin-faint hover:admin-heading">← Destinations</Link>
          <h1 className="text-2xl font-bold admin-heading mt-1">{d.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={remove} className="px-3 py-2 text-xs text-red-400/60 hover:text-red-400">Delete</button>
          <button onClick={save} className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg">{saved ? "Saved!" : "Save"}</button>
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
          defaultFolder={folder ? `${folder}/${picker.kind}` : undefined}
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
