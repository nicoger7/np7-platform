"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GalleryGroup } from "@/lib/portal-data";
import { cdnImage } from "@/lib/img";
import { mutate } from "@/lib/mutate";
import { ShareSheet } from "./share-sheet";
import { DownloadMenu } from "./download-menu";
import { KEEPER_LIMIT, keeperLimitMessage } from "@/lib/keepers";

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
  trip,
}: {
  groups: GalleryGroup[];
  bookingId?: string;
  downloadsRemaining?: number;
  /** When set, members can star photos as permanent "keepers" for this booking. */
  keeperBookingId?: string;
  /** Trip title + dates → branded share card ("share your trip to your story"). */
  trip?: { title: string; sub?: string };
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [mineExpanded, setMineExpanded] = useState(false);
  // "From the crew" merges every participant's shared gallery into one filterable
  // section (chip per rider) instead of a long stack of accordions.
  const [crewFilter, setCrewFilter] = useState<string | null>(null); // null = everyone
  const [crewExpanded, setCrewExpanded] = useState(false);
  const [remaining, setRemaining] = useState(downloadsRemaining ?? 0);
  // Collapsing a big group leaves the viewport stranded far down the page — on
  // "Show less" we scroll back to the top of that same group.
  const mineRef = useRef<HTMLDivElement>(null);
  const crewRef = useRef<HTMLDivElement>(null);
  const scrollToTopOf = (ref: { current: HTMLDivElement | null }) =>
    requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  const [share, setShare] = useState<string | null>(null); // photo url open in the share sheet
  const [zipping, setZipping] = useState(false);
  const [err, setErr] = useState("");
  const [keepers, setKeepers] = useState<Set<string>>(new Set());
  const [keeperErr, setKeeperErr] = useState("");

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
    setKeeperErr("");
    // Stop at the cap before the optimistic add, so the star never lights up on
    // a photo the server is about to refuse. Unstarring is always allowed —
    // that is how you swap one out.
    if (starred && keepers.size >= KEEPER_LIMIT) {
      setKeeperErr(keeperLimitMessage("photo"));
      return;
    }
    setKeepers((s) => { const n = new Set(s); starred ? n.add(ref) : n.delete(ref); return n; }); // optimistic
    // Only a network throw used to revert; an expired session or a rejected
    // booking (401/403) left the star glowing gold on a photo the keepers table
    // never recorded. The member stops worrying about that shot, and a year
    // after the trip the retention cron deletes the one photo they meant to keep
    // forever. Revert the star and say so, so they can star it again for real.
    const r = await mutate("/api/portal/memories/stars", {
      method: "POST",
      body: { bookingId: keeperBookingId, kind: "photo", ref, starred },
    });
    if (!r.ok) {
      setKeepers((s) => { const n = new Set(s); starred ? n.delete(ref) : n.add(ref); return n; });
      setKeeperErr(r.error);
    }
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
  const everyonePhotos = useMemo(() => groups.filter((g) => g.kind === "everyone").flatMap((g) => g.photos), [groups]);
  // Downloads work off the real, de-duplicated set (the keepers pin duplicates refs).
  const uniqueAll = useMemo(() => [...new Set(groups.flatMap((g) => g.photos))], [groups]);
  const hasOthers = uniqueAll.length > minePhotos.length;
  // Only the rider's OWN shots and the shared "everyone" week-memories can be turned
  // into a branded card — never another named participant's photo. `sharePhotos` is
  // the picker list (own first); `shareableSet` gates which thumbnails show the icon.
  const sharePhotos = useMemo(() => [...new Set([...minePhotos, ...everyonePhotos])], [minePhotos, everyonePhotos]);
  const shareableSet = useMemo(() => new Set(sharePhotos), [sharePhotos]);

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

  // Anything beyond the member's own shots — capped per booking. "Week memories"
  // (the shared pool alone) and "everything" both count as one full download:
  // the cap protects egress, and the shared pool IS the bulk of it.
  async function downloadCapped(urls: string[], filename: string) {
    if (!bookingId || !urls.length) return;
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
      await zipAndSave(urls, filename);
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
        {/* Share this shot as a branded story card — only own + shared "everyone" photos */}
        {shareableSet.has(src) && (
          <button type="button" onClick={(e) => { e.stopPropagation(); setShare(src); }} title="Share this photo"
            className="absolute bottom-2 left-2 z-10 w-8 h-8 rounded-full grid place-items-center bg-black/45 text-white opacity-80 group-hover:opacity-100 hover:bg-black/75 transition-all">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v14" /></svg>
          </button>
        )}
      </div>
    );
  };

  const PREVIEW = 8; // photos shown before "Show all" (~2 grid rows)
  const CREW_PREVIEW = 12; // crew-shared photos shown before "Show all" (~3 rows)

  // Crew-shared galleries (kind "participant") folded into one section. Each item
  // keeps its ABSOLUTE index into `flat` so the shared lightbox still traverses
  // the whole show correctly.
  const nameShort = (s: string) => s.split(/\s+/)[0] || s;
  const nameInitials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  // "Everyone's photos" = the shared "Week memories" (kind everyone) + every
  // participant's gallery, in one filterable section. Keepers are pinned above
  // and excluded here.
  const crewEntries = displayGroups.map((g, gi) => ({ g, gi })).filter((e) => e.g.key !== "keepers" && (e.g.kind === "participant" || e.g.kind === "everyone"));
  const crewItems = crewEntries.flatMap(({ g, gi }) => g.photos.map((src, i) => ({ src, absIdx: offsets[gi] + i, key: g.key })));
  const crewFiltered = crewFilter ? crewItems.filter((it) => it.key === crewFilter) : crewItems;
  const crewVisible = !crewExpanded && crewFiltered.length > CREW_PREVIEW ? crewFiltered.slice(0, CREW_PREVIEW) : crewFiltered;

  return (
    <>
      {keeperBookingId && (
        <div className="rounded-2xl border border-[#f6d9a8] bg-[#fff8ec] px-4 py-3 mb-4">
          <p className="text-[13.5px] font-bold text-[#00374a]">⭐ Choose your keepers — {keepers.size} of {KEEPER_LIMIT} kept</p>
          <p className="text-[12.5px] text-[#8a6a2a] mt-0.5 leading-snug">
            Photos stay for a year after the trip (videos 3 months). Star up to {KEEPER_LIMIT} to keep forever
            {keepers.size >= KEEPER_LIMIT ? " — unstar one to swap it." : "."}
          </p>
          {/* The star reverted — say why here, next to the keepers explainer, so the
              member knows the photo is NOT protected yet and stars it again. */}
          {keeperErr && <p className="text-[12.5px] font-semibold text-[#c4621a] mt-1.5 leading-snug">{keeperErr}</p>}
        </div>
      )}
      <div className="space-y-2.5">
        {displayGroups.map((g, gi) => {
          // Week memories (everyone) + participant galleries are merged into the
          // single "Everyone's photos" section rendered below — skip them here.
          // (Keepers is kind "everyone" too but pinned separately, so keep it.)
          if (g.key !== "keepers" && (g.kind === "participant" || g.kind === "everyone")) return null;
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
              <div key={g.key} ref={mineRef} className="scroll-mt-24 rounded-xl border border-[#f0e6d6] bg-[#fffdf9] overflow-hidden">
                <div className="flex items-center gap-2.5 px-4 py-3">{header(g)}</div>
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-2.5">
                    {shown.map((src, i) => thumb(src, offsets[gi] + i))}
                  </div>
                  {hasMore && (
                    <button type="button" onClick={() => { if (mineExpanded) scrollToTopOf(mineRef); setMineExpanded((v) => !v); }} className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-bold text-[#00afdb]">
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
              <summary className="flex items-center gap-2.5 px-4 py-3.5 min-h-[54px] cursor-pointer list-none select-none hover:bg-[#fbf6ec] transition-colors">
                {header(g)}
                <svg className="w-4 h-4 text-[#c0ccd0] acc-chevron shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              </summary>
              <div className="px-4 pb-4">
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-2.5">
                  {g.photos.map((src, i) => thumb(src, offsets[gi] + i))}
                </div>
              </div>
            </details>
          );
        })}

        {/* Everyone's photos — Week memories + every rider's shared gallery in
            one place, filterable by source. */}
        {crewEntries.length > 0 && (
          <div ref={crewRef} className="scroll-mt-24 rounded-xl border border-[#f0e6d6] bg-[#fffdf9] overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3">
              <span className={iconWrap("everyone")}>{iconSvg("everyone")}</span>
              <span className="min-w-0 flex-1 block text-[14px] font-bold text-[#00374a] truncate">Everyone&apos;s photos</span>
              <span className="shrink-0 text-[12px] font-semibold text-[#9aa6ac] tabular-nums">{crewItems.length}</span>
            </div>

            {/* source filter chips: All · Week memories · each rider */}
            <div className="px-4 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => { setCrewFilter(null); setCrewExpanded(false); }}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold border transition-colors ${crewFilter === null ? "bg-[#00afdb] text-white border-[#00afdb]" : "bg-white text-[#00374a] border-[#e2e9ec] hover:border-[#00afdb]"}`}
              >
                All <span className="opacity-70 tabular-nums">{crewItems.length}</span>
              </button>
              {crewEntries.map(({ g }) => {
                const on = crewFilter === g.key;
                const isEveryone = g.kind === "everyone";
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => { setCrewFilter(on ? null : g.key); setCrewExpanded(false); }}
                    className={`inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 text-[12.5px] font-bold border transition-colors ${on ? "bg-[#00afdb] text-white border-[#00afdb]" : "bg-white text-[#00374a] border-[#e2e9ec] hover:border-[#00afdb]"}`}
                  >
                    <span className={`w-6 h-6 rounded-full grid place-items-center ${on ? "bg-white/25 text-white" : isEveryone ? "bg-[#f47b20]/15 text-[#f47b20]" : "bg-[#dceef2] text-[#00748f]"}`}>
                      {isEveryone
                        ? <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                        : <span className="text-[10px] font-bold">{nameInitials(g.label)}</span>}
                    </span>
                    {isEveryone ? g.label : nameShort(g.label)} <span className="opacity-70 tabular-nums">{g.photos.length}</span>
                  </button>
                );
              })}
            </div>

            <div className="px-4 pb-4 pt-3">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-2.5">
                {crewVisible.map((it) => thumb(it.src, it.absIdx))}
              </div>
              {crewFiltered.length > CREW_PREVIEW && (
                <button type="button" onClick={() => { if (crewExpanded) scrollToTopOf(crewRef); setCrewExpanded((v) => !v); }} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-[#00afdb]">
                  {crewExpanded ? "Show less" : `Show all ${crewFiltered.length} photos`}
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d={crewExpanded ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} /></svg>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Prominent, always-visible share CTA — turn a shot into a branded story card.
          Only when there's a shareable photo (own or the shared "everyone" memories). */}
      {sharePhotos.length > 0 && (
        <>
          <button type="button" onClick={() => setShare(sharePhotos[0])}
            className="mt-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-[14.5px] font-black text-white shadow-[0_10px_26px_rgba(240,123,32,0.26)] hover:-translate-y-0.5 transition-transform"
            style={{ background: "linear-gradient(135deg,#f7b733 0%,#f47b20 55%,#e0590f 100%)" }}>
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v14" /></svg>
            Share your trip 🤙
          </button>
          <p className="text-[12px] text-[#9aa6ac] mt-1.5">Post a branded card to your story — or tap the share icon on any photo.</p>
        </>
      )}

      {downloadable && (
        <DownloadMenu
          label="Download photos"
          unit="photo"
          remaining={remaining}
          busy={zipping ? "Preparing…" : undefined}
          error={err || undefined}
          choices={[
            { key: "mine", label: "Just yours", count: minePhotos.length },
            // Only offer the shared pool alone when it isn't the whole gallery anyway.
            ...(hasOthers && new Set(everyonePhotos).size < uniqueAll.length
              ? [{ key: "week", label: "Week memories", count: new Set(everyonePhotos).size, usesCredit: true }]
              : []),
            ...(hasOthers ? [{ key: "all", label: "Everything", count: uniqueAll.length, usesCredit: true }] : []),
          ]}
          onPick={(k) => {
            if (k === "mine") downloadMine();
            else if (k === "week") downloadCapped([...new Set(everyonePhotos)], "week-memories.zip");
            else downloadCapped(uniqueAll, "trip-photos.zip");
          }}
        />
      )}

      {open !== null && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <button aria-label="Close" className="absolute top-5 right-5 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center" onClick={() => setOpen(null)}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
          {/* Share this shot as a branded NP7 story card — own + shared "everyone" only */}
          {shareableSet.has(flat[open]) && (
            <button onClick={(e) => { e.stopPropagation(); setShare(flat[open]); }}
              className="absolute top-5 left-5 z-10 inline-flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-bold text-[#00374a] bg-white/95 hover:bg-white shadow-lg transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v14" /></svg>
              Share to story
            </button>
          )}
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

      {share && <ShareSheet photo={share} photos={sharePhotos} trip={trip} onClose={() => setShare(null)} />}
    </>
  );
}
