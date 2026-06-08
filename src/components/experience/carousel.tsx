"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CarouselProps = {
  children: React.ReactNode;
  /** aria label for the scroll region */
  label?: string;
  className?: string;
};

/**
 * Horizontal, drag/scroll-snap carousel with prev/next buttons.
 * No dependencies — native overflow scrolling + CSS scroll-snap.
 * Buttons disable at the track edges and hide when everything fits.
 */
export function Carousel({ children, label = "carousel", className = "" }: CarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setOverflowing(max > 8);
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft >= max - 4);
  }, []);

  useEffect(() => {
    update();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  const scrollByDir = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className={`relative ${className}`}>
      <div
        ref={trackRef}
        role="region"
        aria-label={label}
        className="flex gap-5 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2"
      >
        {children}
      </div>

      {overflowing && (
        <>
          <button
            type="button"
            aria-label="Previous"
            onClick={() => scrollByDir(-1)}
            disabled={atStart}
            className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white shadow-[0_4px_20px_rgba(0,0,0,0.12)] flex items-center justify-center text-[#111] transition-opacity disabled:opacity-0 disabled:pointer-events-none hover:bg-[#111] hover:text-white"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => scrollByDir(1)}
            disabled={atEnd}
            className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white shadow-[0_4px_20px_rgba(0,0,0,0.12)] flex items-center justify-center text-[#111] transition-opacity disabled:opacity-0 disabled:pointer-events-none hover:bg-[#111] hover:text-white"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
