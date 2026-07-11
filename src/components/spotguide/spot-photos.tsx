"use client";

import { useRef, useState } from "react";
import { useSpotguide } from "./spotguide-provider";

export type GalleryPhoto = { url: string; id?: string; score?: number };

/** Spot gallery (NP7 + member photos) and/or a member upload button. Member
    photos (those with an `id`) are up/down-votable and can be flagged; the grid
    is served best-first and a flagged photo drops out locally once hidden. */
export function SpotPhotos({ spotId, photos, accent = "#00afdb", mode = "both" }: { spotId: string; photos: GalleryPhoto[]; accent?: string; mode?: "both" | "gallery" | "upload" }) {
  const sg = useSpotguide();
  const showGallery = mode !== "upload";
  const showUpload = mode !== "gallery";
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [arming, setArming] = useState(false); // showing the ownership attestation
  const [attest, setAttest] = useState(false);
  const [pv, setPv] = useState<Record<string, { score: number; my: number; hidden?: boolean }>>({});

  const scoreOf = (p: GalleryPhoto) => (p.id && pv[p.id] ? pv[p.id].score : p.score ?? 0);
  const myOf = (p: GalleryPhoto) => (p.id && pv[p.id] ? pv[p.id].my : 0);

  async function react(id: string, opts: { value?: number; flag?: boolean }) {
    if (!sg.loggedIn) { sg.needAuth(); return; }
    const r = await fetch("/api/portal/spotguide/photo-vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photoId: id, ...opts }) });
    if (r.status === 401) { sg.needAuth(); return; }
    if (!r.ok) return;
    const j = await r.json();
    setPv((s) => ({ ...s, [id]: { score: j.score, my: j.mine.value, hidden: j.hidden } }));
  }
  const upvote = (id: string) => react(id, { value: (pv[id]?.my ?? 0) === 1 ? 0 : 1 });
  const downvote = (id: string) => react(id, { value: (pv[id]?.my ?? 0) === -1 ? 0 : -1 });
  const flag = (id: string) => { if (confirm("Report this photo as inappropriate? A few reports hide it for NP7 to review.")) react(id, { flag: true }); };

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!sg.loggedIn) { sg.needAuth(); return; }
    setBusy(true); setError("");
    const fd = new FormData();
    fd.append("file", file); fd.append("spotId", spotId);
    fd.append("owner_attested", "1"); // member confirmed they own / may share it
    const r = await fetch("/api/portal/spotguide/photo", { method: "POST", body: fd });
    setBusy(false);
    if (r.status === 401) { sg.needAuth(); return; }
    if (r.ok) { setDone(true); setArming(false); setAttest(false); }
    else { const j = await r.json().catch(() => ({})); setError(j.error ?? "Upload failed."); }
  }

  return (
    <div>
      {showGallery && photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
          {photos.filter((p) => !(p.id && pv[p.id]?.hidden)).map((p, i) => (
            <div key={p.id ?? i} className="relative group aspect-square rounded-lg overflow-hidden bg-[#e9eef0]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" loading="lazy" className="w-full h-full object-cover" />
              {p.id && (
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-1.5 py-1 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <div className="flex items-center gap-1">
                    <button onClick={() => upvote(p.id!)} title="Good shot" className="text-[13px] leading-none" style={{ color: myOf(p) === 1 ? accent : "#fff", opacity: myOf(p) === 1 ? 1 : 0.85 }}>▲</button>
                    <span className="text-white text-[11px] font-bold tabular-nums">{scoreOf(p)}</span>
                    <button onClick={() => downvote(p.id!)} title="Meh" className="text-[13px] leading-none" style={{ color: myOf(p) === -1 ? "#ff8a8a" : "#fff", opacity: myOf(p) === -1 ? 1 : 0.85 }}>▼</button>
                  </div>
                  <button onClick={() => flag(p.id!)} title="Report" className="text-white/75 hover:text-white text-[11px] leading-none">⚑</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {showUpload && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          {arming ? (
            <div className="rounded-xl border border-[#e2d8c6] bg-white p-3 space-y-2.5">
              <label className="flex items-start gap-2 text-[12.5px] text-[#5a6b72] cursor-pointer">
                <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-0.5 shrink-0 accent-[#00afdb]" />
                <span>I took this photo (or have the right to share it) &mdash; it&apos;s not grabbed from the web or someone else&apos;s &mdash; and I&apos;m happy for NP7 to use it in the spotguide.</span>
              </label>
              <div className="flex items-center gap-3">
                <button onClick={() => fileRef.current?.click()} disabled={!attest || busy} className="px-3.5 py-2 rounded-full text-[13px] font-bold text-white disabled:opacity-40" style={{ backgroundColor: accent }}>
                  {busy ? "Uploading…" : "Choose photo"}
                </button>
                <button onClick={() => { setArming(false); setAttest(false); }} className="text-[12.5px] font-semibold text-[#9aa6ac]">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => (sg.loggedIn ? setArming(true) : sg.needAuth())} disabled={busy}
              className="text-[13px] font-bold transition-opacity hover:opacity-70 disabled:opacity-50" style={{ color: accent }}>
              {done ? "Add another photo" : "+ Add a photo"}
            </button>
          )}
          {done && !arming && <span className="ml-2 text-[12px]" style={{ color: "#1f9e57" }}>Posted 📸</span>}
          {error && <p className="text-[12px] text-red-500 mt-1">{error}</p>}
        </div>
      )}
    </div>
  );
}
