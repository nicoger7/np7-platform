"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * A shareable story graphic for a survey.
 *
 * Same generator as the members' "share your trip" card — branded frame, safe
 * zones for the Instagram overlay, real vector type — pointed at a survey
 * instead of a gallery photo. No point maintaining two of these.
 *
 * Everything is a URL, so the preview IS the file: what you see is exactly what
 * downloads.
 */
const FORMATS = [
  { key: "story", label: "Story 9:16", w: 1080, h: 1920 },
  { key: "post", label: "Post 4:5", w: 1080, h: 1350 },
  { key: "square", label: "Square", w: 1080, h: 1080 },
] as const;

export function SurveyStoryShare({
  photos,
  defaultTitle,
  defaultSub,
}: {
  photos: { url: string; label: string }[];
  defaultTitle: string;
  defaultSub?: string;
}) {
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState(photos[0]?.url ?? "");
  const [title, setTitle] = useState(defaultTitle);
  const [sub, setSub] = useState(defaultSub ?? "");
  const [caption, setCaption] = useState("Help us pick the week");
  const [format, setFormat] = useState<(typeof FORMATS)[number]["key"]>("story");

  // The renderer reports how far it had to stretch the source. Most of our older
  // photos came off the old website at ~1024-1280px wide, and covering a
  // 1080x1920 story from one means a 2x+ upscale — no encoder setting saves
  // that. Say it here, before the card gets posted somewhere.
  const [quality, setQuality] = useState<{ size: string; upscale: number } | null>(null);

  const src = useMemo(() => {
    if (!photo) return "";
    const q = new URLSearchParams({ photo, title, sub, caption, format });
    return `/api/share-card?${q.toString()}`;
  }, [photo, title, sub, caption, format]);

  useEffect(() => {
    if (!src) return;
    let alive = true;
    fetch(src, { method: "GET" }).then((r) => {
      if (!alive) return;
      const size = r.headers.get("X-Source-Size");
      const up = Number(r.headers.get("X-Upscale") || "1");
      if (size) setQuality({ size, upscale: up });
    }).catch(() => {});
    return () => { alive = false; };
  }, [src]);

  const field = "w-full rounded-lg border border-[#d8e3e6] bg-white text-[#0a2a33] px-3 py-2 text-[13.5px] outline-none focus:border-[#0aa3c7]";
  const lbl = "text-[11px] font-black uppercase tracking-[0.1em] text-[#0aa3c7]";

  if (!photos.length) {
    return <p className="text-[12.5px] text-[#9aa6ac]">Add a photo to a trip first — the story card is built from it.</p>;
  }

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-[#0aa3c7] text-[#0aa3c7] text-[12.5px] font-bold px-3.5 py-1.5 hover:bg-[#eaf7fb] transition-colors">
        {open ? "Hide story card" : "📸 Make a story card"}
      </button>

      {open && (
        <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto] items-start">
          <div className="space-y-2.5">
            {photos.length > 1 && (
              <label className="block">
                <span className={lbl}>Photo</span>
                <select value={photo} onChange={(e) => setPhoto(e.target.value)} className={field}>
                  {photos.map((p) => <option key={p.url} value={p.url}>{p.label}</option>)}
                </select>
              </label>
            )}
            <label className="block">
              <span className={lbl}>Headline</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} maxLength={64} />
            </label>
            <label className="block">
              <span className={lbl}>Second line</span>
              <input value={sub} onChange={(e) => setSub(e.target.value)} className={field} maxLength={64} placeholder="e.g. May 2027 · pick your week" />
            </label>
            <label className="block">
              <span className={lbl}>Pill</span>
              <input value={caption} onChange={(e) => setCaption(e.target.value)} className={field} maxLength={42} />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {FORMATS.map((f) => (
                <button key={f.key} onClick={() => setFormat(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${format === f.key ? "bg-[#0aa3c7] text-white" : "border border-[#d8e3e6] text-[#6a7a80] hover:text-[#0a2a33]"}`}>
                  {f.label}
                </button>
              ))}
            </div>
            {quality && quality.upscale > 1.25 && (
              <div className="rounded-lg px-3 py-2.5 text-[12px] leading-relaxed"
                   style={{ background: "#fff6e8", border: "1px solid #f0c98a", color: "#7a4b12" }}>
                <strong>This photo is too small for a sharp card.</strong> It&apos;s {quality.size}px and has to be
                stretched {quality.upscale.toFixed(1)}× to fill the {format === "story" ? "story" : "card"}.
                Pick a different photo, or upload the original — roughly 2400px on the long edge, portrait if you have it.
              </div>
            )}
            <a href={src} download={`np7-survey-${format}.jpg`}
              className="inline-block rounded-full bg-[#0aa3c7] text-white text-[12.5px] font-bold px-4 py-2 hover:bg-[#0891b2] transition-colors">
              Download
            </a>
            <p className="text-[11.5px] text-[#9aa6ac] leading-relaxed">
              Story format keeps everything clear of Instagram&apos;s top and bottom overlays.
              The preview is the file — what you see is what downloads.
            </p>
          </div>

          <div className="justify-self-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={src} src={src} alt="Story card preview"
              className="rounded-xl border border-[#e2d8c6] bg-[#f3ece0]"
              style={{ width: format === "story" ? 200 : format === "post" ? 220 : 240, aspectRatio: format === "story" ? "9/16" : format === "post" ? "4/5" : "1/1", objectFit: "cover" }} />
          </div>
        </div>
      )}
    </div>
  );
}
