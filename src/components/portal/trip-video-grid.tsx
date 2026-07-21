"use client";

import { useEffect, useState } from "react";
import type { TripVideo } from "@/lib/portal-data";

/**
 * The trip page's clip grid — the same keeper-star behaviour as the Memories
 * browser (which keeps its own copy, scoped to whichever past trip is open).
 * Members star the clips they want kept past the 3-month purge.
 */
export function TripVideoGrid({ videos, bookingId, fallbackPoster }: { videos: TripVideo[]; bookingId: string; fallbackPoster?: string }) {
  const [keepers, setKeepers] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch(`/api/portal/memories/stars?bookingId=${bookingId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.videos) setKeepers(new Set(d.videos)); })
      .catch(() => {});
  }, [bookingId]);

  async function toggle(stem: string) {
    const starred = !keepers.has(stem);
    setKeepers((s) => { const n = new Set(s); starred ? n.add(stem) : n.delete(stem); return n; });
    await fetch("/api/portal/memories/stars", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, kind: "video", ref: stem, starred }),
    }).catch(() => setKeepers((s) => { const n = new Set(s); starred ? n.delete(stem) : n.add(stem); return n; }));
  }

  if (videos.length === 0) return null;
  // Keepers first — starred clips float to the top of the grid.
  const sorted = [...videos].sort((a, b) => (keepers.has(b.stem) ? 1 : 0) - (keepers.has(a.stem) ? 1 : 0));
  return (
    <div className="mt-4">
      <h3 className="text-[13px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-2">Trip videos</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {sorted.map((v) => {
          const kept = keepers.has(v.stem);
          return (
            <div key={v.stem} className="relative group">
              <video src={v.url} poster={v.poster ?? fallbackPoster} controls playsInline preload="none"
                className="w-full rounded-2xl bg-black aspect-video object-cover" />
              <button type="button" onClick={() => toggle(v.stem)} title={kept ? "Kept forever ⭐" : "Keep this forever"}
                className={`absolute top-2 right-2 z-10 w-8 h-8 rounded-full grid place-items-center transition-all ${kept ? "bg-amber-400 text-white shadow" : "bg-black/45 text-white opacity-0 group-hover:opacity-100"}`}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill={kept ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
              </button>
            </div>
          );
        })}
      </div>
      <p className="text-[11.5px] text-[#9aa6ac] mt-2">Videos stay for 3 months after the trip — star the ones you want to keep forever.</p>
    </div>
  );
}
