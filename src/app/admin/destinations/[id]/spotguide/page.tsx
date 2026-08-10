"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LEVELS, DESTINATION_CRITERIA, VERIFICATION_META, type Verification } from "@/lib/spotguide";

/**
 * The SPOTGUIDE side of a destination — deliberately its own page.
 *
 * One row in `destinations` feeds two public surfaces that have nothing to do
 * with each other: the marketing destination page a trip links to, and the
 * member-interactive spotguide. Editing them in one long form meant the
 * spotguide's spots, ratings and level range sat underneath the trip copy, so
 * "the destination page" and "the spotguide" read as one thing. They are not.
 *
 * Same record, two rooms. The other room is /admin/destinations/[id].
 */

interface Dest {
  id: string; name: string; slug: string | null; region: string | null; country: string | null;
  np7_ratings: Record<string, number> | null;
  level_min: string | null; level_max: string | null; levels: string[] | null;
  spotguide_status: string | null;
}
interface SpotRow { id: string; name: string; slug: string | null; status: string; verification: string; level: string | null; hero_image: string | null; source: string }

export default function DestinationSpotguideEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [d, setD] = useState<Dest | null>(null);
  const [spots, setSpots] = useState<SpotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingSpot, setAddingSpot] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/destinations/${id}`).then((r) => r.json()).then((x) => {
      if (x.destination) { setD({ ...x.destination, np7_ratings: x.destination.np7_ratings ?? {} }); setSpots(x.spots ?? []); }
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

  // Sends only the spotguide columns. A PATCH of the whole row from here would
  // let a stale copy of the marketing fields overwrite an edit made in the
  // other tab.
  async function save() {
    if (!d || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/destinations/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotguide_status: d.spotguide_status,
          levels: d.levels, level_min: d.level_min, level_max: d.level_max,
          np7_ratings: d.np7_ratings,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(res.status === 401 || res.redirected
          ? "Your admin session has expired — open a new tab, log in again, then come back and hit Save. Your edits are still on this page."
          : res.status === 403
            ? `${j.error || "Your role can't save this section."} Your edits are still on this page.`
            : `Save failed: ${j.error || `HTTP ${res.status}`}. Your edits are still on this page — try again.`);
        return;
      }
      const row = await res.json().catch(() => null);
      if (row?.id) setD((p) => (p ? { ...p, ...row, np7_ratings: row.np7_ratings ?? {} } : p));
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch {
      alert("Save failed — network error. Your edits are still on this page; check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-sm admin-faint">Loading…</p></div>;
  if (!d) return <div className="py-16 text-center"><p className="text-sm admin-faint">Destination not found</p></div>;

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)]";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const live = d.spotguide_status === "published";

  return (
    <div className="max-w-[760px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <Link href="/admin/destinations" className="text-xs admin-faint hover:admin-heading">← Destinations</Link>
          <h1 className="text-2xl font-bold admin-heading mt-1">{d.name}</h1>
          <p className="text-[11px] admin-faint mt-0.5">{[d.region, d.country].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex items-center gap-3">
          {d.slug && (
            <Link href={live ? `/spotguide/${d.slug}` : `/spotguide/proposed/${d.slug}`} target="_blank"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--admin-accent)] text-[var(--admin-accent)] text-[13px] font-bold px-4 py-2 hover:bg-[var(--admin-accent)]/10 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
              Spotguide page ↗
            </Link>
          )}
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg disabled:opacity-60">{saving ? "Saving…" : saved ? "Saved!" : "Save"}</button>
        </div>
      </div>

      {/* Two rooms, one record — say so, and make the door obvious. */}
      <div className="flex gap-1.5 mb-5">
        <Link href={`/admin/destinations/${id}`}
          className="px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors admin-muted hover:admin-heading"
          style={{ border: "1px solid var(--admin-border)" }}>
          Destination page
        </Link>
        <span className="px-3.5 py-1.5 rounded-full text-xs font-bold"
          style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>
          Spotguide
        </span>
      </div>

      <div className="space-y-5">
        <div className="rounded-xl p-4 space-y-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold admin-heading">Spotguide</h3>
              <p className="text-[11px] admin-faint">The member-interactive guide — rate the destination, set its level range, manage its spots. Published independently of the destination page.</p>
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
      </div>
    </div>
  );
}
