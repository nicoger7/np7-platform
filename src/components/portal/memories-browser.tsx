"use client";

import { useState } from "react";
import type { TripMemories } from "@/lib/portal-data";
import { cdnImage } from "@/lib/img";
import { MemberGallery } from "./member-gallery";

/** "My memories" — a tile grid of trips (cover photo + count) that opens into
    the full per-trip gallery. Keeps the landing short once a member has several
    trips, instead of stacking every trip's crew-shared sections down the page. */
export function MemoriesBrowser({ trips }: { trips: TripMemories[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? trips.find((t) => t.bookingId === openId) : null;

  if (open) {
    return (
      <div>
        <button onClick={() => setOpenId(null)}
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#6a7a80] hover:text-[#00374a] mb-4">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          All trips
        </button>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-[22px] font-black tracking-[-0.02em] text-[#00374a]">{open.title}</h2>
          <span className="text-[13px] text-[#8a9aa0]">{open.dateLabel ? `${open.dateLabel} · ` : ""}{open.total} photo{open.total === 1 ? "" : "s"}</span>
        </div>
        {/* view-only: no bookingId/downloadsRemaining → no download button */}
        <MemberGallery groups={open.groups} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
      {trips.map((t) => {
        const cover = t.groups.flatMap((g) => g.photos)[0];
        return (
          <button key={t.bookingId} onClick={() => setOpenId(t.bookingId)}
            className="group text-left rounded-2xl overflow-hidden bg-white border border-[#f0e6d6] hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(0,55,74,0.10)] transition-all">
            <div className="relative aspect-[4/3] bg-cover bg-center bg-[#e9eef0]"
              style={{ backgroundImage: cover ? `url('${cdnImage(cover, { width: 700 })}')` : undefined }}>
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              <span className="absolute top-2.5 right-2.5 rounded-full bg-black/45 backdrop-blur px-2.5 py-1 text-white text-[12px] font-bold tabular-nums">
                {t.total} photo{t.total === 1 ? "" : "s"}
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
