"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

/**
 * Crop a coach's photo, and cut them out of it.
 *
 * Two things used to be manual and easy to get wrong. The PHOTO could only be
 * replaced by uploading a new file — no way to re-frame the one already chosen.
 * And the TILE CUTOUT, a transparent PNG of the coach used by `<BrandedTile>`,
 * had to be produced in an external editor and uploaded by hand, which is why
 * most coaches simply don't have one.
 *
 * The cutout is generated here instead: the segmentation model runs in the
 * BROWSER (@imgly/background-removal — WASM, no server, no API key, no
 * per-image cost). It's a big download the first time and then cached by the
 * browser, so the wait is once per machine rather than once per coach.
 *
 * Both outputs go through the normal media upload, so they land on R2 and show
 * up in the library like anything else. PNG stays PNG through the resize step,
 * which is what keeps the transparency.
 */

type Props = {
  photoUrl: string;
  coachName: string;
  /** Save the re-framed photo (JPEG). */
  onPhoto: (url: string) => void;
  /** Save the transparent cutout (PNG). */
  onCutout: (url: string) => void;
  onClose: () => void;
};

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "coach";

/** Draw the current crop to a canvas at the image's natural resolution. */
function cropToCanvas(img: HTMLImageElement, crop: PixelCrop | null): HTMLCanvasElement {
  const sx = img.naturalWidth / img.width;
  const sy = img.naturalHeight / img.height;
  const c = crop
    ? { x: crop.x * sx, y: crop.y * sy, w: crop.width * sx, h: crop.height * sy }
    : { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(c.w));
  canvas.height = Math.max(1, Math.round(c.h));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not read the image"))), type, quality));

/** Trim fully-transparent edges — a cutout with 40% empty margin sits tiny on the tile. */
function trimTransparent(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const { data } = ctx.getImageData(0, 0, w, h);
  let top = h, left = w, right = 0, bottom = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (right <= left || bottom <= top) return canvas; // nothing found — keep as-is
  const pad = Math.round(Math.max(w, h) * 0.01);
  const x0 = Math.max(0, left - pad), y0 = Math.max(0, top - pad);
  const x1 = Math.min(w, right + pad), y1 = Math.min(h, bottom + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0;
  out.height = y1 - y0;
  out.getContext("2d")!.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

export function CoachPhotoStudio({ photoUrl, coachName, onPhoto, onCutout, onClose }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [pixelCrop, setPixelCrop] = useState<PixelCrop | null>(null);
  const [cutout, setCutout] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose, busy]);

  const upload = useCallback(async (blob: Blob, filename: string) => {
    const fd = new FormData();
    fd.append("file", new File([blob], filename, { type: blob.type }));
    fd.append("folder", "coaches");
    const r = await fetch("/api/admin/images", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) throw new Error(j.error || "Upload failed");
    return j.url as string;
  }, []);

  /** Cut the coach out of the (cropped) photo, in the browser. */
  async function generate() {
    if (!imgRef.current) return;
    setBusy("Loading the model — first time only, then it's cached…");
    setError(null);
    try {
      const source = await toBlob(cropToCanvas(imgRef.current, pixelCrop), "image/png");
      // Imported here, not at module scope: it pulls in WASM and must never end
      // up in the server bundle or the initial admin payload.
      const { removeBackground } = await import("@imgly/background-removal");
      setBusy("Finding the coach…");
      const cut = await removeBackground(source, { output: { format: "image/png" } });

      // Paint to a canvas so the empty margin can be trimmed off.
      const bmp = await createImageBitmap(cut);
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      canvas.getContext("2d")!.drawImage(bmp, 0, 0);
      const trimmed = trimTransparent(canvas);
      setCutout(URL.createObjectURL(await toBlob(trimmed, "image/png")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate the cutout.");
    } finally {
      setBusy(null);
    }
  }

  async function saveCutout() {
    if (!cutout) return;
    setBusy("Saving the cutout…");
    setError(null);
    try {
      const blob = await (await fetch(cutout)).blob();
      onCutout(await upload(blob, `${slug(coachName)}-cutout-${Date.now()}.png`));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally { setBusy(null); }
  }

  async function savePhoto() {
    if (!imgRef.current) return;
    setBusy("Saving the photo…");
    setError(null);
    try {
      const blob = await toBlob(cropToCanvas(imgRef.current, pixelCrop), "image/jpeg", 0.9);
      onPhoto(await upload(blob, `${slug(coachName)}-${Date.now()}.jpg`));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally { setBusy(null); }
  }

  const checker = {
    backgroundImage:
      "linear-gradient(45deg,#e2e8ea 25%,transparent 25%),linear-gradient(-45deg,#e2e8ea 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e2e8ea 75%),linear-gradient(-45deg,transparent 75%,#e2e8ea 75%)",
    backgroundSize: "16px 16px",
    backgroundPosition: "0 0,0 8px,8px -8px,-8px 0px",
    backgroundColor: "#f4f7f8",
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onMouseDown={() => !busy && onClose()}>
      <div className="w-full max-w-[880px] max-h-[92vh] overflow-y-auto rounded-2xl p-5"
        style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}
        onMouseDown={(e) => e.stopPropagation()}>

        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <p className="text-[15px] font-bold admin-heading">{coachName}&apos;s photo</p>
            <p className="text-[12.5px] admin-faint leading-snug max-w-[60ch]">
              Drag to re-frame. Save the frame as the photo, or cut {coachName.split(" ")[0]} out of it for the
              auto-branded tiles — the cutout is generated here in your browser, nothing is sent anywhere.
            </p>
          </div>
          <button onClick={() => !busy && onClose()} className="shrink-0 text-[13px] admin-faint hover:admin-heading px-2">✕</button>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] admin-faint mb-1.5">The photo</p>
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
              <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setPixelCrop(c)}>
                {/* crossOrigin so the canvas isn't tainted — R2 sends the header. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img ref={imgRef} src={photoUrl} alt="" crossOrigin="anonymous"
                  onLoad={() => setReady(true)} className="max-h-[46vh] w-auto block" />
              </ReactCrop>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] admin-faint mb-1.5">The cutout</p>
            <div className="rounded-xl h-[calc(46vh)] grid place-items-center p-3" style={{ ...checker, border: "1px solid var(--admin-border)" }}>
              {cutout ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cutout} alt="" className="max-h-full max-w-full object-contain" />
              ) : (
                <p className="text-[12.5px] text-[#5a6b72] text-center max-w-[26ch]">
                  {busy ? busy : "Press ‘Cut out the coach’ — the first run downloads the model, after that it's quick."}
                </p>
              )}
            </div>
          </div>
        </div>

        {error && <p className="text-[12.5px] text-red-400 mt-3">{error}</p>}
        {busy && <p className="text-[12.5px] admin-muted mt-3">{busy}</p>}

        <div className="flex items-center justify-end gap-2 mt-4 flex-wrap">
          <button onClick={() => { setCrop(undefined); setPixelCrop(null); }} disabled={!!busy}
            className="text-[13px] font-semibold admin-muted px-3 py-1.5 rounded-lg hover:bg-[var(--admin-surface-hover)] disabled:opacity-50">
            Reset frame
          </button>
          <button onClick={generate} disabled={!!busy || !ready}
            className="text-[13px] font-bold px-4 py-1.5 rounded-lg disabled:opacity-50 admin-muted hover:admin-heading"
            style={{ border: "1px solid var(--admin-border)" }}>
            {cutout ? "Cut out again" : "Cut out the coach"}
          </button>
          <button onClick={savePhoto} disabled={!!busy || !ready}
            className="text-[13px] font-bold px-4 py-1.5 rounded-lg disabled:opacity-50 admin-muted hover:admin-heading"
            style={{ border: "1px solid var(--admin-border)" }}>
            Save frame as photo
          </button>
          <button onClick={saveCutout} disabled={!!busy || !cutout}
            className="text-[13px] font-bold px-4 py-1.5 rounded-lg bg-[#0aa3c7] text-white disabled:opacity-50">
            Save cutout
          </button>
        </div>
      </div>
    </div>
  );
}
