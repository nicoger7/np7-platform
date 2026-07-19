"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  METHOD_DIMENSIONS, METHOD_MOMENTUM_HEADING, METHOD_MOMENTUM_BODY, METHOD_CLOSING,
  METHOD_SUBHEAD, METHOD_LOOP, METHOD_WEEK,
} from "@/lib/np7-method";

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
        <span aria-hidden className="inline-block">↻</span> Every day, building on the last — that&apos;s why a week beats a lesson.
      </p>
    </Reveal>
  );
}

/** The week-momentum arc — a rising line from "you commit" to "the jump". */
function WeekArc() {
  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-4 relative">
      {/* rising connector line behind the nodes (desktop) */}
      <div aria-hidden className="hidden sm:block absolute left-[12%] right-[12%] top-[38px] h-[3px] rounded-full" style={{ background: "linear-gradient(90deg,#8fe6f2,#00afdb)" }} />
      {METHOD_WEEK.map((w, i) => (
        <Reveal key={w.k} delay={i * 120} className="relative text-center sm:text-left">
          <div className="flex sm:block items-center gap-3">
            <span className="relative z-10 grid place-items-center w-9 h-9 rounded-full text-[11px] font-black text-[#00374a] shrink-0 mx-auto sm:mx-0" style={{ background: "linear-gradient(135deg,#ffe08a,#00afdb)", boxShadow: "0 0 0 4px rgba(0,55,74,0.9)" }}>{i + 1}</span>
            <div className="mt-0 sm:mt-3 text-left">
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

        <div className="mt-11 sm:mt-14 flex flex-col gap-11 sm:gap-14">
          {METHOD_DIMENSIONS.map((d, i) => (
            <div key={d.name}>
              <Reveal className="grid sm:grid-cols-[auto_1fr] gap-4 sm:gap-8">
                <span className="text-[44px] sm:text-[52px] font-black leading-none text-[#00afdb]/25 tabular-nums sm:w-24 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="text-[22px] sm:text-[26px] font-extrabold text-[#00374a] tracking-[-0.02em]">{d.name}</h3>
                  <p className="text-[15px] sm:text-[16.5px] font-bold text-[#0a7f9e] mt-1.5">{d.oneLiner}</p>
                  <p className="text-[14.5px] sm:text-[15.5px] text-[#4a5a60] leading-relaxed mt-3 max-w-[640px]">{d.body}</p>
                </div>
              </Reveal>
              {/* the coaching loop rides under Technique — it's the mechanism behind it */}
              {i === 0 && <div className="sm:pl-[calc(6rem+2rem)]"><CoachingLoop /></div>}
            </div>
          ))}
        </div>
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
