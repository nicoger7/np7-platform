"use client";

import { useEffect, useState } from "react";
import type { TripMemories } from "@/lib/portal-data";
import { cdnImage } from "@/lib/img";
import { MemberGallery } from "./member-gallery";

/** "My memories" — a tile grid of trips (cover photo + count) that opens into
    the full per-trip gallery. Keeps the landing short once a member has several
    trips, instead of stacking every trip's crew-shared sections down the page. */
export function MemoriesBrowser({ trips }: { trips: TripMemories[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? trips.find((t) => t.bookingId === openId) : null;

  // Video keepers (photos are handled inside MemberGallery). Members star the
  // clips they want kept past the 3-month purge.
  const [videoKeepers, setVideoKeepers] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!openId) return;
    fetch(`/api/portal/memories/stars?bookingId=${openId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.videos) setVideoKeepers(new Set(d.videos)); })
      .catch(() => {});
  }, [openId]);
  async function toggleVideoKeeper(stem: string) {
    if (!openId) return;
    const starred = !videoKeepers.has(stem);
    setVideoKeepers((s) => { const n = new Set(s); starred ? n.add(stem) : n.delete(stem); return n; });
    await fetch("/api/portal/memories/stars", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: openId, kind: "video", ref: stem, starred }),
    }).catch(() => setVideoKeepers((s) => { const n = new Set(s); starred ? n.delete(stem) : n.add(stem); return n; }));
  }

  if (open) {
    // Photo fallback: if a clip has no poster (or on a slow connection, where
    // preload="none" means nothing loads until play), fall back to a trip photo
    // so the member always sees an image, never a black box.
    const coverPhoto = open.groups.flatMap((g) => g.photos)[0];
    const fallbackPoster = coverPhoto ? cdnImage(coverPhoto, { width: 1200 }) : undefined;
    // Keepers first — starred clips float to the top of the video grid.
    const sortedVideos = [...open.videos].sort((a, b) => (videoKeepers.has(b.stem) ? 1 : 0) - (videoKeepers.has(a.stem) ? 1 : 0));
    return (
      <div>
        <button onClick={() => setOpenId(null)}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a] mb-4">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          All trips
        </button>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-[22px] font-black tracking-[-0.02em] text-[#00374a]">{open.title}</h2>
          <span className="text-[13px] text-[#8a9aa0]">
            {open.dateLabel ? `${open.dateLabel} · ` : ""}
            {open.videos.length > 0 && <>{open.videos.length} video{open.videos.length === 1 ? "" : "s"} · </>}
            {open.total} photo{open.total === 1 ? "" : "s"}
          </span>
        </div>
        {open.videos.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[13px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-2">Trip videos</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {sortedVideos.map((v) => {
                const kept = videoKeepers.has(v.stem);
                return (
                  <div key={v.stem} className="relative group">
                    <video src={v.url} poster={v.poster ?? fallbackPoster} controls playsInline preload="none"
                      className="w-full rounded-2xl bg-black aspect-video object-cover" />
                    <button type="button" onClick={() => toggleVideoKeeper(v.stem)} title={kept ? "Kept forever ⭐" : "Keep this forever"}
                      className={`absolute top-2 right-2 z-10 w-8 h-8 rounded-full grid place-items-center transition-all ${kept ? "bg-amber-400 text-white shadow" : "bg-black/45 text-white opacity-0 group-hover:opacity-100"}`}>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill={kept ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Members curate their own keepers here (photos in the gallery, videos above). */}
        {open.total > 0 && <MemberGallery groups={open.groups} keeperBookingId={open.bookingId} />}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
      {trips.map((t) => {
        const coverPhoto = t.groups.flatMap((g) => g.photos)[0];
        const coverUrl = coverPhoto ? cdnImage(coverPhoto, { width: 700 }) : (t.videos.find((v) => v.poster)?.poster ?? undefined);
        return (
          <button key={t.bookingId} onClick={() => setOpenId(t.bookingId)}
            className="group text-left rounded-2xl overflow-hidden bg-white border border-[#f0e6d6] hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(0,55,74,0.10)] transition-all">
            <div className="relative aspect-[4/3] bg-cover bg-center bg-[#e9eef0]"
              style={{ backgroundImage: coverUrl ? `url('${coverUrl}')` : undefined }}>
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              <span className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                {t.videos.length > 0 && (
                  <span className="rounded-full bg-black/45 backdrop-blur px-2 py-1 text-white text-[12px] font-bold tabular-nums inline-flex items-center gap-1">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>{t.videos.length}
                  </span>
                )}
                {t.total > 0 && (
                  <span className="rounded-full bg-black/45 backdrop-blur px-2.5 py-1 text-white text-[12px] font-bold tabular-nums">
                    {t.total} photo{t.total === 1 ? "" : "s"}
                  </span>
                )}
              </span>
              <div className="absolute left-3.5 bottom-3 right-3.5">
                <h2 className="text-white text-[17px] sm:text-[18px] font-black tracking-[-0.02em] leading-tight">{t.title}</h2>
                {t.dateLabel && <p className="text-white/80 text-[12.5px] font-semibold mt-0.5">{t.dateLabel}</p>}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
