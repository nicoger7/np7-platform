"use client";

import { useEffect, useState } from "react";

/**
 * Article image with click-to-zoom. Analytics showed readers repeatedly click
 * article photos expecting them to open (dead clicks) — now they do: a simple
 * full-screen lightbox, closed by click, ✕ or Escape.
 */
export function ZoomImage({ src, zoomSrc, alt }: { src: string; zoomSrc: string; alt: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="w-full rounded-2xl cursor-zoom-in"
        loading="lazy"
        onClick={() => setOpen(true)}
      />
      {open && (
        <div
          className="fixed inset-0 z-[120] bg-black/90 flex items-center justify-center p-4 sm:p-10 cursor-zoom-out"
          role="dialog"
          aria-modal="true"
          aria-label={alt || "Image"}
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomSrc} alt={alt} className="max-w-full max-h-full object-contain rounded-lg" />
          {alt && (
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[12px] text-white/70 max-w-[80%] text-center">{alt}</p>
          )}
          <button
            type="button"
            aria-label="Close"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 text-white text-lg leading-none hover:bg-white/25"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
