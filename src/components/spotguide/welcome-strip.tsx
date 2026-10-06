"use client";

import { useEffect, useState } from "react";
import { welcomeHeadline, ADD_SPOT_ANCHOR } from "@/lib/spotguide-nudge";

/**
 * Open the add-a-spot form through its own entry point, then bring it into view.
 *
 * add-spot.tsx keeps its open state to itself, and its closed state is a single
 * button (the dashed "Know a spot we're missing?" box). So this presses that
 * button, exactly as a rider would. Only when the form is closed: an open form
 * has fields, and pressing its first button would toggle a level pill instead.
 * Returns false when this page has no form, so the caller can go to one.
 */
export function openAddSpotForm(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.getElementById(ADD_SPOT_ANCHOR);
  if (!root) return false;
  const isOpen = !!root.querySelector("input, textarea, select");
  if (!isOpen) root.querySelector<HTMLButtonElement>("button")?.click();
  requestAnimationFrame(() => root.scrollIntoView({ behavior: "smooth", block: "start" }));
  return true;
}

/**
 * The moment right after sign-up (Nico, 6 Oct 2026).
 *
 * Joining used to just unlock the page: no hello, nothing to do next, at the
 * exact moment a new rider is most willing to do something. Now they get one
 * calm card with the two contributions that matter most, both a single tap.
 * Shown once (the provider records it), dismissible, and it never blocks the
 * page: it sits at the bottom edge, under the cookie and install banners.
 */
export function WelcomeStrip({ firstName, accent, onAddSpot, onRate, onClose }: {
  firstName: string;
  accent: string;
  onAddSpot: () => void;
  onRate: () => void;
  onClose: () => void;
}) {
  // slide in after mount so it reads as an arrival, not as part of the page
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[140] flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div role="status" aria-live="polite"
        className={`pointer-events-auto relative w-full max-w-[560px] rounded-2xl border border-[#ece3d3] bg-white p-4 sm:p-5 shadow-[0_18px_44px_rgba(0,55,74,0.18)] transition-all duration-300 motion-reduce:transition-none ${shown ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}>
        {/* the sun-to-sea bar the member area uses for "this is yours" */}
        <span className="absolute top-0 inset-x-5 h-[3px] rounded-b-full" style={{ background: "linear-gradient(90deg,#ffc42e,#f0774a 55%,#00afdb)" }} aria-hidden />
        <button type="button" onClick={onClose} aria-label="Dismiss"
          className="absolute top-2.5 right-2.5 w-8 h-8 grid place-items-center rounded-full text-[#9aa6ac] hover:text-[#00374a] hover:bg-[#f4efe4] transition-colors">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        <p className="pr-8 text-[14.5px] leading-snug text-[#5a6b72]">
          <span className="font-black text-[#00374a]">{welcomeHeadline(firstName)}</span>{" "}
          Two things that make the guide better:
        </p>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <button type="button" onClick={onAddSpot}
            className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[13.5px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: accent }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2.2" /></svg>
            Add your home spot
          </button>
          <button type="button" onClick={onRate}
            className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[13.5px] font-bold text-[#00374a] border border-[#e2d8c6] bg-white hover:border-[#c6b89d] transition-colors">
            <span className="text-[#f5a623]" aria-hidden>★</span>
            Rate a spot you know
          </button>
        </div>
      </div>
    </div>
  );
}
