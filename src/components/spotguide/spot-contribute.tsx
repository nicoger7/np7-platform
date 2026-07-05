"use client";

import { useState } from "react";
import { SpotVisitRater, ForecastVoter } from "./raters";
import { SpotPhotos } from "./spot-photos";
import { useSpotguide } from "./spotguide-provider";
import { windWindowHasValue, asWindWindow } from "@/lib/spotguide";

/**
 * The one clearly-separated "contribute" zone for a spot. Collapsed by default so
 * the spot reads clean. Once a member has rated, it stays quiet (a subdued "You
 * rated this — edit") and auto-folds after saving, so it never nags.
 */
export function SpotContribute({ spotId, accent = "#00afdb" }: { spotId: string; accent?: string }) {
  const sg = useSpotguide();
  const [open, setOpen] = useState(false);
  const mine = sg.mineSpot(spotId);
  const rated = !!mine && (Object.values(mine.ratings ?? {}).some((n) => n > 0) || !!mine.level || (mine.conditions ?? []).length > 0 || windWindowHasValue(asWindWindow(mine.wind_window ?? {})));

  return (
    <div className={`rounded-2xl border overflow-hidden ${rated ? "border-[#ece3d3] bg-[#fdfaf3]" : "border-dashed border-[#d8cdbb] bg-[#fffdf8]"}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-[#fdf8ee] transition-colors">
        <span className="min-w-0">
          {rated ? (
            <span className="block text-[13.5px] font-bold text-[#1f9e57]">✓ You rated this spot</span>
          ) : (
            <>
              <span className="block text-[14.5px] font-extrabold text-[#00374a]">★ Rate this spot &amp; add what you know</span>
              <span className="block text-[12.5px] text-[#6a7a80]">Give it stars, set level &amp; conditions, vote the forecast, add a photo.</span>
            </>
          )}
        </span>
        <span className={`shrink-0 inline-flex items-center gap-1.5 text-[13px] font-bold rounded-full px-4 py-2 ${rated ? "" : "text-white"}`}
          style={rated ? { color: accent, border: `1px solid ${accent}55` } : { backgroundColor: accent }}>
          {open ? "Close" : rated ? "Edit" : "Rate it"}
          <svg className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-4 space-y-2 border-t border-[#f0e9da]">
          <SpotVisitRater spotId={spotId} accent={accent} onSaved={() => setOpen(false)} />
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
