"use client";

import { useEffect, useMemo, useState } from "react";
import type { GalleryGroup } from "@/lib/portal-data";
import { cdnImage } from "@/lib/img";

/**
 * The participant's trip-photo gallery, split into foldable groups:
 *  - "Your photos" (their own), "Week memories" (the shared everyone shots), then
 *    one group per other participant who shares (labelled with their name).
 * Each group is a smooth <details> accordion (matching the trip page). Thumbnails
 * open a shared full-screen lightbox (click / arrows / swipe) that traverses ALL
 * photos in order. An optional "Download all" zips every photo client-side, capped
 * per booking (omit bookingId/downloadsRemaining for a view-only gallery).
 */
const ASSET_MARK = "/storage/v1/object/public/assets/";
/** Raw storage path (memories/…) from a photo URL — the ref admin stars + the
    retention cron use, so a member keeper protects the same file. */
function photoRef(url: string): string {
  const i = url.indexOf(ASSET_MARK);
  return i === -1 ? url : decodeURIComponent(url.slice(i + ASSET_MARK.length));
}

export function MemberGallery({
  groups,
  bookingId,
  downloadsRemaining,
  keeperBookingId,
}: {
  groups: GalleryGroup[];
  bookingId?: string;
  downloadsRemaining?: number;
  /** When set, members can star photos as permanent "keepers" for this booking. */
  keeperBookingId?: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [mineExpanded, setMineExpanded] = useState(false);
  const [remaining, setRemaining] = useState(downloadsRemaining ?? 0);
  const [zipping, setZipping] = useState(false);
  const [err, setErr] = useState("");
  const [keepers, setKeepers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!keeperBookingId) return;
    fetch(`/api/portal/memories/stars?bookingId=${keeperBookingId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.photos) setKeepers(new Set(d.photos)); })
      .catch(() => {});
  }, [keeperBookingId]);

  async function toggleKeeper(ref: string) {
    if (!keeperBookingId) return;
    const starred = !keepers.has(ref);
    setKeepers((s) => { const n = new Set(s); starred ? n.add(ref) : n.delete(ref); return n; }); // optimistic
    await fetch("/api/portal/memories/stars", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: keeperBookingId, kind: "photo", ref, starred }),
    }).catch(() => setKeepers((s) => { const n = new Set(s); starred ? n.delete(ref) : n.add(ref); return n; }));
  }

  // Keepers first: once the member has starred photos, surface them as a pinned
  // "Your keepers" section at the very top of the show (they also stay in their
  // own group). Empty until keepers exist (needs the keepers table live).
  const keeperGroup: GalleryGroup | null = useMemo(() => {
    if (!keeperBookingId || keepers.size === 0) return null;
    const photos: string[] = [];
    const seen = new Set<string>();
    for (const g of groups) for (const src of g.photos) {
      const ref = photoRef(src);
      if (keepers.has(ref) && !seen.has(ref)) { seen.add(ref); photos.push(src); }
    }
    return photos.length ? { key: "keepers", label: "Your keepers", kind: "everyone", photos } : null;
  }, [groups, keepers, keeperBookingId]);
  const displayGroups = useMemo(() => (keeperGroup ? [keeperGroup, ...groups] : groups), [keeperGroup, groups]);

  // Flatten in display order; each group knows its starting index for the lightbox.
  const { flat, offsets } = useMemo(() => {
    const flat: string[] = [];
    const offsets: number[] = [];
    for (const g of displayGroups) { offsets.push(flat.length); flat.push(...g.photos); }
    return { flat, offsets };
  }, [displayGroups]);

  const downloadable = !!bookingId && downloadsRemaining != null;
  const minePhotos = groups.find((g) => g.kind === "mine")?.photos ?? [];
  // Downloads work off the real, de-duplicated set (the keepers pin duplicates refs).
  const uniqueAll = useMemo(() => [...new Set(groups.flatMap((g) => g.photos))], [groups]);
  const hasOthers = uniqueAll.length > minePhotos.length;

  async function zipAndSave(urls: string[], filename: string) {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    await Promise.all(
      urls.map(async (url, i) => {
        const blob = await fetch(url).then((r) => r.blob());
        const ext = (url.split(".").pop() || "jpg").split("?")[0].slice(0, 4);
        zip.file(`photo-${String(i + 1).padStart(2, "0")}.${ext}`, blob);
      })
    );
    const out = await zip.generateAsync({ type: "blob" });
    const href = URL.createObjectURL(out);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(href);
  }

  // "My photos" = the member's own shots — their own, so no download cap.
  async function downloadMine() {
    if (!minePhotos.length) return;
    setErr("");
    setZipping(true);
    try { await zipAndSave(minePhotos, "my-photos.zip"); }
    catch { setErr("Couldn't build the download. Please try again."); }
    finally { setZipping(false); }
  }

  // "All photos" = the whole gallery (incl. shared) — capped per booking.
  async function downloadAll() {
    if (!bookingId) return;
    setErr("");
    setZipping(true);
    try {
      const res = await fetch(`/api/portal/bookings/${bookingId}/photo-download`, { method: "POST" });
      if (!res.ok) {
        setRemaining(0);
        setErr(res.status === 403 ? "You've used all your downloads — the gallery stays available to view." : "Couldn't start the download. Please try again.");
        setZipping(false);
        return;
      }
      const { remaining: rem } = await res.json();
      await zipAndSave(uniqueAll, "trip-photos.zip");
      setRemaining(typeof rem === "number" ? rem : Math.max(0, remaining - 1));
    } catch {
      setErr("Couldn't build the download. Please try again.");
    } finally {
      setZipping(false);
    }
  }

  useEffect(() => {
    if (open === null) return;
    const n = flat.length;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % n));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + n) % n));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, flat.length]);

  if (flat.length === 0) return null;

  const iconWrap = (kind: GalleryGroup["kind"]) =>
    `shrink-0 w-7 h-7 rounded-full grid place-items-center ${kind === "mine" ? "bg-[#00afdb]/12 text-[#00afdb]" : kind === "everyone" ? "bg-[#f47b20]/12 text-[#f47b20]" : "bg-[#eef3f4] text-[#6a7a80]"}`;
  const iconSvg = (kind: GalleryGroup["kind"]) => kind === "participant"
    ? <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
    : <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>;
  const header = (g: GalleryGroup) => (
    <>
      <span className={iconWrap(g.kind)}>{iconSvg(g.kind)}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-[#00374a] truncate">
          {g.label}
          {g.kind === "participant" && <span className="text-[12px] font-medium text-[#9aa6ac]"> · shared with you</span>}
        </span>
      </span>
      <span className="shrink-0 text-[12px] font-semibold text-[#9aa6ac] tabular-nums">{g.photos.length}</span>
    </>
  );
  // Masonry tile: the WHOLE photo at its natural aspect ratio (no square crop, no
  // letterbox bars). Tiles flow into columns so portraits and landscapes both show
  // fully — a proper overview of each shot. `break-inside-avoid` keeps a photo from
  // splitting across columns; `mb-2` is the vertical gutter (column-gap is `gap-2`).
  // Square tile, photo fills it edge-to-edge (object-cover, no hover zoom) —
  // the uniform Instagram-style grid.
  const thumb = (src: string, idx: number) => {
    const ref = photoRef(src);
    const kept = !!keeperBookingId && keepers.has(ref);
    return (
      <div key={idx} className="relative group block w-full aspect-square overflow-hidden rounded-xl bg-[#eef3f4] ring-1 ring-black/[0.04]">
        <button type="button" onClick={() => setOpen(idx)} aria-label={`Open photo ${idx + 1}`} className="absolute inset-0 w-full h-full transition-shadow hover:shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cdnImage(src, { width: 700 })} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        </button>
        {keeperBookingId && (
          <button type="button" onClick={() => toggleKeeper(ref)} title={kept ? "Kept forever ⭐" : "Keep this forever"}
            className={`absolute top-2 right-2 z-10 w-8 h-8 rounded-full grid place-items-center transition-all ${kept ? "bg-amber-400 text-white shadow" : "bg-black/45 text-white opacity-0 group-hover:opacity-100"}`}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill={kept ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
          </button>
        )}
      </div>
    );
  };

  const PREVIEW = 8; // photos shown before "Show all" (~2 grid rows)

  return (
    <>
      {keeperBookingId && (
        <div className="rounded-2xl border border-[#f6d9a8] bg-[#fff8ec] px-4 py-3 mb-4">
          <p className="text-[13.5px] font-bold text-[#00374a]">⭐ Choose your keepers{keepers.size > 0 ? ` — ${keepers.size} saved` : ""}</p>
          <p className="text-[12.5px] text-[#8a6a2a] mt-0.5 leading-snug">Tap the star on the photos you want to keep forever. The rest of the gallery is removed 3 months after the trip.</p>
        </div>
      )}
      <div className="space-y-2.5">
        {displayGroups.map((g, gi) => {
          // Keepers — pinned at the very top, always open, star-marked.
          if (g.key === "keepers") {
            return (
              <div key={g.key} className="rounded-xl border-2 border-[#f6d9a8] bg-[#fffaf0] overflow-hidden">
                <div className="flex items-center gap-2.5 px-4 py-3">
                  <span className="shrink-0 w-7 h-7 rounded-full grid place-items-center bg-amber-400/20 text-amber-500">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                  </span>
                  <span className="min-w-0 flex-1 block text-[14px] font-bold text-[#00374a] truncate">Your keepers</span>
                  <span className="shrink-0 text-[12px] font-semibold text-[#9aa6ac] tabular-nums">{g.photos.length}</span>
                </div>
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-2.5">
                    {g.photos.map((src, i) => thumb(src, offsets[gi] + i))}
                  </div>
                </div>
              </div>
            );
          }
          // "Your photos" — always shown, first row + a blurred peek, expandable.
          if (g.kind === "mine") {
            const hasMore = g.photos.length > PREVIEW;
            const shown = !mineExpanded && hasMore ? g.photos.slice(0, PREVIEW) : g.photos;
            return (
              <div key={g.key} className="rounded-xl border border-[#f0e6d6] bg-[#fffdf9] overflow-hidden">
                <div className="flex items-center gap-2.5 px-4 py-3">{header(g)}</div>
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-2.5">
                    {shown.map((src, i) => thumb(src, offsets[gi] + i))}
                  </div>
                  {hasMore && (
                    <button type="button" onClick={() => setMineExpanded((v) => !v)} className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-bold text-[#00afdb]">
                      {mineExpanded ? "Show less" : `Show all ${g.photos.length} photos`}
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={mineExpanded ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} /></svg>
                    </button>
                  )}
                </div>
              </div>
            );
          }

          // Week memories + each participant — collapsed by default. Shared `name`
          // makes them an exclusive accordion: opening one folds the others.
          return (
            <details key={g.key} name="trip-gallery-group" className="rounded-xl border border-[#f0e6d6] bg-[#fffdf9] overflow-hidden [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex items-center gap-2.5 px-4 py-3 cursor-pointer list-none select-none">
                {header(g)}
                <svg className="w-4 h-4 text-[#c0ccd0] acc-chevron shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </summary>
              <div className="px-4 pb-4">
                <div className="columns-3 sm:columns-4 gap-2">
                  {g.photos.map((src, i) => thumb(src, offsets[gi] + i))}
                </div>
              </div>
            </details>
          );
        })}
      </div>

      {downloadable && (
        <div className="flex flex-wrap items-center gap-2.5 mt-4">
          {minePhotos.length > 0 && (
            <button
              type="button"
              onClick={downloadMine}
              disabled={zipping}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13.5px] font-bold text-[#00374a] bg-white border border-[#dde6e9] hover:border-[#00afdb] disabled:opacity-50 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              Download my photos
            </button>
          )}
          {hasOthers && (
            <button
              type="button"
              onClick={downloadAll}
              disabled={zipping || remaining <= 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-50 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              {zipping ? "Preparing…" : "Download all photos"}
            </button>
          )}
          {hasOthers && (
            <span className="text-[12.5px] text-[#8a9aa0]">
              {remaining > 0 ? `${remaining} full download${remaining === 1 ? "" : "s"} left` : "No full downloads left"}
            </span>
          )}
        </div>
      )}
      {err && <p className="text-[12.5px] text-[#c4621a] mt-2">{err}</p>}

      {open !== null && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <button aria-label="Close" className="absolute top-5 right-5 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center" onClick={() => setOpen(null)}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
          <button aria-label="Previous" className="absolute left-3 sm:left-6 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center" onClick={(e) => { e.stopPropagation(); setOpen((i) => (i === null ? i : (i - 1 + flat.length) % flat.length)); }}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cdnImage(flat[open], { width: 1600 })} alt="" className="max-h-[86vh] max-w-[90vw] rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button aria-label="Next" className="absolute right-3 sm:right-6 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center" onClick={(e) => { e.stopPropagation(); setOpen((i) => (i === null ? i : (i + 1) % flat.length)); }}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          <span className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/60 text-sm font-medium tabular-nums">{open + 1} / {flat.length}</span>
        </div>
      )}
    </>
  );
}
