"use client";

import { useState } from "react";
import { SpotVisitRater } from "./raters";
import { SpotPhotos } from "./spot-photos";
import { useSpotguide } from "./spotguide-provider";
import { windWindowHasValue, asWindWindow } from "@/lib/spotguide";

/**
 * The "add what you know" zone for a spot — the crowd input IS the product
 * ("rated by NP7 and the crew"), so before a member has contributed it's a
 * loud, warm invitation with the ways-to-help spelled out. Once they've
 * contributed it goes quiet (subdued "✓ … — edit") and auto-folds after
 * saving, so it never nags.
 */
export function SpotContribute({ spotId, accent = "#00afdb", np7Ratings }: { spotId: string; accent?: string; np7Ratings?: Record<string, number> }) {
  const sg = useSpotguide();
  const [open, setOpen] = useState(false);
  const mine = sg.mineSpot(spotId);
  const rated = !!mine && (Object.values(mine.ratings ?? {}).some((n) => n > 0) || !!mine.level || (mine.conditions ?? []).length > 0 || windWindowHasValue(asWindWindow(mine.wind_window ?? {})));

  // (the forecast-model vote lives in the always-visible "Best forecast here"
  // panel above — not in this fold, where members kept missing it)
  const WAYS = ["★ Stars", "Level", "Conditions", "Wind window", "Photos"];

  const body = open && (
    <div className="px-5 pb-5 pt-4 space-y-2 border-t border-[#f0e9da]">
      <SpotVisitRater spotId={spotId} accent={accent} onSaved={() => setOpen(false)} defaults={np7Ratings} />
      <div className="mt-3 pt-3 border-t border-[#f0e9da]">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac] mb-2">Add a photo</p>
        <SpotPhotos spotId={spotId} photos={[]} accent={accent} mode="upload" />
      </div>
    </div>
  );

  if (rated) {
    return (
      <div className="rounded-2xl border border-[#ece3d3] bg-[#fdfaf3] overflow-hidden">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-[#fdf8ee] transition-colors">
          <span className="block text-[13.5px] font-bold text-[#1f9e57]">✓ You added your knowledge to this spot</span>
          <span className="shrink-0 inline-flex items-center gap-1.5 text-[13px] font-bold rounded-full px-4 py-2" style={{ color: accent, border: `1px solid ${accent}55` }}>
            {open ? "Close" : "Edit"}
            <svg className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </span>
        </button>
        {body}
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border-2" style={{ borderColor: `${accent}40`, background: `linear-gradient(135deg, ${accent}0d, #fffdf8 55%)` }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-white/40">
        <span className="min-w-0 flex items-start gap-3">
          <span className="shrink-0 grid place-items-center w-10 h-10 rounded-full text-[17px]" style={{ background: `linear-gradient(135deg, ${accent}22, #f47b2022)` }} aria-hidden>🤙</span>
          <span>
            <span className="block text-[16px] font-black tracking-[-0.01em] text-[#00374a]">Been here? Add what you know</span>
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {WAYS.map((w) => (
                <span key={w} className="text-[11px] font-bold text-[#5a6b72] bg-white border border-[#e8e0cf] rounded-full px-2 py-0.5">{w}</span>
              ))}
            </span>
          </span>
        </span>
        <span className="shrink-0 inline-flex items-center gap-1.5 text-[13.5px] font-bold rounded-full px-5 py-2.5 text-white shadow-[0_4px_14px_rgba(0,55,74,0.25)]" style={{ backgroundColor: accent }}>
          {open ? "Close" : "Add knowledge"}
          <svg className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>
      {body}
    </div>
  );
}
