"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  METHOD_DIMENSIONS, METHOD_MOMENTUM_HEADING, METHOD_MOMENTUM_BODY, METHOD_CLOSING,
  METHOD_SUBHEAD, METHOD_LOOP, METHOD_WEEK, type MethodDimension,
} from "@/lib/np7-method";

// sun → sea accent rhythm across the dimension cards
const DIM_ACCENTS = ["#ffc42e", "#f47b20", "#00afdb"];

/** One dimension as a scannable card: number, name, one-liner — the full
 *  editorial body folds out on demand, so nothing is lost, just layered. */
function DimensionCard({ d, i }: { d: MethodDimension; i: number }) {
  const [open, setOpen] = useState(false);
  const accent = DIM_ACCENTS[i % DIM_ACCENTS.length];
  return (
    <div className="h-full rounded-2xl bg-white border border-[#eee2cc] p-5 sm:p-6 relative overflow-hidden">
      <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ background: `linear-gradient(180deg, ${accent}, ${accent}55)` }} />
      <div className="flex items-baseline gap-3">
        <span className="text-[30px] font-black leading-none tabular-nums" style={{ color: accent }}>{String(i + 1).padStart(2, "0")}</span>
        <h3 className="text-[19px] sm:text-[21px] font-extrabold text-[#00374a] tracking-[-0.02em]">{d.name}</h3>
      </div>
      <p className="text-[14.5px] font-bold text-[#0a7f9e] mt-2 leading-snug">{d.oneLiner}</p>
      <p className={`text-[13.5px] text-[#4a5a60] leading-relaxed mt-2.5 ${open ? "" : "line-clamp-2"}`}>{d.body}</p>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="mt-2 text-[12px] font-bold text-[#b0791e] hover:text-[#8a5c12] transition-colors">
        {open ? "Less ↑" : "The full story ↓"}
      </button>
    </div>
  );
}

// Scroll-reveal is a nicety for the full page (window scroll). Inside the modal
// the scroll container isn't the window, so a viewport-root observer never
// fires — there we just show everything. This context flips it per variant.
const AnimateCtx = createContext(true);

