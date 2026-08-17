"use client";

import { useEffect, useState } from "react";

/**
 * A compact, continuously-drifting filmstrip of trip photos. It "flies by" in a
 * single band (no tall grid), pauses on hover, and any photo opens a full-screen
 * lightbox with arrow / swipe navigation so guests can dig into the vibe.
 * Pure CSS marquee (duplicated track) — no deps.
 */
export function GalleryStrip({ images }: { images: string[] }) {
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % images.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + images.length) % images.length));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, images.length]);

  // duplicate the track so the marquee loops seamlessly
  const track = [...images, ...images];

  return (
    <>
      <div className="group relative overflow-hidden" style={{ maskImage: "linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)", WebkitMaskImage: "linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)" }}>
        <div className="flex gap-3 w-max gallery-marquee group-hover:[animation-play-state:paused]">
          {track.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setOpen(i % images.length)}
              aria-label="Open photo"
              className="relative shrink-0 h-[200px] sm:h-[260px] aspect-[4/3] rounded-2xl overflow-hidden bg-cover bg-center transition-transform duration-300 hover:scale-[1.03] hover:z-10"
              style={{ backgroundImage: `url('${src}')` }}
            />
          ))}
        </div>
      </div>

      {open !== null && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <button aria-label="Close" className="absolute top-5 right-5 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center" onClick={() => setOpen(null)}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
          <button aria-label="Previous" className="absolute left-3 sm:left-6 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center" onClick={(e) => { e.stopPropagation(); setOpen((i) => (i === null ? i : (i - 1 + images.length) % images.length)); }}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[open]} alt="" className="max-h-[86vh] max-w-[90vw] rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button aria-label="Next" className="absolute right-3 sm:right-6 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center" onClick={(e) => { e.stopPropagation(); setOpen((i) => (i === null ? i : (i + 1) % images.length)); }}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          {/* Pinned to the VIEWPORT, not the photo. The image is centred and up
              to 86vh tall, so on a short window a bottom-5 counter landed on top
              of the picture. Top-left mirrors the close button, sits in the
              chrome rather than the photo, and keeps its own backdrop so it
              stays readable over a bright frame. */}
          <span className="absolute top-5 left-5 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-sm text-white/85 text-[13px] font-semibold tabular-nums">{open + 1} / {images.length}</span>
        </div>
      )}

      <style>{`
        @keyframes gallery-marquee-kf { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .gallery-marquee { animation: gallery-marquee-kf 60s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .gallery-marquee { animation: none; } }
      `}</style>
    </>
  );
}
