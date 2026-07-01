"use client";

import { useRef, useState } from "react";
import { useSpotguide } from "./spotguide-provider";

/** Spot gallery (NP7 + approved member photos) and/or a member upload button.
    `mode` splits the two so viewing (gallery) and contributing (upload) can live
    in different parts of the spot. Uploads land pending moderation. */
export function SpotPhotos({ spotId, photos, accent = "#00afdb", mode = "both" }: { spotId: string; photos: string[]; accent?: string; mode?: "both" | "gallery" | "upload" }) {
  const sg = useSpotguide();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const showGallery = mode !== "upload";
  const showUpload = mode !== "gallery";

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!sg.loggedIn) { sg.needAuth(); return; }
    setBusy(true); setError("");
    const fd = new FormData();
    fd.append("file", file); fd.append("spotId", spotId);
    const r = await fetch("/api/portal/spotguide/photo", { method: "POST", body: fd });
    setBusy(false);
    if (r.status === 401) { sg.needAuth(); return; }
    if (r.ok) setDone(true);
    else { const j = await r.json().catch(() => ({})); setError(j.error ?? "Upload failed."); }
  }

  return (
    <div>
      {showGallery && photos.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
          {photos.map((url, i) => (
            <div key={i} className="aspect-square rounded-lg overflow-hidden bg-[#e9eef0]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}
      {showUpload && (
        <div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          <button onClick={() => (sg.loggedIn ? fileRef.current?.click() : sg.needAuth())} disabled={busy}
            className="text-[13px] font-bold transition-opacity hover:opacity-70 disabled:opacity-50" style={{ color: accent }}>
            {busy ? "Uploading…" : done ? "Add another photo" : "+ Add a photo"}
          </button>
          {done && <span className="ml-2 text-[12px]" style={{ color: "#1f9e57" }}>In for review 📸</span>}
          {error && <p className="text-[12px] text-red-500 mt-1">{error}</p>}
        </div>
      )}
    </div>
  );
}
