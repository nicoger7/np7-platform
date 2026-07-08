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

/** WebCodecs available? (Chrome/Edge/Safari 16.4+ — i.e. any current browser.) */
export function canCompressInBrowser(): boolean {
  return typeof window !== "undefined"
    && typeof VideoEncoder !== "undefined"
    && typeof AudioEncoder !== "undefined";
}

const MAX_HEIGHT = 1080;
const even = (n: number) => Math.max(2, 2 * Math.round(n / 2)); // encoders want even dims

export type CompressedVideo = { mp4: Blob; poster: Blob | null };

export async function compressVideo(
  file: File,
  onProgress?: (pct: number) => void
): Promise<CompressedVideo> {
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
  if (onProgress) conversion.onProgress = (p) => onProgress(Math.round(p * 100));
  await conversion.execute();

  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error("Compression produced no output");
  return { mp4: new Blob([buffer], { type: "video/mp4" }), poster };
}
