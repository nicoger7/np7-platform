"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TripVideo } from "@/lib/portal-data";
import { mutate } from "@/lib/mutate";
import { KEEPER_LIMIT, keeperLimitMessage } from "@/lib/keepers";

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
  const [starErr, setStarErr] = useState("");
  const cardRef = useRef<HTMLDivElement>(null); // scroll back here on "Show less"

  useEffect(() => {
    fetch(`/api/portal/memories/stars?bookingId=${bookingId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.videos) setKeepers(new Set(d.videos)); })
      .catch(() => {});
  }, [bookingId]);

  const toggle = useCallback(async (stem: string) => {
    const wasKept = keepers.has(stem); // previous state, so a failed write can be reverted
    const starred = !wasKept;
    // Same cap as the photos, counted separately — three clips of their own.
    if (starred && keepers.size >= KEEPER_LIMIT) {
      setStarErr(keeperLimitMessage("video"));
      return;
    }
    setKeepers((s) => { const n = new Set(s); starred ? n.add(stem) : n.delete(stem); return n; });
    setStarErr("");
    const r = await mutate("/api/portal/memories/stars", {
      method: "POST",
      body: { bookingId, kind: "video", ref: stem, starred },
    });
    if (!r.ok) {
      // Only a *saved* star survives the 3-month deletion sweep. The old code
      // caught network errors but not a 401/403/500 — the star stayed lit, the
      // member read that as "kept forever", stopped worrying about the clip,
      // and it was deleted three months later. The one footage of their first
      // planing jibe, gone with no warning and nothing to re-download.
      setKeepers((s) => { const n = new Set(s); wasKept ? n.add(stem) : n.delete(stem); return n; });
      setStarErr(`${starred ? "Couldn't keep that clip" : "Couldn't unstar that clip"} — it is not saved. ${r.error}`);
    }
  }, [keepers, bookingId]);

  if (videos.length === 0) return null;
  /*
   * Sectioned by person, exactly like the photo gallery: yours, the week's
   * shared pool, then one block per rider who shares. The clips arrive from
   * portal-data already in that order, so grouping here only has to preserve
   * it — and keepers float to the top WITHIN a section rather than jumping out
   * of the person they belong to.
   */
  const sections: { key: string; label: string; items: TripVideo[] }[] = [];
  for (const v of videos) {
    let g = sections.find((x) => x.key === v.groupKey);
    if (!g) { g = { key: v.groupKey, label: v.groupLabel, items: [] }; sections.push(g); }
    g.items.push(v);
  }
  for (const g of sections) {
    g.items.sort((a, b) => (keepers.has(b.stem) ? 1 : 0) - (keepers.has(a.stem) ? 1 : 0));
  }
  // One flat list in display order — the lightbox walks every clip in the week,
  // across sections, so its indices must be the flattened ones.
  const flat = sections.flatMap((g) => g.items);
  const open = openIdx != null ? flat[openIdx] : null;
  const hasMore = flat.length > PREVIEW;
  const cutoff = !expanded && hasMore ? PREVIEW : flat.length;

  return (
    <div ref={cardRef} className="scroll-mt-24 rounded-xl border border-[#f0e6d6] bg-[#fffdf9] overflow-hidden">
      {/* header matches the photo cards: a soft icon badge + title + count */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <span className="w-9 h-9 rounded-lg grid place-items-center bg-[#00afdb]/12 text-[#00afdb] shrink-0">
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="3" /><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" /></svg>
        </span>
        <h3 className="text-[15px] font-black tracking-[-0.01em] text-[#00374a]">{title}</h3>
        <span className="ml-auto text-[13px] text-[#9aa6ac] tabular-nums">{flat.length}</span>
      </div>
      <div className="px-4 pb-4">
      {sections.map((g) => {
        const start = flat.indexOf(g.items[0]);
        const shown = g.items.filter((_, i) => start + i < cutoff);
        if (!shown.length) return null;
        return (
        <div key={g.key} className="mb-3 last:mb-0">
        {/* Only worth a heading when there is more than one section — a week
            with a single block of clips should not sprout a label. */}
        {sections.length > 1 && (
          <p className="text-[12px] font-bold text-[#5a6b72] mb-1.5">
            {g.label}<span className="ml-1.5 font-normal text-[#9aa6ac] tabular-nums">{g.items.length}</span>
          </p>
        )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {shown.map((v, j) => {
          const i = start + j;
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
        </div>
        );
      })}
      {hasMore && (
        <button type="button" onClick={() => { if (expanded) requestAnimationFrame(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); setExpanded((v) => !v); }} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-[#00afdb]">
          {expanded ? "Show less" : `Show all ${flat.length} videos`}
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={expanded ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} /></svg>
        </button>
      )}
      <p className="text-[11.5px] text-[#9aa6ac] mt-2">
        Videos stay for 3 months after the trip — star up to {KEEPER_LIMIT} to keep forever ({keepers.size} of {KEEPER_LIMIT} kept).
      </p>
      {starErr && <p className="text-[12.5px] font-semibold text-[#c4621a] mt-1.5 leading-snug">{starErr}</p>}
      </div>

      {open && openIdx != null && (
        <Lightbox
          v={open}
          kept={keepers.has(open.stem)}
          onStar={() => toggle(open.stem)}
          starErr={starErr}
          onClose={() => setOpenIdx(null)}
          onPrev={openIdx > 0 ? () => setOpenIdx(openIdx - 1) : undefined}
          onNext={openIdx < flat.length - 1 ? () => setOpenIdx(openIdx + 1) : undefined}
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

function Lightbox({ v, kept, onStar, starErr, onClose, onPrev, onNext }: {
  v: TripVideo; kept: boolean; onStar: () => void; starErr?: string; onClose: () => void; onPrev?: () => void; onNext?: () => void;
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
        {/* the grid's message is hidden behind this overlay, so a star that
            failed from the player has to say so here or not at all */}
        {starErr && <p className="mt-2.5 text-[12.5px] font-semibold text-[#ffb4a2] leading-snug">{starErr}</p>}
      </div>
    </div>
  );
}
