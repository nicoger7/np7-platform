"use client";

import Link from "next/link";
import { useState } from "react";
import type { FitSegment, FitIcon } from "@/lib/hardware/types";
import { HW_ACCENT } from "@/lib/hardware/types";

type Props = {
  segments: FitSegment[];
  accent?: string;
};

// Small inline SVGs keyed by FitIcon value
const ICONS: Record<FitIcon, React.ReactNode> = {
  spark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  wave: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0" />
      <path d="M2 18c2-4 4-4 6 0s4 4 6 0 4-4 6 0" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  trophy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M8 21h8M12 17v4" />
      <path d="M7 4H4a1 1 0 00-1 1v2a6 6 0 006 6h6a6 6 0 006-6V5a1 1 0 00-1-1h-3" />
      <path d="M7 4h10v4a5 5 0 01-10 0V4z" />
    </svg>
  ),
  compass: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="12" cy="12" r="10" />
      <path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
    </svg>
  ),
  rocket: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
};

export function FindYourFit({ segments, accent = HW_ACCENT }: Props) {
  const [active, setActive] = useState(0);

  if (!segments || segments.length === 0) return null;

  const seg = segments[active] ?? segments[0];

  return (
    <section id="find-your-fit" className="scroll-mt-20 py-16 sm:py-24">
      <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
        {/* heading */}
        <div className="text-center max-w-[620px] mx-auto mb-10">
          <p className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase mb-3" style={{ color: accent }}>
            // FIND YOUR FIT
          </p>
          <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.02em] text-white mb-4">
            Which rider are you?
          </h2>
          <p className="text-[16px] text-white/65 leading-relaxed">
            Tap the profile that sounds like you — and see how this board fits your riding.
          </p>
        </div>

        {/* chip tablist */}
        <div role="tablist" aria-label="Rider type" className="flex flex-wrap justify-center gap-2.5 mb-10">
          {segments.map((s, i) => {
            const on = i === active;
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={on}
                onClick={() => setActive(i)}
                className={`inline-flex items-center gap-2 px-4 sm:px-5 py-3 rounded-full text-[13.5px] font-bold border transition-all ${
                  on
                    ? "text-black border-transparent shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
                    : "bg-white/[0.07] text-white/80 border-white/15 hover:border-white/40 hover:text-white"
                }`}
                style={on ? { backgroundColor: accent, borderColor: accent } : undefined}
              >
                <span style={on ? { color: "#000" } : { color: accent }}>
                  {ICONS[s.icon]}
                </span>
                {s.chip}
              </button>
            );
          })}
        </div>

        {/* sliding panel */}
        <div
          key={seg.id}
          role="tabpanel"
          className="hw-fyf-anim grid lg:grid-cols-2 rounded-[28px] overflow-hidden border border-white/10 bg-white/[0.05] backdrop-blur-md shadow-[0_30px_70px_rgba(0,0,0,0.4)]"
        >
          {/* image side */}
          <div className="relative min-h-[280px] lg:min-h-[420px]">
            {seg.image ? (
              <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${seg.image}')` }} />
            ) : (
              <div className="absolute inset-0 bg-[#1a1a1e]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-black/50 to-transparent" />
            <span
              className="absolute top-5 left-5 text-[10px] font-extrabold tracking-[0.2em] uppercase px-3 py-1.5 rounded-full text-black"
              style={{ backgroundColor: accent }}
            >
              {seg.tag}
            </span>
          </div>

          {/* content side */}
          <div className="p-8 sm:p-11 flex flex-col justify-center">
            <h3 className="text-2xl sm:text-[32px] font-black tracking-[-0.02em] text-white leading-[1.08] mb-4">
              {seg.title}
            </h3>
            <p className="text-[15.5px] text-white/70 leading-relaxed mb-6">{seg.body}</p>
            {seg.points.length > 0 && (
              <ul className="space-y-3 mb-8">
                {seg.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-3 text-[15px] text-white/85 font-medium">
                    <span
                      className="mt-0.5 shrink-0 w-5 h-5 rounded-full grid place-items-center"
                      style={{ backgroundColor: `${accent}22`, color: accent }}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </span>
                    {pt}
                  </li>
                ))}
              </ul>
            )}
            {seg.cta && seg.cta_href && (
              <div>
                <Link
                  href={seg.cta_href}
                  className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-[14px] font-bold text-black hover:-translate-y-0.5 transition-all"
                  style={{
                    backgroundColor: accent,
                    boxShadow: `0 4px 16px ${accent}44`,
                  }}
                >
                  {seg.cta}
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes hwFyfIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .hw-fyf-anim { animation: hwFyfIn .42s ease; }
        @media (prefers-reduced-motion: reduce) { .hw-fyf-anim { animation: none; } }
      `}</style>
    </section>
  );
}
