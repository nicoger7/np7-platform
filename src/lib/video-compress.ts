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
  ALL_FORMATS, CanvasSink,
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

// Long edge ≤1920 — the Creator Suite's maxSide semantics, NOT a height cap:
// a vertical 1080×1920 phone clip stays untouched instead of shrinking to 607px.
const MAX_SIDE = 1920;
const even = (n: number) => Math.max(2, 2 * Math.round(n / 2)); // encoders want even dims

/**
 * Bitrate targets at 1080p; they scale with the real pixel count.
 *
 * These are DELIBERATELY far above the Creator Suite's ffmpeg presets (6 and 10
 * Mbit/s), and the reason matters: ffmpeg drives Apple's encoder with CABAC and
 * `-prio_speed 0`, while WebCodecs exposes no such knobs — the browser gives us
 * a hardware encoder we cannot tune. At equal bitrate the browser output is
 * visibly softer, so the only lever left is bits, and R2 storage is cheap
 * next to a rider's one video from the week looking mushy.
 *
 * (The first version of this shipped 6 Mbit/s as "Standard", which was byte-for-
 * byte the bitrate it replaced — an upgrade in name only. It also starved the
 * sharpening pass: added detail the encoder then had no bits to keep, which
 * makes a clip look worse, not better.)
 */
export type VideoQuality = "standard" | "high";
const BITRATE_AT_1080 = { standard: 12_000_000, high: 20_000_000 } as const;

export type CompressedVideo = { mp4: Blob; poster: Blob | null };

/**
 * CAS (contrast-adaptive sharpening) as a WebGL2 pass — the browser twin of the
 * Creator Suite's `cas=0.35`. Downscaling 4K water footage to 1080p softens
 * spray and sail texture; this puts the bite back. Runs AFTER mediabunny's
 * resize (the conversion pipeline resizes before the process hook), so it only
 * ever touches ~2MP frames. Returns null when WebGL2 is unavailable — the
 * caller then simply skips sharpening, never fails the encode.
 */
