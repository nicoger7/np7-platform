"use client";

import { useEffect, useState } from "react";

/**
 * The participant's trip-photo gallery: a clean thumbnail grid that opens a
 * full-screen lightbox (click, arrow keys, swipe-friendly) instead of dumping
 * each image into a new tab. Includes a "Download all" button that zips the photos
 * client-side, capped per booking (the gallery stays viewable after the cap).
 */
export function MemberGallery({ photos, bookingId, downloadsRemaining }: { photos: string[]; bookingId: string; downloadsRemaining: number }) {
  const [open, setOpen] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(downloadsRemaining);
  const [zipping, setZipping] = useState(false);
  const [err, setErr] = useState("");

  async function downloadAll() {
    setErr("");
    setZipping(true);
    try {
      // reserve a download (enforces the cap server-side)
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
        photos.map(async (url, i) => {
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, photos.length]);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {photos.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={`Open photo ${i + 1}`}
            className="aspect-square rounded-lg bg-cover bg-center hover:opacity-90 hover:scale-[1.02] transition-all"
            style={{ backgroundImage: `url('${src}')` }}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 mt-3">
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
      {err && <p className="text-[12.5px] text-[#c4621a] mt-2">{err}</p>}

      {open !== null && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <button aria-label="Close" className="absolute top-5 right-5 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center" onClick={() => setOpen(null)}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
          <button aria-label="Previous" className="absolute left-3 sm:left-6 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center" onClick={(e) => { e.stopPropagation(); setOpen((i) => (i === null ? i : (i - 1 + photos.length) % photos.length)); }}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photos[open]} alt="" className="max-h-[86vh] max-w-[90vw] rounded-xl object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button aria-label="Next" className="absolute right-3 sm:right-6 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center" onClick={(e) => { e.stopPropagation(); setOpen((i) => (i === null ? i : (i + 1) % photos.length)); }}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          <span className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/60 text-sm font-medium tabular-nums">{open + 1} / {photos.length}</span>
        </div>
      )}
    </>
  );
}
