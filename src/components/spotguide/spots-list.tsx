"use client";

import { useState } from "react";
import type { PublicSpot } from "@/lib/spotguide-data";
import {
  SPOT_CRITERIA, conditionLabel, bestWinds, windWindowHasValue,
  VERIFICATION_META, type Verification,
} from "@/lib/spotguide";
import { WindRose, WindRoseLegend } from "./wind-rose";
import { RatingHeadline, RatingBreakdown } from "./rating-panel";
import { ForecastPanel } from "./forecast-panel";
import { WindStatsChart } from "./wind-stats-chart";
import { SpotPhotos } from "./spot-photos";
import { SpotContribute } from "./spot-contribute";
import { SuggestEdit } from "./suggest-edit";

/** Foldable list of a destination's spots. Collapsed = name + key chips +
    score; expanded = photo, wind rose, ratings, forecast, infrastructure. */
export function SpotsList({ spots, accent = "#00afdb" }: { spots: PublicSpot[]; accent?: string }) {
  const [open, setOpen] = useState<string[]>(spots.length === 1 ? [spots[0].id] : []);
  const toggle = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  return (
    <div className="space-y-3">
      {spots.map((spot, i) => {
        const isOpen = open.includes(spot.id);
        const winds = bestWinds(spot.wind_window);
        const vm = VERIFICATION_META[(spot.verification as Verification)] ?? VERIFICATION_META.np7;
        const chips = [
          spot.level,
          spot.conditions.map(conditionLabel).join(" · "),
          winds.length ? `Best: ${winds.join(", ")}` : "",
        ].filter(Boolean);
        return (
          <div key={spot.id} className="rounded-2xl border border-[#ece3d3] bg-white overflow-hidden">
            <button type="button" onClick={() => toggle(spot.id)} aria-expanded={isOpen}
              className="w-full flex items-center gap-3 sm:gap-4 px-5 py-4 text-left hover:bg-[#fdfaf3] transition-colors">
              <span className="shrink-0 grid place-items-center w-7 h-7 rounded-full text-[13px] font-black" style={{ backgroundColor: `${accent}1a`, color: accent }}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[16px] sm:text-[17px] font-extrabold text-[#00374a] truncate">{spot.name}</span>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ backgroundColor: `${vm.color}1f`, color: vm.color }}>{vm.short}</span>
                </div>
                {chips.length > 0 && <div className="hidden sm:block text-[12px] font-semibold text-[#6a7a80] mt-0.5 truncate">{chips.join("  ·  ")}</div>}
              </div>
              <div className="hidden sm:block shrink-0"><RatingHeadline np7={spot.np7} member={spot.member} accent={accent} /></div>
              <svg className={`shrink-0 w-5 h-5 text-[#9aa6ac] transition-transform ${isOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>

            {/* Always rendered (not conditionally mounted) so every spot's
                detail is in the server HTML for search engines; the accordion
                just shows/hides it. */}
            <div className={isOpen ? "px-5 pb-6 pt-1 space-y-4" : "hidden"}>
              <div className="space-y-4">
                <div className="sm:hidden"><RatingHeadline np7={spot.np7} member={spot.member} accent={accent} /></div>
                {spot.hero_image && (
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-[#e9eef0]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={spot.hero_image} alt={spot.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  </div>
                )}
                {spot.description && <p className="text-[15.5px] text-[#5a6b72] leading-relaxed whitespace-pre-line">{spot.description}</p>}

                {(windWindowHasValue(spot.wind_window) || spot.crowdWindow.raters > 0) && (
                  <div className="p-4 rounded-xl bg-[#fdfaf3] border border-[#f0e9da]">
                    <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac] mb-2">Wind window</div>
                    <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                      {windWindowHasValue(spot.wind_window) && (
                        <div className="text-center"><WindRose window={spot.wind_window} size={112} />{spot.crowdWindow.raters > 0 && <span className="inline-block mt-1.5 text-[10px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full text-[#9aa6ac] bg-[#9aa6ac]/12">Spot</span>}</div>
                      )}
                      {spot.crowdWindow.raters > 0 && (
                        <div className="text-center"><WindRose window={spot.crowdWindow.window} size={112} /><span className="inline-block mt-1.5 text-[10px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full bg-[#1f9e57]/12 text-[#1f9e57]">Members · {spot.crowdWindow.raters}</span></div>
                      )}
                      <WindRoseLegend />
                    </div>
                  </div>
                )}

                {(spot.memberLevel.raters > 0 || spot.memberConditions.raters > 0) && (
                  <div className="rounded-xl border border-[#f0e9da] p-4 space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac]">Members say</div>
                    {spot.memberLevel.label && <p className="text-[13.5px] text-[#5a6b72]"><span className="font-semibold">Level:</span> <span className="text-[#00374a] font-bold">{spot.memberLevel.label}</span> <span className="text-[#9aa6ac]">({spot.memberLevel.raters})</span></p>}
                    {spot.memberConditions.shares.length > 0 && <p className="text-[13.5px] text-[#5a6b72]"><span className="font-semibold">Conditions:</span> {spot.memberConditions.shares.map((s) => `${s.pct}% ${s.label.toLowerCase()}`).join(" · ")}</p>}
                  </div>
                )}

                {spot.wind_stats && (
                  /* folded by default — the spot card stays scannable; one tap opens the full climatology */
                  <details className="group/stats rounded-xl bg-white border border-[#f0e9da] [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex items-center justify-between gap-3 p-4 cursor-pointer list-none select-none">
                      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac]">Wind statistics</span>
                      <svg className="w-4 h-4 text-[#c0ccd0] transition-transform group-open/stats:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                    </summary>
                    <div className="px-4 pb-4">
                      <WindStatsChart stats={spot.wind_stats} />
                    </div>
                  </details>
                )}

                <ForecastPanel np7Models={spot.np7_forecast_models} tally={spot.forecast} accent={accent} />

                {(spot.np7 > 0 || spot.member.count > 0) && (
                  <div className="rounded-xl border border-[#f0e9da] p-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac] mb-2.5">Ratings</div>
                    <RatingBreakdown criteria={SPOT_CRITERIA} np7Ratings={spot.np7_ratings} member={spot.member} />
                  </div>
                )}

                {(spot.gallery.length > 0 || spot.photos.length > 0) && (
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac] mb-2">Photos</div>
                    <SpotPhotos spotId={spot.id} photos={[...spot.gallery.map((url) => ({ url })), ...spot.photos.map((p) => ({ url: p.url, id: p.id, score: p.score }))]} accent={accent} mode="gallery" />
                  </div>
                )}

                {spot.infrastructure.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9aa6ac] mr-1">On site</span>
                    {spot.infrastructure.map((t) => <span key={t} className="text-[12px] font-semibold text-[#5a6b72] bg-[#f3ede0] rounded-full px-2.5 py-1">{t}</span>)}
                  </div>
                )}

                {/* Contribute — the one clearly-separated input zone */}
                <SpotContribute spotId={spot.id} accent={accent} np7Ratings={spot.np7_ratings} />
                <SuggestEdit spotId={spot.id} accent={accent}
                  current={{ name: spot.name, lat: spot.lat, lng: spot.lng }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
