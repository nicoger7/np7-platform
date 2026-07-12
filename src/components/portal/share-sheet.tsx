"use client";

import { useEffect, useState } from "react";

type Format = "story" | "square" | "post";
const FORMATS: { key: Format; label: string; ratio: string }[] = [
  { key: "story", label: "Story", ratio: "9 : 16" },
  { key: "post", label: "Portrait", ratio: "4 : 5" },
  { key: "square", label: "Square", ratio: "1 : 1" },
];

/**
 * "Share your trip" sheet — pick a format (story / portrait / square), add your own
 * caption, toggle the trip name, see a live preview of the branded NP7 card, then
 * post it to your story/feed (native share sheet) or download it.
 */
export function ShareSheet({ photo, trip, onClose }: {
  photo: string; trip?: { title?: string; sub?: string }; onClose: () => void;
}) {
  const [format, setFormat] = useState<Format>("story");
  const [caption, setCaption] = useState("");
  const [showTitle, setShowTitle] = useState(true);
  const [debounced, setDebounced] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(true);
  const title = trip?.title || "NP7 Experience";

  // debounce the caption so the preview doesn't regenerate on every keystroke
  useEffect(() => { const t = setTimeout(() => setDebounced(caption), 400); return () => clearTimeout(t); }, [caption]);

  const build = (cap: string) => {
    const p = new URLSearchParams({ photo, title, format });
    if (trip?.sub) p.set("sub", trip.sub);
    if (cap) p.set("caption", cap);
    if (!showTitle) p.set("showTitle", "0");
    return `/api/share-card?${p.toString()}`;
  };
  const previewUrl = build(debounced);
  const ratioClass = format === "story" ? "aspect-[9/16]" : format === "post" ? "aspect-[4/5]" : "aspect-square";

  useEffect(() => { setPreviewing(true); }, [previewUrl]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey); document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  async function go(mode: "share" | "download") {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(build(caption));
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const file = new File([blob], `np7-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "trip"}.jpg`, { type: "image/jpeg" });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      if (mode === "share" && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: `${title} · NP7 Experience`, text: caption || "My NP7 windsurf trip 🤙🌊" });
      } else {
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = href; a.download = file.name; a.click();
        URL.revokeObjectURL(href);
      }
    } catch { /* cancelled / failed */ }
    finally { setBusy(false); }
  }

  const canShareFiles = typeof navigator !== "undefined" && "canShare" in navigator;

  return (
    <div className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[880px] max-h-[92vh] overflow-auto rounded-3xl bg-[#fffdf9] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0e6d6] sticky top-0 bg-[#fffdf9] z-10">
          <h3 className="text-[16px] font-black text-[#00374a]">Share your trip 🤙</h3>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 grid place-items-center rounded-full text-[#6a7a80] hover:bg-black/5">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="grid sm:grid-cols-[minmax(0,300px)_1fr] gap-6 p-6">
          {/* live preview */}
          <div className="mx-auto w-full max-w-[300px]">
            <div className={`relative ${ratioClass} w-full rounded-2xl overflow-hidden bg-[#0a2a33] shadow-lg`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={previewUrl} src={previewUrl} alt="Share preview" onLoad={() => setPreviewing(false)} className={`absolute inset-0 w-full h-full object-cover transition-opacity ${previewing ? "opacity-40" : "opacity-100"}`} />
              {previewing && <div className="absolute inset-0 grid place-items-center"><svg className="w-7 h-7 text-white/80 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M21 12a9 9 0 1 1-6.2-8.5" strokeLinecap="round" /></svg></div>}
            </div>
          </div>

          {/* controls */}
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-[#b0791e] mb-2">Format</p>
              <div className="flex gap-2">
                {FORMATS.map((f) => (
                  <button key={f.key} onClick={() => setFormat(f.key)}
                    className={`flex-1 rounded-xl border-2 px-2 py-2.5 text-center transition-colors ${format === f.key ? "border-[#f0a500] bg-[#fff7e6]" : "border-[#ecdcbb] bg-white hover:border-[#f2cf8a]"}`}>
                    <span className="block text-[13.5px] font-bold text-[#00374a]">{f.label}</span>
                    <span className="block text-[11px] text-[#9aa6ac]">{f.ratio}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-[#b0791e] mb-2">Your caption <span className="normal-case tracking-normal text-[#c3b9a6] font-medium">— optional</span></p>
              <input value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 42))} placeholder="e.g. Best week on the water 🌊"
                className="w-full rounded-xl border border-[#d8e3e6] px-3.5 py-3 text-[15px] outline-none focus:border-[#00afdb] transition-colors" />
              <p className="text-[11px] text-[#9aa6ac] mt-1 text-right">{caption.length}/42</p>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} className="w-4 h-4 accent-[#f0a500]" />
              <span className="text-[13.5px] font-semibold text-[#3a4a50]">Show trip name &amp; dates{trip?.title ? ` (${trip.title})` : ""}</span>
            </label>

            <div className="flex flex-col gap-2.5 pt-1">
              <button onClick={() => go("share")} disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full text-white text-[15px] font-black py-3.5 disabled:opacity-50 shadow-[0_10px_26px_rgba(240,123,32,0.28)] transition-transform hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg,#f7b733 0%,#f47b20 55%,#e0590f 100%)" }}>
                <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v14" /></svg>
                {busy ? "Making your card…" : canShareFiles ? "Share to story / feed" : "Get my card"}
              </button>
              <button onClick={() => go("download")} disabled={busy} className="w-full rounded-full text-[13.5px] font-bold text-[#00374a] bg-white border border-[#dde6e9] py-2.5 hover:border-[#00afdb] disabled:opacity-50 transition-colors">
                Download instead
              </button>
              <p className="text-[11.5px] text-[#9aa6ac] text-center">Posts open your phone&apos;s share sheet — Instagram, WhatsApp, wherever. 🤙</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
