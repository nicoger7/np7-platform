"use client";

import { useState } from "react";
import type { SurveyInfo } from "@/lib/surveys";

/**
 * The tick-to-add info buttons under a survey place card.
 *
 * A survey asks one question — "would you come?" — and the honest answer needs
 * a little more than a blurb: who's coaching, what the spot is actually like,
 * what's included. Putting all of that inline would bury the question, so each
 * lives behind a small button that opens a sheet. Nothing renders for a button
 * whose content is empty, so a half-filled back end can never show a blank
 * pop-up.
 */
export function SurveyInfoButtons({ info }: { info: SurveyInfo }) {
  const [open, setOpen] = useState<"coach" | "spot" | "features" | null>(null);

  const hasCoach = info.coaches.length > 0;
  const hasSpot = !!(info.spot && (info.spot.intro || info.spot.tagline || info.spot.conditions));
  const hasFeatures = info.features.length > 0;
  if (!hasCoach && !hasSpot && !hasFeatures) return null;

  const btn = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-bold text-[#0a5a72] bg-[#e4f3f7] hover:bg-[#d3ecf2] transition-colors";

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-3">
        {hasCoach && (
          <button type="button" className={btn} onClick={() => setOpen("coach")}>
            <span aria-hidden>👤</span>{info.coaches.length > 1 ? "Your coaches" : "Your coach"}
          </button>
        )}
        {hasSpot && (
          <button type="button" className={btn} onClick={() => setOpen("spot")}>
            <span aria-hidden>📍</span>The spot
          </button>
        )}
        {hasFeatures && (
          <button type="button" className={btn} onClick={() => setOpen("features")}>
            <span aria-hidden>✓</span>What&apos;s included
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-[#00212b]/60 backdrop-blur-sm" onClick={() => setOpen(null)} />
          <div className="relative w-full sm:max-w-[560px] max-h-[85svh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 sm:p-7 shadow-[0_24px_70px_rgba(0,33,43,0.3)]">
            <button type="button" onClick={() => setOpen(null)} aria-label="Close"
              className="absolute top-4 right-4 w-8 h-8 grid place-items-center rounded-full text-[#6a7a80] hover:bg-[#f0f5f6]">✕</button>

            {open === "coach" && (
              <div>
                <p className="text-[11px] font-black tracking-[0.16em] uppercase text-[#b0791e] mb-3">
                  {info.coaches.length > 1 ? "Your coaches" : "Your coach"}
                </p>
                {info.coaches.map((c) => (
                  <div key={c.name} className="flex gap-4 mb-5 last:mb-0">
                    {c.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image} alt="" className="w-16 h-16 rounded-2xl object-cover shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[16px] font-black text-[#00374a] leading-tight">{c.name}</p>
                      {c.role && <p className="text-[12px] font-bold uppercase tracking-wide text-[#8a9aa0] mt-0.5">{c.role}</p>}
                      {c.bio && <p className="text-[13.5px] text-[#5a6b72] leading-relaxed mt-1.5 whitespace-pre-line">{c.bio}</p>}
                    </div>
                  </div>
                ))}
                {/* the method extract — how NP7 coaches, not just who */}
                {info.method && (info.method.intro || info.method.steps.length > 0) && (
                  <div className="mt-5 pt-5 border-t border-[#eef3f4]">
                    <p className="text-[11px] font-black tracking-[0.16em] uppercase text-[#b0791e] mb-2">How we coach</p>
                    {info.method.intro && <p className="text-[13.5px] text-[#5a6b72] leading-relaxed">{info.method.intro}</p>}
                    {info.method.steps.map((st, i) => (
                      <div key={i} className="mt-3">
                        <p className="text-[13.5px] font-bold text-[#00374a]">{st.t}</p>
                        {st.d && <p className="text-[13px] text-[#6a7a80] leading-relaxed mt-0.5">{st.d}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {open === "spot" && info.spot && (
              <div>
                <p className="text-[11px] font-black tracking-[0.16em] uppercase text-[#b0791e] mb-2">The spot</p>
                <p className="text-[19px] font-black text-[#00374a] leading-tight">{info.spot.name}</p>
                {info.spot.tagline && <p className="text-[14px] text-[#6a7a80] mt-1">{info.spot.tagline}</p>}
                {info.spot.intro && <p className="text-[13.5px] text-[#5a6b72] leading-relaxed mt-3 whitespace-pre-line">{info.spot.intro}</p>}
                <div className="flex flex-wrap gap-2 mt-4">
                  {([["Wind", info.spot.windSpeed], ["Season", info.spot.season], ["Conditions", info.spot.conditions]] as const)
                    .filter(([, v]) => !!v)
                    .map(([k, v]) => (
                      <span key={k} className="px-3 py-1.5 rounded-xl bg-[#f4f8f9] text-[12.5px]">
                        <span className="font-bold text-[#8a9aa0] uppercase tracking-wide text-[10.5px] mr-1.5">{k}</span>
                        <span className="font-semibold text-[#00374a]">{v}</span>
                      </span>
                    ))}
                </div>
              </div>
            )}

            {open === "features" && (
              <div>
                <p className="text-[11px] font-black tracking-[0.16em] uppercase text-[#b0791e] mb-3">What&apos;s included</p>
                <ul className="space-y-3">
                  {info.features.map((f) => (
                    <li key={f.name} className="flex gap-2.5">
                      <span className="text-[#0aa3c7] font-black shrink-0" aria-hidden>✓</span>
                      <span className="min-w-0">
                        <span className="block text-[14px] font-bold text-[#00374a]">{f.name}</span>
                        {f.description && <span className="block text-[13px] text-[#6a7a80] leading-relaxed mt-0.5">{f.description}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
