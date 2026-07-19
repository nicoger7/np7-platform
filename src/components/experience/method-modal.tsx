"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MethodContent } from "@/components/method/method-content";
import { METHOD_EYEBROW, METHOD_HEADLINE } from "@/lib/np7-method";

/**
 * "Read the full NP7 Method" — opens the full method as a full-screen overlay
 * ON the trip page instead of navigating away. High-intent visitors read the
 * whole thing and close straight back to the Reserve button — zero funnel leak.
 * (The standalone /method page stays for cold top-of-funnel traffic.)
 */
export function MethodModal() {
  const [open, setOpen] = useState(false);
  // Portal to <body> — the trigger sits inside transformed ancestors (Reveal),
  // which would otherwise trap position:fixed and collapse the overlay.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      {/* THE GER-7 SEAL — the trigger card. The ring is cut into SEVEN segments
          (the seven dimensions); the numeral is Nico's sail number filled with
          the sun-to-sea gradient. Slow compass drift; blooms on hover. */}
      <button type="button" onClick={() => setOpen(true)}
        className="group relative flex w-full max-w-[560px] items-center gap-4 sm:gap-5 rounded-2xl p-4 sm:p-5 text-left transition-all hover:-translate-y-0.5 active:translate-y-0 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00afdb] focus-visible:ring-offset-2 focus-visible:ring-offset-[#00374a]"
        style={{
          border: "1px solid transparent",
          background: "linear-gradient(rgba(0,25,34,0.55), rgba(0,25,34,0.55)) padding-box, linear-gradient(100deg, rgba(255,196,46,0.65), rgba(244,123,32,0.65) 45%, rgba(0,175,219,0.65)) border-box",
          boxShadow: "0 10px 34px rgba(0,10,16,0.35)",
        }}>
        {/* seal */}
        <span className="relative grid place-items-center w-16 h-16 sm:w-[74px] sm:h-[74px] shrink-0">
          {/* warm halo, blooms on hover */}
          <span aria-hidden className="absolute inset-[-30%] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{ background: "radial-gradient(closest-side, rgba(244,123,32,0.22), transparent 70%)" }} />
          {/* drifting seven-segment sun-to-sea ring */}
          <span aria-hidden className="absolute inset-0 motion-safe:animate-[spin_45s_linear_infinite]">
            <span className="absolute inset-0 rounded-full" style={{
              background: "conic-gradient(from 210deg, #00afdb, #ffc42e 30%, #f47b20 62%, #00afdb)",
              WebkitMask: "radial-gradient(closest-side, transparent calc(100% - 7px), #000 calc(100% - 6px))",
              mask: "radial-gradient(closest-side, transparent calc(100% - 7px), #000 calc(100% - 6px))",
            }} />
            <span className="absolute inset-0 rounded-full" style={{
              background: "repeating-conic-gradient(from -90deg, transparent 0deg 47.4deg, #00374a 47.4deg 51.43deg)",
              WebkitMask: "radial-gradient(closest-side, transparent calc(100% - 8px), #000 calc(100% - 7px))",
              mask: "radial-gradient(closest-side, transparent calc(100% - 8px), #000 calc(100% - 7px))",
            }} />
          </span>
          {/* sail-number disc */}
          <span className="relative grid place-items-center w-[calc(100%-18px)] h-[calc(100%-18px)] rounded-full bg-[#002a39]">
            <span className="flex flex-col items-center leading-none">
              <span className="text-[7px] sm:text-[8px] font-black tracking-[0.3em] text-white/45 translate-x-[0.15em]">GER</span>
              <span className="text-[26px] sm:text-[32px] font-black bg-clip-text text-transparent transition-[filter] group-hover:brightness-125" style={{ backgroundImage: "linear-gradient(180deg, #ffc42e, #f47b20 55%, #00afdb)" }}>7</span>
            </span>
          </span>
        </span>
        {/* type block */}
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] sm:text-[21px] font-black tracking-[-0.02em] text-white">The NP7 Method</span>
          <span aria-hidden className="block h-[2.5px] w-full rounded-full origin-left scale-x-[0.18] group-hover:scale-x-100 transition-transform duration-300 my-1.5" style={{ background: "linear-gradient(90deg, #ffc42e, #f47b20 55%, #00afdb)" }} />
          <span className="block text-[12px] sm:text-[12.5px] font-semibold text-white/60 group-hover:text-white/80 transition-colors">Seven dimensions · one rider — read the full method</span>
        </span>
        {/* chevron chip */}
        <span className="shrink-0 grid place-items-center w-9 h-9 rounded-full border border-white/15 bg-white/[0.07] text-white/80 transition-all group-hover:bg-[#ffc42e]/15 group-hover:text-[#ffc42e] group-hover:translate-x-0.5">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </span>
      </button>

      {mounted && open && createPortal(
        <div className="fixed inset-0 z-[130] bg-[#00131b]/70 backdrop-blur-sm" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="The NP7 Method">
          <div className="absolute inset-0 sm:inset-4 md:inset-8 lg:inset-x-[8%] lg:inset-y-8 overflow-y-auto overscroll-contain rounded-none sm:rounded-3xl bg-[#fff7ec] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* sticky top bar */}
            <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-5 sm:px-10 py-3.5 bg-[#fff7ec]/92 backdrop-blur border-b border-[#ecdcbb]">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#b0791e]">The NP7 Method</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Back to your trip"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#00374a] text-white text-[12.5px] font-bold pl-3 pr-3.5 py-1.5 hover:bg-[#013242] transition-colors">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M6 18L18 6" /></svg>
                Back to your trip
              </button>
            </div>

            {/* compact title */}
            <div className="px-6 sm:px-10 pt-10 pb-2">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#b0791e]">{METHOD_EYEBROW}</p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mt-2 max-w-[680px] leading-[1.03]">{METHOD_HEADLINE}</h2>
            </div>

            <MethodContent variant="modal" />

            {/* footer: back to the trip (Reserve is right where they left it) */}
            <div className="px-6 sm:px-10 pb-12 -mt-4 text-center">
              <button type="button" onClick={() => setOpen(false)}
                className="inline-flex items-center gap-2 rounded-full font-black text-[14.5px] px-8 py-3.5 text-[#3a2a00] transition-transform hover:-translate-y-0.5" style={{ background: "linear-gradient(90deg,#ffc42e,#f47b20 60%,#00afdb)" }}>
                Back to your trip <span aria-hidden>→</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
