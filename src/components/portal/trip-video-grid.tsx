"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TripVideo } from "@/lib/portal-data";

function StarIcon({ filled }: { filled: boolean }) {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>;
}

/**
 * App-style trip-clip grid: compact thumbnails that open a full-screen player,
 * instead of stacking dozens of full inline players (which turned the page into
 * an endless scroll). Thumbnails prefer the stored poster; when a clip has none
 * they lazily paint a real frame from the video itself (preload="metadata" + a
 * media-fragment seek), so a preview always shows. Keeper stars work from the
 * grid and inside the player, and starred clips float to the top.
 */
const PREVIEW = 8; // videos shown before "Show all" (~2 grid rows)

export function TripVideoGrid({ videos, bookingId, fallbackPoster, title = "Trip videos" }: { videos: TripVideo[]; bookingId: string; fallbackPoster?: string; title?: string }) {
  const [keepers, setKeepers] = useState<Set<string>>(new Set());
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/memories/stars?bookingId=${bookingId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.videos) setKeepers(new Set(d.videos)); })
      .catch(() => {});
  }, [bookingId]);

  const toggle = useCallback(async (stem: string) => {
    const starred = !keepers.has(stem);
    setKeepers((s) => { const n = new Set(s); starred ? n.add(stem) : n.delete(stem); return n; });
    await fetch("/api/portal/memories/stars", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, kind: "video", ref: stem, starred }),
    }).catch(() => setKeepers((s) => { const n = new Set(s); starred ? n.delete(stem) : n.add(stem); return n; }));
  }, [keepers, bookingId]);

  if (videos.length === 0) return null;
  // Keepers first — starred clips float to the top of the grid.
  const sorted = [...videos].sort((a, b) => (keepers.has(b.stem) ? 1 : 0) - (keepers.has(a.stem) ? 1 : 0));
  const open = openIdx != null ? sorted[openIdx] : null;
  const hasMore = sorted.length > PREVIEW;
  const visible = !expanded && hasMore ? sorted.slice(0, PREVIEW) : sorted;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-[13px] font-bold uppercase tracking-wide text-[#9aa6ac]">{title}</h3>
        <span className="text-[12px] text-[#9aa6ac] tabular-nums">{sorted.length} video{sorted.length === 1 ? "" : "s"}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {visible.map((v, i) => {
          const kept = keepers.has(v.stem);
          return (
            <button key={v.stem} type="button" onClick={() => setOpenIdx(i)}
              className="group relative aspect-video rounded-xl overflow-hidden bg-[#0a1518] ring-1 ring-black/5 transition-transform hover:-translate-y-0.5">
              <VideoThumb v={v} fallbackPoster={fallbackPoster} />
              <span className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
              <span className="absolute inset-0 grid place-items-center">
                <span className="w-11 h-11 rounded-full bg-black/45 backdrop-blur grid place-items-center text-white transition-transform group-hover:scale-110">
                  <svg className="w-5 h-5 translate-x-[1px]" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </span>
              </span>
              <span onClick={(e) => { e.stopPropagation(); toggle(v.stem); }} title={kept ? "Kept forever ⭐" : "Keep this forever"}
                className={`absolute top-1.5 right-1.5 z-10 w-7 h-7 rounded-full grid place-items-center transition-all ${kept ? "bg-amber-400 text-white shadow" : "bg-black/45 text-white opacity-0 group-hover:opacity-100"}`}>
                <StarIcon filled={kept} />
              </span>
            </button>
          );
        })}
      </div>
      {hasMore && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-[#00afdb]">
          {expanded ? "Show less" : `Show all ${sorted.length} videos`}
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={expanded ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} /></svg>
        </button>
      )}
      <p className="text-[11.5px] text-[#9aa6ac] mt-2">Videos stay for 3 months after the trip — star the ones you want to keep forever.</p>

      {open && openIdx != null && (
        <Lightbox
          v={open}
          kept={keepers.has(open.stem)}
          onStar={() => toggle(open.stem)}
          onClose={() => setOpenIdx(null)}
          onPrev={openIdx > 0 ? () => setOpenIdx(openIdx - 1) : undefined}
          onNext={openIdx < sorted.length - 1 ? () => setOpenIdx(openIdx + 1) : undefined}
        />
      )}
    </div>
  );
}

/** Thumbnail: cheap poster image when we have one; otherwise a lazily-loaded
    video frame via a media-fragment seek so a real preview still shows. */
function VideoThumb({ v, fallbackPoster }: { v: TripVideo; fallbackPoster?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || v.poster) return; // poster path needs no observer
    const io = new IntersectionObserver((ents) => { if (ents.some((e) => e.isIntersecting)) { setShow(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [v.poster]);

  if (v.poster) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={v.poster} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />;
  }
  return (
    <div ref={ref} className="absolute inset-0">
      {show ? (
        <video src={`${v.url}#t=0.5`} poster={fallbackPoster} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
      ) : fallbackPoster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fallbackPoster} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />
      ) : null}
    </div>
  );
}

function Lightbox({ v, kept, onStar, onClose, onPrev, onNext }: {
  v: TripVideo; kept: boolean; onStar: () => void; onClose: () => void; onPrev?: () => void; onNext?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev?.();
      else if (e.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose, onPrev, onNext]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm grid place-items-center p-4 sm:p-8" onClick={onClose}>
      <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition-colors">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
      {onPrev && <button onClick={(e) => { e.stopPropagation(); onPrev(); }} aria-label="Previous" className="absolute left-2 sm:left-5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition-colors">
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </button>}
      {onNext && <button onClick={(e) => { e.stopPropagation(); onNext(); }} aria-label="Next" className="absolute right-2 sm:right-5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition-colors">
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </button>}
      <div className="relative w-full max-w-[min(1100px,92vw)]" onClick={(e) => e.stopPropagation()}>
        <video key={v.stem} src={v.url} poster={v.poster ?? undefined} controls autoPlay playsInline className="w-full rounded-2xl bg-black aspect-video" />
        <button onClick={onStar} title={kept ? "Kept forever ⭐" : "Keep this forever"}
          className={`absolute top-3 right-3 z-10 w-9 h-9 rounded-full grid place-items-center transition-all ${kept ? "bg-amber-400 text-white shadow" : "bg-black/50 text-white hover:bg-black/70"}`}>
          <StarIcon filled={kept} />
        </button>
      </div>
    </div>
  );
}
