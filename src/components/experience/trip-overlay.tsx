"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Generic zero-leak overlay for the trip page: any section can open rich
 * content (the Method, the Spotguide deep-dive, …) ON TOP of the trip instead
 * of navigating away — close and the Reserve button is right where it was.
 *
 * `trigger` is the styled clickable content (we wrap it in the button);
 * `children` can be fully SERVER-rendered content passed straight through.
 */
export function TripOverlay({ trigger, triggerClassName = "", label, children }: {
  trigger: React.ReactNode;
  triggerClassName?: string;
  /** Short label for the sticky top bar, e.g. "Bonaire · Spotguide". */
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Portal to <body> — triggers often sit inside transformed ancestors (Reveal),
  // which would trap position:fixed and collapse the overlay.
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
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>{trigger}</button>

      {mounted && open && createPortal(
        <div className="fixed inset-0 z-[130] bg-[#00131b]/70 backdrop-blur-sm" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label={label}>
          <div className="absolute inset-0 sm:inset-4 md:inset-8 lg:inset-x-[8%] lg:inset-y-8 overflow-y-auto overscroll-contain rounded-none sm:rounded-3xl bg-[#fff7ec] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* sticky top bar — always one tap back to the trip */}
            <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-5 sm:px-10 py-3.5 bg-[#fff7ec]/92 backdrop-blur border-b border-[#ecdcbb]">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#b0791e] truncate">{label}</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Back to your trip"
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[#00374a] text-white text-[12.5px] font-bold pl-3 pr-3.5 py-1.5 hover:bg-[#013242] transition-colors">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M6 18L18 6" /></svg>
                Back to your trip
              </button>
            </div>

            {children}

            <div className="px-6 sm:px-10 pb-12 pt-2 text-center">
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
