"use client";

import { useState } from "react";
import { SpotVisitRater, ForecastVoter } from "./raters";
import { SpotPhotos } from "./spot-photos";

/**
 * The one clearly-separated "contribute" zone for a spot, so viewing/reading and
 * contributing never blur together. Collapsed by default — the spot reads clean;
 * tap to open the inputs (rate & facts, forecast vote, add a photo).
 */
export function SpotContribute({ spotId, accent = "#00afdb" }: { spotId: string; accent?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-dashed border-[#d8cdbb] bg-[#fffdf8] overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[#fdf8ee] transition-colors">
        <span className="min-w-0">
          <span className="block text-[14.5px] font-extrabold text-[#00374a]">★ Rate this spot &amp; add what you know</span>
          <span className="block text-[12.5px] text-[#6a7a80]">Give it stars, set level & conditions, vote the forecast, add a photo.</span>
        </span>
        <span className="shrink-0 inline-flex items-center gap-1.5 text-[13px] font-bold text-white rounded-full px-4 py-2" style={{ backgroundColor: accent }}>
          {open ? "Close" : "Rate it"}
          <svg className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-4 space-y-2 border-t border-[#f0e9da]">
          <SpotVisitRater spotId={spotId} accent={accent} />
          <ForecastVoter spotId={spotId} accent={accent} />
          <div className="mt-3 pt-3 border-t border-[#f0e9da]">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac] mb-2">Add a photo</p>
            <SpotPhotos spotId={spotId} photos={[]} accent={accent} mode="upload" />
          </div>
        </div>
      )}
    </div>
  );
}
