"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Carousel } from "./carousel";
import { REVIEW_CATEGORIES } from "@/lib/review-categories";

/**
 * The guest-review wall — built for REAL member reviews, not just curated
 * one-liners.
 *
 * The first genuine submissions broke the old inline cards: a ten-sentence
 * review overflowed the fixed-height photo card upward, burying the photo,
 * the stars and the Verified badge under text — and a chip line repeating
 * "★★★★★" per category turned the card into noise.
 *
 * So the card face stays calm — stars, a CLAMPED quote, the name — and the
 * detail moves where detail belongs: "Read the full review" opens an overlay
 * (same portal pattern as coach-modal) with the full text and the per-category
 * stars. Reviews without categories never render an empty section.
 */
export type GuestReviewItem = {
  quote: string;
  name: string;
  country: string;
  image: string;
  rating: number;
  verified: boolean;
  cats?: Record<string, number> | null;
};

const stars = (n: number, cls = "text-[#ffd24a]") => (
  <span className={`${cls} text-sm tracking-[0.08em]`}>{"★".repeat(Math.max(1, Math.min(5, n)))}</span>
);

export function GuestReviews({ items }: { items: GuestReviewItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Escape closes; page scroll parks while the overlay is up.
  useEffect(() => {
    if (openIdx == null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenIdx(null); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [openIdx]);

  const open = openIdx != null ? items[openIdx] : null;
  const openCats = open?.cats
    ? REVIEW_CATEGORIES.filter((c) => open.cats![c.key] != null).map((c) => ({ label: c.label, value: open.cats![c.key] }))
    : [];

  return (
    <>
      <Carousel label="Guest reviews">
        {items.map((m, i) => {
          // Anything the clamp might hide — or category stars — earns the link.
          const hasMore = m.quote.length > 180 || (m.cats && Object.keys(m.cats).length > 0);
          return (
            <article key={i} className="snap-start shrink-0 w-[280px] sm:w-[360px] relative rounded-3xl overflow-hidden h-[400px]">
              <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${m.image}')` }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
              {m.verified && (
                <span className="absolute top-4 right-4 inline-flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase text-white bg-[#00afdb]/90 backdrop-blur px-2.5 py-1 rounded-full shadow-sm">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  Verified
                </span>
              )}
              <div className="absolute bottom-0 inset-x-0 p-7 text-white">
                {stars(m.rating)}
                <p className="text-[15.5px] font-bold leading-snug mt-3 mb-3 line-clamp-6">&ldquo;{m.quote}&rdquo;</p>
                {hasMore && (
                  <button type="button" onClick={() => setOpenIdx(i)}
                    className="mb-3 inline-flex items-center gap-1 text-[12px] font-bold text-[#7fd6ee] hover:text-white transition-colors">
                    Read the full review
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
                  </button>
                )}
                <p className="text-[13px] text-white/70 font-semibold">{m.name}{m.country ? ` · ${m.country}` : ""}</p>
              </div>
            </article>
          );
        })}
      </Carousel>

      {mounted && open && createPortal(
        <div className="fixed inset-0 z-[130] bg-[#00131b]/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6"
          onClick={() => setOpenIdx(null)} role="dialog" aria-modal="true" aria-label={`Review by ${open.name}`}>
          <div className="relative w-full sm:max-w-[560px] max-h-[92svh] sm:max-h-[86svh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#fff7ec] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}>
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 sm:px-7 py-3.5 bg-[#fff7ec]/92 backdrop-blur border-b border-[#ecdcbb]">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#b0791e]">Guest review</span>
              <button type="button" onClick={() => setOpenIdx(null)} aria-label="Close"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#00374a] text-white text-[12.5px] font-bold pl-3 pr-3.5 py-1.5 hover:bg-[#013242] transition-colors">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M6 18L18 6" /></svg>
                Back
              </button>
            </div>

            <div className="overflow-y-auto overscroll-contain">
              <div className="relative h-[180px] sm:h-[220px] bg-[#002a39]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={open.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                {open.verified && (
                  <span className="absolute top-4 right-4 inline-flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase text-white bg-[#00afdb]/90 backdrop-blur px-2.5 py-1 rounded-full">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    Verified
                  </span>
                )}
                <span className="absolute bottom-4 left-6">{stars(open.rating)}</span>
              </div>

              <div className="px-6 sm:px-7 py-6">
                <p className="text-[15.5px] text-[#00374a] leading-relaxed font-medium">&ldquo;{open.quote}&rdquo;</p>
                <p className="mt-3 text-[13px] text-[#6a7a80] font-semibold">{open.name}{open.country ? ` · ${open.country}` : ""}</p>

                {openCats.length > 0 && (
                  <div className="mt-6 pt-5 border-t border-[#ecdcbb]">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#b0791e] mb-3">Rated the week</p>
                    <div className="space-y-2">
                      {openCats.map((c) => (
                        <div key={c.label} className="flex items-center justify-between gap-4">
                          <span className="text-[13.5px] font-bold text-[#00374a]">{c.label}</span>
                          <span className="text-[13px] tracking-[0.1em]">
                            <span className="text-[#f5a623]">{"★".repeat(c.value)}</span>
                            <span className="text-[#e3d5b8]">{"★".repeat(5 - c.value)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