/** Reveal-on-scroll wrapper — fade + rise, staggered by `delay`, reduced-motion safe. */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const animate = useContext(AnimateCtx);
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(!animate);
  useEffect(() => {
    if (!animate) { setShown(true); return; }
    const el = ref.current;
    if (!el) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setShown(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, [animate]);
  return (
    <div ref={ref} className={`transition-all duration-700 ease-out ${shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** The visual "daily loop" — Ride → Film → Break it down → One focus point → repeat. */
function CoachingLoop() {
  return (
    <Reveal className="mt-6 rounded-2xl border border-[#d7ecf1] bg-[#f4fbfc] p-5 sm:p-7">
      <p className="text-[10.5px] font-black uppercase tracking-[0.18em] text-[#0a7f9e]">How a day compounds</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        {METHOD_LOOP.map((s, i) => (
          <div key={s.label} className="relative rounded-xl bg-white border border-[#e2eef1] px-4 py-3.5">
            <span className="text-[12px] font-black text-[#00afdb]/40 tabular-nums">{i + 1}</span>
            <p className="text-[14.5px] font-extrabold text-[#00374a] leading-tight mt-0.5">{s.label}</p>
            <p className="text-[12px] text-[#5a6b72] mt-1 leading-snug">{s.note}</p>
            {i < METHOD_LOOP.length - 1 && (
              <span aria-hidden className="hidden sm:block absolute top-1/2 -right-3 -translate-y-1/2 text-[#00afdb] font-black z-10">→</span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3.5 text-[12.5px] font-bold text-[#0a7f9e] flex items-center gap-2">
        <span aria-hidden className="inline-block">↻</span> Every session building on the last — that&apos;s why an experience beats a lesson.
      </p>
    </Reveal>
  );
}

/** The momentum arc — a connector line from "you commit" to "the jump".
 *  Mobile = clean vertical timeline (left rail); desktop = per-segment lines
 *  that run from each circle to the next (a single absolute line assumed
 *  centered columns and visibly missed the left-aligned circles). */
function WeekArc() {
  return (
    <div className="mt-8 relative grid gap-6 sm:gap-3 sm:grid-cols-4">
      {/* connector: vertical rail on mobile */}
      <div aria-hidden className="sm:hidden absolute left-[16px] top-3 bottom-3 w-[3px] rounded-full" style={{ background: "linear-gradient(180deg,#8fe6f2,#00afdb)" }} />
      {METHOD_WEEK.map((w, i) => (
        <Reveal key={w.k} delay={i * 120} className="relative">
          {/* desktop segment: from this circle's right edge to the next circle */}
          {i < METHOD_WEEK.length - 1 && (
            <span aria-hidden className="hidden sm:block absolute top-[17px] left-11 -right-3 h-[3px] rounded-full" style={{ background: "linear-gradient(90deg,#8fe6f2,#00afdb)" }} />
          )}
          <div className="flex sm:block items-start gap-4">
            <span className="relative z-10 grid place-items-center w-9 h-9 rounded-full text-[11px] font-black text-[#00374a] shrink-0" style={{ background: "linear-gradient(135deg,#ffe08a,#00afdb)", boxShadow: "0 0 0 4px rgba(0,55,74,0.9)" }}>{i + 1}</span>
            <div className="sm:mt-3 pt-1 sm:pt-0">
              <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#8fe6f2]">{w.k}</p>
              <p className="text-[16px] font-extrabold text-white leading-tight">{w.label}</p>
              <p className="text-[12.5px] text-white/60 leading-snug mt-0.5">{w.sub}</p>
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

/**
 * The full NP7 Method body — dimensions, the coaching loop, the week arc,
 * momentum + closing. Shared by /method (variant="page") and the in-trip modal
 * (variant="modal"). Page shows the outbound CTAs; the modal doesn't (you're
 * already on the trip — closing returns you to Reserve).
 */
export function MethodContent({ variant = "page" }: { variant?: "page" | "modal" }) {
  const isPage = variant === "page";
  return (
    <AnimateCtx.Provider value={isPage}>
      {/* THE SEVEN DIMENSIONS — editorial, numbered, revealed on scroll */}
      <section className={isPage ? "max-w-[880px] mx-auto px-6 sm:px-8 py-14 sm:py-20" : "px-6 sm:px-10 py-10"}>
        {!isPage && (
          <p className="text-[15px] text-[#4a5a60] leading-relaxed max-w-[640px] mb-10">{METHOD_SUBHEAD}</p>
        )}
        <Reveal>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#b0791e]">Seven dimensions · one rider</p>
          <h2 className="text-2xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mt-2 max-w-[620px]">Great windsurfing is seven things moving together</h2>
        </Reveal>

        {/* Card grid — one glance per dimension: number, name, one-liner. The
            full story folds out per card, so the page reads visual-first
            without losing a word of the copy. */}
        <div className="mt-9 sm:mt-11 grid sm:grid-cols-2 gap-4 sm:gap-5">
          {METHOD_DIMENSIONS.map((d, i) => (
            <Reveal key={d.name} delay={i * 60}>
              <DimensionCard d={d} i={i} />
            </Reveal>
          ))}
          {/* the coaching loop fills the 8th cell — the mechanism beside the dimensions */}
          <Reveal delay={7 * 60} className="sm:col-span-1">
            <div className="h-full rounded-2xl p-5 sm:p-6 flex flex-col justify-center text-white" style={{ background: "linear-gradient(150deg, #0a7f9e, #00374a)" }}>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#8fe6f2]">The mechanism</p>
              <p className="text-[19px] font-black tracking-[-0.01em] mt-1.5 leading-snug">Ride → film → break it down → one focus point.</p>
              <p className="text-[13px] text-white/70 mt-2 leading-snug">See how a day compounds ↓</p>
            </div>
          </Reveal>
        </div>

        <CoachingLoop />
      </section>

      {/* MOMENTUM + the week arc (dark band) */}
      <section className="relative overflow-hidden bg-[#00374a] text-white py-14 sm:py-20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_20%,rgba(0,175,219,0.22),transparent_55%)]" aria-hidden />
        <div className={`relative ${isPage ? "max-w-[880px] mx-auto px-6 sm:px-8" : "px-6 sm:px-10"}`}>
          <Reveal>
            <p className="text-[11px] font-bold tracking-[0.22em] text-[#8fe6f2] mb-3">HOW THE JUMP HAPPENS</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em]">{METHOD_MOMENTUM_HEADING}</h2>
            <p className="text-[15.5px] sm:text-[17px] text-white/70 leading-relaxed mt-5 max-w-[680px]">{METHOD_MOMENTUM_BODY}</p>
          </Reveal>
          <WeekArc />
        </div>
      </section>

      {/* CLOSING */}
      <section className={`${isPage ? "max-w-[760px] mx-auto px-6 sm:px-8 py-14 sm:py-20" : "px-6 sm:px-10 py-12"} text-center`}>
        <Reveal>
          <p className="text-[16px] sm:text-[18px] text-[#3a4a50] leading-relaxed">{METHOD_CLOSING}</p>
          {isPage && (
            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/blog/technique" className="inline-flex items-center gap-2 rounded-full border-2 border-[#00374a]/15 text-[#00374a] font-bold text-[14.5px] px-7 py-3.5 hover:border-[#00374a]/40 transition-colors">
                Read the technique guides <span aria-hidden>→</span>
              </Link>
              <Link href="/experience" className="inline-flex items-center gap-2 rounded-full font-black text-[14.5px] px-8 py-3.5 text-[#3a2a00] transition-transform hover:-translate-y-0.5" style={{ background: "linear-gradient(90deg,#ffc42e,#f47b20 60%,#00afdb)" }}>
                Live it on a trip <span aria-hidden>→</span>
              </Link>
            </div>
          )}
        </Reveal>
      </section>
    </AnimateCtx.Provider>
  );
}
