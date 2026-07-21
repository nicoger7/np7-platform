/**
 * In-browser video compression — the video analog of the photo resize-on-upload.
 *
 * The admin picks full-size camera clips; the BROWSER re-encodes them to a
 * web-friendly ≤1080p H.264 MP4 using the machine's hardware encoder
 * (WebCodecs via mediabunny), grabs a poster frame, and only the SMALL files
 * ever get uploaded. The giant original never leaves the photographer's
 * laptop — no server, no worker, no always-on box.
 *
 * Client-only: call `canCompressInBrowser()` first; on unsupported browsers
 * the uploader falls back to uploading the raw file (compressed later by the
 * optional scripts/compress-videos.mjs fallback).
 */

import {
  Input, Output, Conversion, BlobSource, BufferTarget, Mp4OutputFormat,
  ALL_FORMATS, QUALITY_HIGH, CanvasSink,
} from "mediabunny";

/** WebCodecs video encoder available? (Chrome/Edge/Safari 16.4+.) Audio is NOT
 *  required: camera clips carry AAC, which passes straight through into the MP4
 *  without an AudioEncoder — requiring one (Safari lacks it) forced perfectly
 *  capable browsers onto the raw-upload fallback. If a clip's audio truly needs
 *  re-encoding on such a browser, the conversion fails and the caller falls back
 *  to a raw upload for that one file. */
export function canCompressInBrowser(): boolean {
  return typeof window !== "undefined" && typeof VideoEncoder !== "undefined";
}

const MAX_HEIGHT = 1080;
const even = (n: number) => Math.max(2, 2 * Math.round(n / 2)); // encoders want even dims

export type CompressedVideo = { mp4: Blob; poster: Blob | null };

/** No progress for this long → treat the conversion as hung (undecodable codec,
 *  WebCodecs quirk, …) and bail so the caller can fall back to a raw upload.
 *  Slow-but-alive encodes keep the heartbeat via onProgress, so long clips on
 *  slow machines are fine. */
const STALL_MS = 45_000;

export async function compressVideo(
  file: File,
  onProgress?: (pct: number) => void
): Promise<CompressedVideo> {
  let lastBeat = Date.now();
  const beat = () => { lastBeat = Date.now(); };
  let cancel: (() => void) | null = null;

  const work = (async (): Promise<CompressedVideo> => {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });

    // Poster frame (~1s in, capped width) — grabbed from the ORIGINAL so it's
    // ready even if the encode later fails.
    let poster: Blob | null = null;
    try {
      const track = await input.getPrimaryVideoTrack();
      if (track) {
        const sink = new CanvasSink(track, { width: 1280, fit: "contain" });
        const wrapped = await sink.getCanvas(1).catch(() => null) ?? await sink.getCanvas(0);
        if (wrapped) {
          const c = wrapped.canvas;
          poster = c instanceof OffscreenCanvas
            ? await c.convertToBlob({ type: "image/jpeg", quality: 0.82 })
            : await new Promise<Blob | null>((res) => (c as HTMLCanvasElement).toBlob(res, "image/jpeg", 0.82));
        }
      }
    } catch { /* poster is optional */ }
    beat();

    // Downscale to ≤1080p (never upscale), H.264 in a streamable MP4. Audio is
    // passed through when the codec already fits MP4, re-encoded otherwise —
    // mediabunny decides per track.
    const srcTrack = await input.getPrimaryVideoTrack();
    const targetHeight = even(Math.min(srcTrack?.displayHeight ?? MAX_HEIGHT, MAX_HEIGHT));

    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new BufferTarget(),
    });
    const conversion = await Conversion.init({
      input,
      output,
      video: { codec: "avc", height: targetHeight, bitrate: QUALITY_HIGH },
    });
    beat();
    cancel = () => { conversion.cancel().catch(() => {}); };
    conversion.onProgress = (p) => { beat(); onProgress?.(Math.round(p * 100)); };
    await conversion.execute();

    const buffer = (output.target as BufferTarget).buffer;
    if (!buffer) throw new Error("Compression produced no output");
    return { mp4: new Blob([buffer], { type: "video/mp4" }), poster };
  })();

  // Watchdog: the conversion loop can hang without rejecting on exotic inputs —
  // race it against a heartbeat check so the uploader always gets an answer.
  let iv: ReturnType<typeof setInterval> | undefined;
  const stalled = new Promise<never>((_, reject) => {
    iv = setInterval(() => {
      if (Date.now() - lastBeat > STALL_MS) {
        clearInterval(iv);
        try { cancel?.(); } catch { /* already gone */ }
        reject(new Error("Compression stalled"));
      }
    }, 5_000);
  });
  try {
    return await Promise.race([work, stalled]);
  } finally {
    clearInterval(iv);
    work.catch(() => {}); // don't surface late rejections after a stall bail-out
  }
}

/**
 * Grab a poster frame from a video file WITHOUT WebCodecs — a hidden <video>
 * element + canvas. Used when the uploader's "compress in browser" toggle is
 * off (pre-compressed files upload as-is but still deserve a poster).
 */
export async function extractPosterFrame(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("poster: metadata timeout")), 10_000);
      video.onloadedmetadata = () => { clearTimeout(t); resolve(); };
      video.onerror = () => { clearTimeout(t); reject(new Error("poster: cannot decode")); };
    });
    video.currentTime = Math.min(1, (video.duration || 2) / 2);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("poster: seek timeout")), 10_000);
      video.onseeked = () => { clearTimeout(t); resolve(); };
      video.onerror = () => { clearTimeout(t); reject(new Error("poster: seek failed")); };
    });
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1280 / (video.videoWidth || 1280));
    canvas.width = Math.round((video.videoWidth || 1280) * scale);
    canvas.height = Math.round((video.videoHeight || 720) * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
