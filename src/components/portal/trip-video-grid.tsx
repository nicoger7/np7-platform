"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TripVideo } from "@/lib/portal-data";
import { mutate } from "@/lib/mutate";
import { KEEPER_LIMIT, keeperLimitMessage } from "@/lib/keepers";
import { DownloadMenu } from "./download-menu";

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

export function TripVideoGrid({ videos, bookingId, fallbackPoster, title = "Trip videos", downloadsRemaining }: { videos: TripVideo[]; bookingId: string; fallbackPoster?: string; title?: string; downloadsRemaining?: number }) {
  const [keepers, setKeepers] = useState<Set<string>>(new Set());
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [starErr, setStarErr] = useState("");
  const [filter, setFilter] = useState<string | null>(null); // which rider's clips
  const cardRef = useRef<HTMLDivElement>(null); // scroll back here on "Show less"
  const [remaining, setRemaining] = useState(downloadsRemaining ?? 0);
  const [zipProgress, setZipProgress] = useState(""); // "" = idle
  const [dlErr, setDlErr] = useState("");

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

  /*
   * "Download all videos" — same UX as the photo gallery, different mechanics.
   * A week's clips run to several GIGABYTES (226 clips × ~15 MB), so one
   * JSZip blob like the photos use would exhaust tab memory and crash. Instead
   * the clips are fetched SEQUENTIALLY and flushed as numbered zip parts
   * (trip-videos-part1.zip, part2, …) whenever a part passes ~450 MB. Videos
   * are already compressed, so parts use STORE — zipping is packaging here,
   * not compression.
   */
  const PART_LIMIT = 450 * 1024 * 1024;
  const zipVideos = useCallback(async (items: TripVideo[], baseName: string) => {
    const { default: JSZip } = await import("jszip");
    let zip = new JSZip();
    let partBytes = 0;
    let partNo = 1;
    const parts = items.length; // for progress text only
    const save = async (final: boolean) => {
      if (partBytes === 0) return;
      const suffix = final && partNo === 1 ? "" : `-part${partNo}`;
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${baseName}${suffix}.zip`;
      a.click();
      URL.revokeObjectURL(href);
      zip = new JSZip();
      partBytes = 0;
      partNo += 1;
    };
    for (let i = 0; i < items.length; i++) {
      setZipProgress(`Preparing… clip ${i + 1} of ${parts}`);
      const v = items[i];
      const blob = await fetch(v.url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); });
      const ext = (v.url.split(".").pop() || "mp4").split("?")[0].slice(0, 4);
      zip.file(`${v.stem}.${ext}`, blob);
      partBytes += blob.size;
      if (partBytes >= PART_LIMIT) await save(false);
    }
    await save(true);
  }, []);

  const mineClips = videos.filter((v) => v.groupKind === "mine");
  const weekClips = videos.filter((v) => v.groupKind === "everyone");
  const othersExist = videos.length > mineClips.length;
  const videoDownloadable = downloadsRemaining != null;

  // EVERY bulk zip — own clips included — counts as one of the booking's full
  // video downloads, mirroring the photo ruling. Watching or saving a single
  // clip from the player stays unlimited.
  async function downloadCappedVideos(items: TripVideo[], baseName: string) {
    if (zipProgress || !items.length) return;
    setDlErr("");
    setZipProgress("Preparing…");
    try {
      const res = await fetch(`/api/portal/bookings/${bookingId}/video-download`, { method: "POST" });
      if (!res.ok) {
        setRemaining(0);
        setDlErr(res.status === 403 ? "You've used all your video downloads — the clips stay available to watch." : "Couldn't start the download. Please try again.");
        return;
      }
      const { remaining: rem } = await res.json();
      await zipVideos(items, baseName);
      setRemaining(typeof rem === "number" ? rem : Math.max(0, remaining - 1));
    } catch {
      setDlErr("Couldn't build the download. Please try again.");
    } finally {
      setZipProgress("");
    }
  }

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
  // One flat list in display order. The lightbox walks EVERY clip in the week,
  // filtered or not, so each thumbnail carries its absolute index into this.
  const flat = sections.flatMap((g) => g.items);
  const absIdx = new Map(flat.map((v, i) => [v.stem, i] as const));
  const open = openIdx != null ? flat[openIdx] : null;
  const filtered = filter ? flat.filter((v) => v.groupKey === filter) : flat;
  const hasMore = filtered.length > PREVIEW;
  const visible = !expanded && hasMore ? filtered.slice(0, PREVIEW) : filtered;
  const nameShort = (t: string) => t.split(/\s+/)[0] || t;
  const nameInitials = (t: string) =>
    t.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

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

      {/* Source chips — All · Week videos · each rider. Identical language to
          "Everyone's photos", because a week should read the same whichever
          medium you open; only worth showing when there is more than one
          source to choose between. */}
      {sections.length > 1 && (
        <div className="px-4 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => { setFilter(null); setExpanded(false); }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold border transition-colors ${filter === null ? "bg-[#00afdb] text-white border-[#00afdb]" : "bg-white text-[#00374a] border-[#e2e9ec] hover:border-[#00afdb]"}`}>
            All <span className="opacity-70 tabular-nums">{flat.length}</span>
          </button>
          {sections.map((g) => {
            const on = filter === g.key;
            const shared = g.key === "everyone";
            return (
              <button key={g.key} type="button"
                onClick={() => { setFilter(on ? null : g.key); setExpanded(false); }}
                className={`inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 text-[12.5px] font-bold border transition-colors ${on ? "bg-[#00afdb] text-white border-[#00afdb]" : "bg-white text-[#00374a] border-[#e2e9ec] hover:border-[#00afdb]"}`}>
                <span className={`w-6 h-6 rounded-full grid place-items-center ${on ? "bg-white/25 text-white" : shared ? "bg-[#f47b20]/15 text-[#f47b20]" : "bg-[#dceef2] text-[#00748f]"}`}>
                  {shared
                    ? <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="3" /><path d="m10 9 5 3-5 3z" /></svg>
                    : <span className="text-[10px] font-bold">{g.key === "mine" ? "YOU" : nameInitials(g.label)}</span>}
                </span>
                {g.key === "mine" || shared ? g.label : nameShort(g.label)}{" "}
                <span className="opacity-70 tabular-nums">{g.items.length}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="px-4 pb-4 pt-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {visible.map((v) => {
          const i = absIdx.get(v.stem) ?? 0;
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
        <button type="button" onClick={() => { if (expanded) requestAnimationFrame(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); setExpanded((v) => !v); }} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-[#00afdb]">
          {expanded ? "Show less" : `Show all ${filtered.length} videos`}
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={expanded ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} /></svg>
        </button>
      )}
      {videoDownloadable && (
        <DownloadMenu
          label="Download videos"
          unit="clip"
          remaining={remaining}
          busy={zipProgress || undefined}
          error={dlErr || undefined}
          choices={[
            { key: "mine", label: "Just yours", count: mineClips.length, usesCredit: true },
            ...(othersExist && weekClips.length > 0 && weekClips.length < videos.length
              ? [{ key: "week", label: "Week videos", count: weekClips.length, usesCredit: true }]
              : []),
            // The selected rider chip becomes a download choice — "download just
            // Thomas's clips" — on weeks like Alaçatı where every clip is filed
            // per rider and there is no shared pool to offer.
            ...(filter && filter !== "mine" && filtered.length < videos.length
              ? [{ key: "filtered", label: `Only ${nameShort(sections.find((g) => g.key === filter)?.label ?? "this rider")}`, count: filtered.length, usesCredit: true }]
              : []),
            ...(othersExist ? [{ key: "all", label: "Everything", count: videos.length, usesCredit: true }] : []),
          ]}
          onPick={(k) => {
            if (k === "mine") downloadCappedVideos(mineClips, "my-videos");
            else if (k === "week") downloadCappedVideos(weekClips, "week-videos");
            else if (k === "filtered") downloadCappedVideos(filtered, "rider-videos");
            else downloadCappedVideos(videos, "trip-videos");
          }}
        />
      )}
      {videoDownloadable && othersExist && (
        <p className="text-[11.5px] text-[#9aa6ac] mt-1.5">A whole week of clips is big — it arrives as a few numbered zip files. Keep the tab open until the last one lands.</p>
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
