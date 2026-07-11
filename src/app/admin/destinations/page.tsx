"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Destination {
  id: string;
  name: string;
  region: string | null;
  country: string | null;
  hero_image: string | null;
  status: string;
  spotguide_status: string | null;
  experienceCount: number;
  submitted_by: string | null;
}

/** The two "hats" a place can wear, shown as badges on every card. */
function HatBadges({ d }: { d: Destination }) {
  const sg = d.spotguide_status;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {d.experienceCount > 0 && (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#0aa3c7]/15 text-[#0aa3c7]">Experience · {d.experienceCount}</span>
      )}
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${sg === "published" ? "bg-green-500/15 text-green-400" : "admin-surface admin-muted"}`}>
        {sg ? `Spotguide · ${sg}` : "Spotguide · off"}
      </span>
      {d.submitted_by && d.experienceCount === 0 && (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/15 text-amber-400">Rider-submitted</span>
      )}
    </div>
  );
}

function DestCard({ d }: { d: Destination }) {
  return (
    <Link href={`/admin/destinations/${d.id}`} className="block rounded-xl overflow-hidden transition-colors" style={{ border: "1px solid var(--admin-border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#0aa3c7")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--admin-border)")}
    >
      <div className="aspect-[16/9] bg-cover bg-center admin-surface" style={{ backgroundImage: d.hero_image ? `url('${d.hero_image}')` : undefined }} />
      <div className="p-4">
        <span className="block text-sm font-bold admin-heading truncate">{d.name}</span>
        <p className="text-xs admin-faint mt-0.5 truncate">{[d.region, d.country].filter(Boolean).join(", ") || "—"}</p>
        <HatBadges d={d} />
      </div>
    </Link>
  );
}

function DestSection({ title, subtitle, items, empty }: { title: string; subtitle: string; items: Destination[]; empty: string }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-black uppercase tracking-wide admin-heading">{title} <span className="admin-faint font-bold">· {items.length}</span></h2>
        <p className="text-xs admin-muted mt-0.5">{subtitle}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-xs admin-faint py-3">{empty}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((d) => <DestCard key={d.id} d={d} />)}
        </div>
      )}
    </section>
  );
}

export default function DestinationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", region: "", country: "" });
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/destinations").then((r) => r.json()).then((d) => {
      setItems(Array.isArray(d) ? d : []);
      setLoading(false);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!form.name.trim()) return;
    setError("");
    const res = await fetch("/api/admin/destinations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    if (res.ok) { const d = await res.json(); router.push(`/admin/destinations/${d.id}`); }
    else { const j = await res.json().catch(() => ({})); setError(j.error || "Failed"); }
  }

  async function generate() {
    setGenerating(true);
    const res = await fetch("/api/admin/destinations/generate", { method: "POST" });
    setGenerating(false);
    const j = await res.json().catch(() => ({}));
    if (res.ok) { alert(`Created ${j.created} destination${j.created === 1 ? "" : "s"} and linked ${j.linked} experience${j.linked === 1 ? "" : "s"}. Edit + fill content below.`); load(); }
    else alert(j.error || "Couldn't generate destinations.");
  }

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)]";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Destinations</h1>
          <p className="text-sm admin-muted max-w-2xl">One real-world place, up to two hats. <span className="font-semibold text-[#0aa3c7]">Experience destinations</span> are places we run trips (linked to a trip, polished sales page). <span className="font-semibold text-green-400">Spotguide destinations</span> are community spot guides — including rider-submitted places we don&apos;t sell (yet). A place can be both; the badges show which.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={generate} disabled={generating} className="px-4 py-2 admin-surface admin-muted text-sm font-bold rounded-lg transition-colors disabled:opacity-50" style={{ border: "1px solid var(--admin-border)" }} title="Create a destination for each experience location and link them">{generating ? "Generating…" : "Generate from experiences"}</button>
          <button onClick={() => setShowNew(!showNew)} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors">New Destination</button>
        </div>
      </div>

      {showNew && (
        <div className="mb-6 p-5 rounded-xl" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-4">New Destination</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><label className={labelClass}>Name *</label><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alaçatı" autoFocus /></div>
            <div><label className={labelClass}>Region</label><input className={inputClass} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="Aegean coast" /></div>
            <div><label className={labelClass}>Country</label><input className={inputClass} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Turkey" /></div>
          </div>
          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
          <div className="flex gap-2">
            <button onClick={create} disabled={!form.name.trim()} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg">Create</button>
            <button onClick={() => setShowNew(false)} className="px-4 py-2 admin-muted text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center"><p className="text-sm admin-faint">No destinations yet</p><p className="text-xs admin-faint mt-1">Create one to start building its page.</p></div>
      ) : (
        <div className="space-y-10">
          <DestSection
            title="Experience destinations"
            subtitle="Places we run trips — linked to a trip, with a polished sales page. Most are live spotguides too."
            items={items.filter((d) => d.experienceCount > 0)}
            empty="Nothing linked to a trip yet — link one from a trip, or use “Generate from experiences.”"
          />
          <DestSection
            title="Spotguide destinations"
            subtitle="Community spot guides, including rider-submitted places. We don't sell trips here (yet)."
            items={items.filter((d) => d.experienceCount === 0)}
            empty="No spotguide-only destinations yet."
          />
        </div>
      )}
    </div>
  );
}
