"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The coach card, and the sheet behind it.
 *
 * A bio clamped to three lines that ends in "Nico…" is worse than no bio: it
 * says there is more to know and gives you no way to read it. This is the card
 * AND the way in — the whole tile is the trigger.
 *
 * Wears the house modal: cream #fff7ec panel, sticky bar with the gold eyebrow
 * and a deep-teal pill, the sun-to-sea rule, portalled to the body so no
 * ancestor's overflow or stacking context can clip it.
 */

export type CoachInfo = {
  name: string;
  role: string | null;
  bio: string | null;
  image_url: string | null;
  whatsapp_link?: string | null;
};

export function CoachCard({ coach }: { coach: CoachInfo }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Escape closes, and the page behind holds still — a sheet you can scroll the
  // page under is a sheet that feels broken on a phone.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  const hasMore = !!coach.bio && coach.bio.trim().length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => hasMore && setOpen(true)}
        disabled={!hasMore}
        className={`group w-full text-left flex gap-4 items-center rounded-2xl border border-[#eef2f3] bg-white p-3.5 transition-all ${
          hasMore ? "hover:border-[#00afdb] hover:shadow-[0_10px_26px_rgba(0,55,74,0.10)] hover:-translate-y-px cursor-pointer" : ""
        }`}
      >
        {coach.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coach.image_url} alt={coach.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
        ) : (
          <span className="w-16 h-16 rounded-xl shrink-0 grid place-items-center text-white font-black text-2xl" style={{ background: "linear-gradient(135deg,#ffc42e,#00afdb)" }}>{coach.name[0]}</span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-extrabold text-[#00374a] leading-tight">{coach.name}</span>
          {coach.role && <span className="block text-[12px] font-bold uppercase tracking-wide text-[#00afdb]">{coach.role}</span>}
          {coach.bio && <span className="block text-[12.5px] text-[#6a7a80] leading-snug mt-1 line-clamp-2">{coach.bio}</span>}
          {hasMore && (
            <span className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-bold text-[#0aa3c7] group-hover:gap-2 transition-all">
              Read more
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
            </span>
          )}
        </span>
      </button>

      {mounted && open && createPortal(
        <div className="fixed inset-0 z-[130] bg-[#00131b]/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6"
          onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label={coach.name}>
          <div
            className="relative w-full sm:max-w-[560px] max-h-[92svh] sm:max-h-[86svh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#fff7ec] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 sm:px-7 py-3.5 bg-[#fff7ec]/92 backdrop-blur border-b border-[#ecdcbb]">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#b0791e]">Your coach</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#00374a] text-white text-[12.5px] font-bold pl-3 pr-3.5 py-1.5 hover:bg-[#013242] transition-colors">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M6 18L18 6" /></svg>
                Back
              </button>
            </div>

            <div className="overflow-y-auto overscroll-contain">
              <div className="px-6 sm:px-7 pt-6 pb-5">
                {/* The name sits ON the photo, the way every hero on the site works. */}
                <div className="relative overflow-hidden rounded-2xl h-[240px] sm:h-[280px] bg-[#002a39]">
                  {coach.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coach.image_url} alt={coach.name} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-[52px] font-black text-white" style={{ background: "linear-gradient(135deg,#ffc42e,#00afdb)" }}>{coach.name[0]}</span>
                  )}
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,18,26,0.9) 4%, rgba(0,18,26,0.12) 52%, rgba(0,18,26,0.24) 100%)" }} aria-hidden />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    {coach.role && <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#ffc42e]">{coach.role}</p>}
                    <p className="text-[26px] sm:text-[30px] font-black text-white leading-[1.08] tracking-[-0.025em] mt-1">{coach.name}</p>
                    <span aria-hidden className="block h-[2.5px] w-14 rounded-full mt-2.5" style={{ background: "linear-gradient(90deg, #ffc42e, #f47b20 55%, #00afdb)" }} />
                  </div>
                </div>

                {coach.bio && (
                  <p className="text-[15px] text-[#5a6b72] leading-[1.7] mt-5 whitespace-pre-line [text-wrap:pretty]">{coach.bio}</p>
                )}
              </div>

              <div className="px-6 sm:px-7 pb-8 text-center">
                <button type="button" onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-2 rounded-full font-black text-[14px] px-7 py-3 text-[#3a2a00] transition-transform hover:-translate-y-0.5"
                  style={{ background: "linear-gradient(90deg,#ffc42e,#f47b20 60%,#00afdb)" }}>
                  Back to the event <span aria-hidden>→</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
