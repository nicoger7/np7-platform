"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { VERIFICATION_META, conditionLabel, type Verification } from "@/lib/spotguide";

interface PendingSpot {
  id: string; name: string; destination_id: string; destinationName: string;
  level: string | null; conditions: string[] | null; description: string | null;
  verification: string; confirms: number; flags: number;
}
interface PendingPhoto { id: string; spot_id: string; url: string; caption: string | null }

export default function SpotguideModeration() {
  const [spots, setSpots] = useState<PendingSpot[]>([]);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/spotguide/pending").then((r) => r.json()).then((d) => { setSpots(d.spots ?? []); setPhotos(d.photos ?? []); setLoading(false); });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function moderatePhoto(id: string, status: "approved" | "rejected") {
    setBusy(id);
    await fetch(`/api/admin/spotguide/photos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setBusy(null);
    setPhotos((list) => list.filter((p) => p.id !== id));
  }

  async function act(id: string, patch: Record<string, string>) {
    setBusy(id);
    await fetch(`/api/admin/spots/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    setBusy(null);
    setSpots((list) => list.filter((s) => s.id !== id));
  }

  return (
    <div className="max-w-[860px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold admin-heading mb-1">Spotguide — contributions</h1>
        <p className="text-sm admin-muted">Member-submitted spots awaiting review. Community-verify needs 3 member confirmations; you can NP7-verify (gold) any time.</p>
      </div>

      {!loading && photos.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold admin-heading mb-2">Pending photos <span className="admin-faint font-normal">({photos.length})</span></h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
                <Link href={`/admin/spots/${p.spot_id}`} className="block aspect-[4/3] bg-cover bg-center" style={{ backgroundImage: `url('${p.url}')` }} />
                <div className="flex">
                  <button onClick={() => moderatePhoto(p.id, "approved")} disabled={busy === p.id} className="flex-1 py-1.5 text-xs font-bold text-green-500 hover:bg-green-500/10 disabled:opacity-50">Approve</button>
                  <button onClick={() => moderatePhoto(p.id, "rejected")} disabled={busy === p.id} className="flex-1 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/10 disabled:opacity-50 border-l" style={{ borderColor: "var(--admin-border)" }}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : spots.length === 0 ? (
        photos.length === 0 ? <div className="py-16 text-center"><p className="text-sm admin-faint">Nothing awaiting review</p><p className="text-xs admin-faint mt-1">Member-submitted spots &amp; photos will appear here.</p></div> : null
      ) : (
        <div className="space-y-3">
          {spots.map((s) => {
            const vm = VERIFICATION_META[(s.verification as Verification)] ?? VERIFICATION_META.pending;
            return (
              <div key={s.id} className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/spots/${s.id}`} className="text-sm font-bold admin-heading hover:text-[#0aa3c7]">{s.name}</Link>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ backgroundColor: `${vm.color}1f`, color: vm.color }}>{vm.short}</span>
                    </div>
                    <p className="text-[11px] admin-faint mt-0.5">{s.destinationName}{s.level ? ` · ${s.level}` : ""}{s.conditions?.length ? ` · ${s.conditions.map(conditionLabel).join(", ")}` : ""}</p>
                    {s.description && <p className="text-xs admin-muted mt-1.5 line-clamp-3">{s.description}</p>}
                    <p className="text-[11px] admin-faint mt-1.5">{s.confirms} member confirm{s.confirms === 1 ? "" : "s"}{s.flags ? ` · ${s.flags} flag${s.flags === 1 ? "" : "s"}` : ""}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={() => act(s.id, { verification: "np7" })} disabled={busy === s.id} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] disabled:opacity-50">NP7 verify</button>
                  <button onClick={() => act(s.id, { verification: "community" })} disabled={busy === s.id} className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50" style={{ border: "1px solid var(--admin-border)" }}>Approve (community)</button>
                  <button onClick={() => act(s.id, { status: "hidden" })} disabled={busy === s.id} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400/70 hover:text-red-400 disabled:opacity-50">Hide</button>
                  <Link href={`/admin/spots/${s.id}`} className="px-3 py-1.5 rounded-lg text-xs font-semibold admin-muted ml-auto" style={{ border: "1px solid var(--admin-border)" }}>Open editor</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