function makeSharpener(w: number, h: number): { apply: (src: CanvasImageSource) => OffscreenCanvas; dispose: () => void } | null {
  try {
    if (typeof OffscreenCanvas === "undefined") return null;
    const canvas = new OffscreenCanvas(w, h);
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) return null;
    // Staging via 2D canvas: drawImage accepts VideoFrame everywhere WebCodecs
    // exists, while texImage2D(VideoFrame) support is patchier (Safari).
    const staging = new OffscreenCanvas(w, h);
    const sctx = staging.getContext("2d");
    if (!sctx) return null;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, `#version 300 es
      out vec2 v_uv;
      void main() {
        vec2 pos = vec2(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0);
        v_uv = pos * 0.5 + 0.5;
        gl_Position = vec4(pos, 0.0, 1.0);
      }`);
    // AMD FidelityFX CAS, ported 1:1 from ffmpeg's vf_cas (what the Creator
    // Suite runs). The filter itself uses the 5-tap cross, but the local
    // min/max come from the FULL 3×3 as DOUBLED sums (range [0,2]) — that is
    // what makes `min(mn, 2.0 - mx)` a real signal-limit clamp: near white
    // (mx→2) the amplitude collapses to 0 and the pixel is left alone. With an
    // un-doubled cross, that term would always lose to mn and dark rims would
    // appear around whitecaps and spray — exactly our footage.
    const fs = compile(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float;
      uniform sampler2D u_tex; uniform vec2 u_px; uniform float u_sharp;
      in vec2 v_uv; out vec4 outColor;
      void main() {
        vec3 a = texture(u_tex, v_uv + vec2(-u_px.x, -u_px.y)).rgb;
        vec3 b = texture(u_tex, v_uv + vec2(     0.0, -u_px.y)).rgb;
        vec3 c = texture(u_tex, v_uv + vec2( u_px.x, -u_px.y)).rgb;
        vec3 d = texture(u_tex, v_uv + vec2(-u_px.x,     0.0)).rgb;
        vec3 e = texture(u_tex, v_uv).rgb;
        vec3 f = texture(u_tex, v_uv + vec2( u_px.x,     0.0)).rgb;
        vec3 g = texture(u_tex, v_uv + vec2(-u_px.x,  u_px.y)).rgb;
        vec3 h = texture(u_tex, v_uv + vec2(     0.0,  u_px.y)).rgb;
        vec3 i = texture(u_tex, v_uv + vec2( u_px.x,  u_px.y)).rgb;
        vec3 mn = min(min(min(d, e), min(f, b)), h);
        mn += min(min(min(mn, a), min(c, g)), i);
        vec3 mx = max(max(max(d, e), max(f, b)), h);
        mx += max(max(max(mx, a), max(c, g)), i);
        vec3 amp = sqrt(clamp(min(mn, 2.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
        vec3 w = amp * (-1.0 / mix(8.0, 5.0, u_sharp));
        outColor = vec4(clamp(((b + d + f + h) * w + e) / (4.0 * w + 1.0), 0.0, 1.0), 1.0);
      }`);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    gl.uniform2f(gl.getUniformLocation(prog, "u_px"), 1 / w, 1 / h);
    gl.uniform1f(gl.getUniformLocation(prog, "u_sharp"), 0.35); // = Creator Suite cas=0.35
    gl.uniform1i(gl.getUniformLocation(prog, "u_tex"), 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.viewport(0, 0, w, h);

    return {
      apply: (src: CanvasImageSource) => {
        sctx.drawImage(src, 0, 0, w, h);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, staging);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        // A LOST context is the one failure mode that doesn't throw: GL calls
        // become no-ops and the canvas reads back as transparent black, which
        // would silently encode the rest of the clip as BLACK FRAMES. Turn it
        // into an exception so the caller's catch falls back to the unsharpened
        // (but correct) frame. Loss is plausible on a long 4K batch.
        if (gl.isContextLost()) throw new Error("WebGL context lost");
        // mediabunny snapshots the canvas synchronously (VideoSample constructor
        // drawImages it immediately), so reusing this one canvas per frame is safe.
        return canvas;
      },
      // Contexts are a capped per-page resource (~16 in Chrome); a batch of
      // dozens of clips would otherwise pile them up and force evictions.
      dispose: () => { try { gl.getExtension("WEBGL_lose_context")?.loseContext(); } catch { /* already gone */ } },
    };
  } catch {
    return null;
  }
}

/** No progress for this long → treat the conversion as hung (undecodable codec,
 *  WebCodecs quirk, …) and bail so the caller can fall back to a raw upload.
 *  Slow-but-alive encodes keep the heartbeat via onProgress, so long clips on
 *  slow machines are fine. */
const STALL_MS = 45_000;

export async function compressVideo(
  file: File,
  onProgress?: (pct: number) => void,
  quality: VideoQuality = "standard"
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

    // Downscale so the LONG edge is ≤1920 (never upscale), H.264 High Profile
    // (mediabunny requests avc1.64… → CABAC) in a streamable MP4. Audio is
    // passed through untouched when the codec already fits MP4 — camera AAC
    // keeps its native bitrate; only exotic audio gets re-encoded.
    const srcTrack = await input.getPrimaryVideoTrack();
    const srcW = srcTrack?.displayWidth ?? 1920;
    const srcH = srcTrack?.displayHeight ?? 1080;
    const scale = Math.min(1, MAX_SIDE / Math.max(srcW, srcH));
    const targetWidth = even(srcW * scale);
    const targetHeight = even(srcH * scale);
    // Bitrate scales with the real pixel count (mediabunny's curve) from the
    // 1080p anchor — a 720p phone clip doesn't get a 4K-grade bitrate.
    const bitrate = Math.max(
      1_000_000,
      Math.round(BITRATE_AT_1080[quality] * Math.pow((targetWidth * targetHeight) / (1920 * 1080), 0.95)),
    );
    // Sharpen ONLY on real downscales (that's where softness comes from);
    // untouched-size clips — usually already-compressed phone footage — are
    // left alone so we never amplify their artifacts.
    const sharpen = scale < 0.999 ? makeSharpener(targetWidth, targetHeight) : null;

    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new BufferTarget(),
    });
    const conversion = await Conversion.init({
      input,
      output,
      video: {
        codec: "avc",
        width: targetWidth,
        height: targetHeight,
        fit: "fill", // same aspect ratio — fill just pins both dimensions
        bitrate,
        ...(sharpen
          ? {
              // Runs AFTER the resize, on ~2MP frames. Any per-frame failure
              // falls back to the (already resized) frame — sharpening can
              // degrade gracefully, but it can never break an encode.
              process: (sample: { toCanvasImageSource(): CanvasImageSource }) => {
                // Returning the sample itself is the graceful degrade: mediabunny
                // accepts a VideoSample straight back (and never closes it twice —
                // close() is idempotent), so the frame still lands, just unsharpened.
                try { return sharpen.apply(sample.toCanvasImageSource()); }
                catch { return sample as never; }
              },
              processedWidth: targetWidth,
              processedHeight: targetHeight,
            }
          : {}),
      },
    });
    beat();
    cancel = () => { conversion.cancel().catch(() => {}); };
    conversion.onProgress = (p) => { beat(); onProgress?.(Math.round(p * 100)); };
    try {
      await conversion.execute();
    } finally {
      // Always hand the GL context back — including after a cancel or a stall
      // bail-out, where this clip's work is abandoned but the batch goes on.
      sharpen?.dispose();
    }

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
    // Seek ~1s in — the very first frames are often black (fade-in / gimbal
    // settling), which is exactly what produced the identical black posters.
    video.currentTime = Math.min(1, Math.max(0.1, (video.duration || 2) / 3));
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("poster: seek timeout")), 10_000);
      video.onseeked = () => { clearTimeout(t); resolve(); };
      video.onerror = () => { clearTimeout(t); reject(new Error("poster: seek failed")); };
    });
    // `seeked` fires before the frame is actually painted — drawing now grabs a
    // black canvas. Wait for a REAL presented frame (requestVideoFrameCallback),
    // falling back to a couple of animation frames on browsers without it.
    await new Promise<void>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = video as any;
      if (typeof v.requestVideoFrameCallback === "function") {
        const done = () => resolve();
        v.requestVideoFrameCallback(done);
        setTimeout(done, 1_000); // safety net — never hang the upload
      } else {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }
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
