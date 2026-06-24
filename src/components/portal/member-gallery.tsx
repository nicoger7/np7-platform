"use client";

import { useEffect, useMemo, useState } from "react";
import type { GalleryGroup } from "@/lib/portal-data";

/**
 * The participant's trip-photo gallery, split into foldable groups:
 *  - "Your photos" (their own), "Week memories" (the shared everyone shots), then
 *    one group per other participant who shares (labelled with their name).
 * Each group is a smooth <details> accordion (matching the trip page). Thumbnails
 * open a shared full-screen lightbox (click / arrows / swipe) that traverses ALL
 * photos in order. An optional "Download all" zips every photo client-side, capped
 * per booking (omit bookingId/downloadsRemaining for a view-only gallery).
 */
export function MemberGallery({
  groups,
  bookingId,
  downloadsRemaining,
}: {
  groups: GalleryGroup[];
  bookingId?: string;
  downloadsRemaining?: number;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(downloadsRemaining ?? 0);
  const [zipping, setZipping] = useState(false);
  const [err, setErr] = useState("");

  // Flatten in display order; each group knows its starting index for the lightbox.
  const { flat, offsets } = useMemo(() => {
    const flat: string[] = [];
    const offsets: number[] = [];
    for (const g of groups) { offsets.push(flat.length); flat.push(...g.photos); }
    return { flat, offsets };
  }, [groups]);

  const downloadable = !!bookingId && downloadsRemaining != null;

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
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      await Promise.all(
        flat.map(async (url, i) => {
          const blob = await fetch(url).then((r) => r.blob());
          const ext = (url.split(".").pop() || "jpg").split("?")[0].slice(0, 4);
          zip.file(`photo-${String(i + 1).padStart(2, "0")}.${ext}`, blob);
        })
      );
      const out = await zip.generateAsync({ type: "blob" });
      const href = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = href;
      a.download = "trip-photos.zip";
      a.click();
      URL.revokeObjectURL(href);
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

  return (
    <>
      <div className="space-y-2.5">
        {groups.map((g, gi) => (
          <details
            key={g.key}
            open={g.kind !== "participant"} // your photos + week memories open; people collapsed
            className="group/sec rounded-xl border border-[#f0e6d6] bg-[#fffdf9] overflow-hidden [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex items-center gap-2.5 px-4 py-3 cursor-pointer list-none select-none">
              <span className={`shrink-0 w-7 h-7 rounded-full grid place-items-center ${g.kind === "mine" ? "bg-[#00afdb]/12 text-[#00afdb]" : g.kind === "everyone" ? "bg-[#f47b20]/12 text-[#f47b20]" : "bg-[#eef3f4] text-[#6a7a80]"}`}>
                {g.kind === "participant" ? (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
                ) : (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold text-[#00374a] truncate">
                  {g.label}
                  {g.kind === "participant" && <span className="text-[12px] font-medium text-[#9aa6ac]"> · shared with you</span>}
                </span>
              </span>
              <span className="shrink-0 text-[12px] font-semibold text-[#9aa6ac] tabular-nums">{g.photos.length}</span>
              <svg className="w-4 h-4 text-[#c0ccd0] acc-chevron shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </summary>
            <div className="px-4 pb-4">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {g.photos.map((src, i) => {
                  const idx = offsets[gi] + i;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setOpen(idx)}
                      aria-label={`Open photo ${idx + 1}`}
                      className="aspect-square rounded-lg bg-cover bg-center hover:opacity-90 hover:scale-[1.02] transition-all"
                      style={{ backgroundImage: `url('${src}')` }}
                    />
                  );
                })}
              </div>
            </div>
          </details>
        ))}
      </div>

      {downloadable && (
        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            onClick={downloadAll}
            disabled={zipping || remaining <= 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            {zipping ? "Preparing…" : "Download all photos"}
          </button>
          <span className="text-[12.5px] text-[#8a9aa0]">
            {remaining > 0 ? `${remaining} download${remaining === 1 ? "" : "s"} left` : "No downloads left"}
          </span>
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
          <img src={flat[open]} alt="" className="max-h-[86vh] max-w-[90vw] rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button aria-label="Next" className="absolute right-3 sm:right-6 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center" onClick={(e) => { e.stopPropagation(); setOpen((i) => (i === null ? i : (i + 1) % flat.length)); }}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          <span className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/60 text-sm font-medium tabular-nums">{open + 1} / {flat.length}</span>
        </div>
      )}
    </>
  );
}
