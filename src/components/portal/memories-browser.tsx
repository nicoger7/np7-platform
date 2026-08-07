"use client";

import { useState } from "react";
import type { TripMemories } from "@/lib/portal-data";
import { cdnImage } from "@/lib/img";
import { MemberGallery } from "./member-gallery";
import { TripVideoGrid } from "./trip-video-grid";

/** "My memories" — a tile grid of trips (cover photo + count) that opens into
    the full per-trip gallery. Keeps the landing short once a member has several
    trips, instead of stacking every trip's crew-shared sections down the page. */
export function MemoriesBrowser({ trips }: { trips: TripMemories[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? trips.find((t) => t.bookingId === openId) : null;

  if (open) {
    // Photo fallback for clips without a poster: use a trip photo so a preview
    // always shows, never a black box.
    const coverPhoto = open.groups.flatMap((g) => g.photos)[0];
    const fallbackPoster = coverPhoto ? cdnImage(coverPhoto, { width: 1200 }) : undefined;
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
        {/* Photos first (members curate their own keepers here), then videos. */}
        {open.total > 0 && <MemberGallery groups={open.groups} keeperBookingId={open.bookingId} />}
        {open.videos.length > 0 && (
          <div className="mt-6">
            <TripVideoGrid videos={open.videos} bookingId={open.bookingId} fallbackPoster={fallbackPoster} title="Trip videos" />
          </div>
        )}
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
            <div className="relative aspect-[4/3] overflow-hidden rounded-t-2xl bg-cover bg-center bg-[#e9eef0]"
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
