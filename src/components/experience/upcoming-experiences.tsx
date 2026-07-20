"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Reveal } from "./reveal";
import { BrandedTile } from "./branded-tile";
import { placeFromLocation, flagFromLocation, type TilePlacement } from "@/lib/experience-tile";
import { cdn } from "@/lib/cdn";

const SIG_IMG = cdn("hero/windsurf-hero-poster.jpg");

/** The invite-only "Signature Trips" tier — a tile that sits at the END of the
 *  experiences grid, deliberately dark + gold so it reads as the premium step up
 *  from the regular (white-card) trips. Links to the public application page. */
function SignatureTile() {
  return (
    <Reveal as="article" className="h-full">
      {/* same GPU-only hover as the trip cards: lift on the wrapper, hover
          shadow as an opacity cross-fade layer (box-shadow never animates) */}
      <div className="group relative h-full transform-gpu transition-transform duration-[420ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1.5">
        <div aria-hidden className="absolute inset-0 rounded-[18px] shadow-[0_32px_62px_rgba(0,20,30,0.44)] opacity-0 group-hover:opacity-100 transition-opacity duration-[420ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]" />
      <Link
        href="/signature"
        className="relative block h-full rounded-[18px] overflow-hidden border border-[#ffd97a]/25 shadow-[0_24px_50px_rgba(0,20,30,0.34)]"
        style={{ background: "linear-gradient(165deg,#013443 0%,#01222d 100%)" }}
      >
        <div className="relative h-[210px] overflow-hidden transform-gpu">
          <div className="absolute inset-0 bg-cover bg-center opacity-55 group-hover:opacity-75 group-hover:scale-[1.03] transition-[transform,opacity] duration-[420ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]" style={{ backgroundImage: `url('${SIG_IMG}')` }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(1,26,34,0.3) 0%, rgba(1,26,34,0.85) 100%)" }} />
          <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wide px-3 py-1.5 rounded-full text-[#3a2a05]" style={{ background: "linear-gradient(135deg,#ffe08a,#f0a500)" }}>✦ Invite only</span>
        </div>
        <div className="p-6">
          <p className="text-[12px] font-semibold text-[#ffd97a] mb-1.5">By application</p>
          <h3 className="text-xl font-extrabold tracking-[-0.02em] text-white mb-2.5">Signature Trips</h3>
          <p className="text-[14px] text-white/65 leading-relaxed line-clamp-2 mb-4">My most special trips — small, hand-picked crews, in places you talk about for years.</p>
          <div className="flex items-center justify-between pt-3 border-t border-white/10">
            <span className="text-[13px] font-semibold text-white/45">Selective</span>
            <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#ffd97a] group-hover:gap-2.5 transition-all">
              Apply
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </div>
        </div>
      </Link>
      </div>
    </Reveal>
  );
}

export type ExpCard = {
  id: string;
  slug: string;
  title: string;
  location: string | null;
  description: string | null;
  hero_image: string | null;
  priceLabel: string | null;
  dateLabel: string | null;
  spotsLeft: number | null;
  months: string[]; // "YYYY-MM" of every upcoming edition
  // Auto-branded tile (migration 069): when on, hero_image is a RAW photo and the
  // flag / place name / coach are composited live by <BrandedTile>.
  tileAuto?: boolean;
  coachName?: string | null;
  coachCutout?: string | null;
  /** Focal/position overrides for the branded tile (migration 110). */
  placement?: TilePlacement | null;
};

const monthLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

/**
 * "Upcoming experiences" with a clean month filter. The month chips are derived
 * from the trips themselves — only months that actually have an upcoming edition
 * show up, so new months appear automatically as trips are added.
 */
export function UpcomingExperiences({ experiences, showSignature = false }: { experiences: ExpCard[]; showSignature?: boolean }) {
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const e of experiences) for (const m of e.months) set.add(m);
    return Array.from(set).sort();
  }, [experiences]);

  const [month, setMonth] = useState<string | null>(null); // null = all
  const filtered = month ? experiences.filter((e) => e.months.includes(month)) : experiences;

  const chip = (active: boolean) =>
    `px-4 py-2 rounded-full text-[13px] font-bold transition-all ${
      active
        ? "bg-white text-[#00374a] shadow-[0_6px_18px_rgba(0,20,30,0.25)]"
        : "bg-white/10 text-white/80 border border-white/15 hover:bg-white/[0.18] hover:text-white"
    }`;

  return (
    <>
      {months.length > 1 && (
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          <button onClick={() => setMonth(null)} className={chip(month === null)}>All trips</button>
          {months.map((m) => (
            <button key={m} onClick={() => setMonth(m)} className={chip(month === m)}>{monthLabel(m)}</button>
          ))}
        </div>
      )}

      {filtered.length === 0 && !showSignature ? (
        <p className="text-center text-white/70">No trips that month — try another.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((exp, i) => (
            <Reveal key={exp.id + (month ?? "")} delay={(i % 3) * 80} as="article" className="h-full">
              {/* Hover animates transform + opacity ONLY (both GPU-composited).
                  Animating box-shadow repaints the big soft blur every frame —
                  that was the residual jank — so the hover shadow is a second
                  layer whose OPACITY cross-fades under the card instead. */}
              <div className="group relative h-full transform-gpu transition-transform duration-[420ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1.5">
                <div aria-hidden className="absolute inset-0 rounded-[18px] shadow-[0_32px_62px_rgba(0,20,30,0.38)] opacity-0 group-hover:opacity-100 transition-opacity duration-[420ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]" />
              <Link
                href={`/experience/${exp.slug}`}
                className="relative block h-full bg-white rounded-[18px] overflow-hidden border border-white/10 shadow-[0_24px_50px_rgba(0,20,30,0.28)]"
              >
                <div className="relative h-[210px] bg-[#e9eef0] overflow-hidden transform-gpu">
                  {exp.tileAuto && exp.hero_image ? (
                    <BrandedTile
                      photo={exp.hero_image}
                      place={placeFromLocation(exp.location).toUpperCase()}
                      flag={flagFromLocation(exp.location)}
                      coachName={exp.coachName}
                      coachCutout={exp.coachCutout}
                      placement={exp.placement}
                    />
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: exp.hero_image ? `url('${exp.hero_image}')` : undefined }} />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
                      <span className="absolute bottom-3 left-3 text-[11px] font-bold tracking-wide uppercase text-white drop-shadow">{exp.location}</span>
                    </>
                  )}
                  {typeof exp.spotsLeft === "number" && (
                    <span className={`absolute top-3 left-3 z-20 text-[11px] font-bold px-3 py-1.5 rounded-full backdrop-blur-md ${exp.spotsLeft > 0 ? "bg-white/85 text-[#00374a]" : "bg-[#f47b20] text-white"}`}>
                      {exp.spotsLeft > 0 ? `${exp.spotsLeft} spots left` : "Fully booked"}
                    </span>
                  )}
                </div>
                <div className="p-6">
                  <p className="text-[12px] font-semibold text-[#00afdb] mb-1.5">{exp.dateLabel}</p>
                  <h3 className="text-xl font-extrabold tracking-[-0.02em] text-[#00374a] mb-2.5 group-hover:text-[#00afdb] transition-colors">{exp.title}</h3>
                  {exp.description && <p className="text-[14px] text-[#6a7a80] leading-relaxed line-clamp-2 mb-4">{exp.description}</p>}
                  <div className="flex items-center justify-between pt-3 border-t border-[#f0f0f0]">
                    {exp.priceLabel ? <span className="text-[15px] font-bold text-[#00374a]">from {exp.priceLabel}</span> : <span />}
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#00afdb] group-hover:gap-2.5 transition-all">
                      View trip
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </span>
                  </div>
                </div>
              </Link>
              </div>
            </Reveal>
          ))}
          {showSignature && <SignatureTile />}
        </div>
      )}
    </>
  );
}
