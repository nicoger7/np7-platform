"use client";

import { interpolate, type SeriesPoints } from "@/lib/board-measurements";

/**
 * The outline of a board read out of its picture, so the 2D plan can lay the
 * brand's product shot under our own measured outline and say where they differ.
 *
 * Nico, 2026-09-23: "overlay the image it finds online of the top/deck shot with
 * our measurement outline. Can it match it? Note: sometimes we take
 * measurements on the bottom, sometimes the entire width. They can differ."
 *
 * No model and no key: a product shot is a cut-out on a transparent or plain
 * background, so the board is simply every pixel that is not background. Its
 * long side is the board's length, which sets the scale; which end is the tail
 * is decided by trying both ways round against our own width readings.
 *
 * What the picture shows is the PLAN shape seen from above: the full width,
 * rail to rail. It matches "Width (top)" readings; bottom widths sit inside it
 * by the rail, and the comparison says so rather than calling that an error.
 */

export type PhotoMask = {
  w: number; h: number;                // picture size in px (of drawUrl when the picture was straightened)
  x0: number; x1: number; y0: number; y1: number; // the board's bounding box
  vertical: boolean;                   // long side runs top to bottom
  across: Float32Array;                // board width in px at each px along the long side (from x0 or y0)
  centre: number;                      // where the board's middle runs, across the long side (px)
  tiltDeg: number;                     // how much the board leaned in the original picture
  drawUrl: string | null;              // the straightened picture to draw, or null: draw the original
};

export type PhotoFit = {
  cmPerPx: number;
  tailFirst: boolean;                  // the tail is at the top (vertical) or left (horizontal) of the picture
  lengthCm: number;
  scaleFrom: "length" | "published length" | "top width" | "our widths" | "stated max width";
  /** cm per picture px ACROSS the board: from the stated max width when there is one
   *  (a product shot is not always a perfect top view), else the same as along. */
  cmPerPxAcross: number;
  /** How far the picture's proportions are off the stated length and width, in %. */
  aspectOffPct: number | null;
  /** cm the picture's tail end sits behind station 0 (a matched fit moves it). */
  shiftCm: number;
  /** The picture's own tip-to-tail length at this scale. */
  photoLengthCm: number;
  /** Only for a match: the rail allowance found (cm a side, bottom widths) and how well it fits. */
  match?: { against: "top" | "bottom"; railCm: number; rmsCm: number; n: number; byLengthCm: number | null };
  /** Full width in cm at each cm from the tail, drawn as the photo outline. */
  widths: SeriesPoints;
  /** SVG matrix placing the picture on the plan, given the plan's own scale. */
  matrix: (pad: number, min: number, pxPerCm: number, centre: number) => string;
  compare: { against: "top" | "bottom"; mean: number; maxAbs: number; at: number; n: number } | null;
};

/** Read the board's silhouette out of a picture. Null if no board edge is found;
 *  throws PhotoLoadError when the browser would not let the pixels be read. */
export class PhotoLoadError extends Error {}
export async function readPhotoMask(url: string): Promise<PhotoMask | null> {
  // The page shows this picture elsewhere as a plain <img>. The CDN answers a
  // plain request without CORS headers, marks it immutable for a year and does
  // not say "Vary: Origin", so the browser would hand this pixel-reading
  // request that cached copy and refuse it. Its own address gets its own copy.
  const src = url + (url.includes("?") ? "&" : "?") + "cors=1";
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = () => reject(new PhotoLoadError("The picture did not load."));
    i.src = src;
  });
  const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  // Transparent cut-out: the alpha channel IS the board. Otherwise the border
  // colour is the background, and anything clearly different is board.
  let clear = 0;
  for (let i = 3; i < px.length; i += 16) if (px[i] < 16) clear++;
  const transparent = clear / (px.length / 16) > 0.03;
  let bg = [255, 255, 255];
  if (!transparent) {
    const rs: number[] = [], gs: number[] = [], bs: number[] = [];
    const take = (x: number, y: number) => { const o = (y * w + x) * 4; rs.push(px[o]); gs.push(px[o + 1]); bs.push(px[o + 2]); };
    for (let x = 0; x < w; x += 3) { take(x, 1); take(x, h - 2); }
    for (let y = 0; y < h; y += 3) { take(1, y); take(w - 2, y); }
    const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
    bg = [med(rs), med(gs), med(bs)];
  }

  const first = trace(px, w, h, transparent, bg);
  if (!first) return null;

  // A product shot is rarely laid dead straight: the JP picture leans 0.6°,
  // which put its edge 0.7 cm off our centreline at the tail. The board's axis
  // is the line through the middle of every slice; if it leans, the picture
  // is turned straight and read again, and the straightened copy is what gets
  // drawn, so the traced edge and the picture always agree.
  const tilt = Math.atan(first.slope);
  if (Math.abs(tilt) > (0.1 * Math.PI) / 180) {
    const cos = Math.abs(Math.cos(tilt)), sin = Math.abs(Math.sin(tilt));
    const W2 = Math.ceil(w * cos + h * sin), H2 = Math.ceil(w * sin + h * cos);
    const c2 = document.createElement("canvas");
    c2.width = W2; c2.height = H2;
    const x2 = c2.getContext("2d", { willReadFrequently: true });
    if (x2) {
      if (!transparent) { x2.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`; x2.fillRect(0, 0, W2, H2); }
      x2.translate(W2 / 2, H2 / 2);
      // Vertical board: axis (slope, 1) turns upright by +tilt. Horizontal: (1, slope) by -tilt.
      x2.rotate(first.vertical ? tilt : -tilt);
      x2.drawImage(img, -w / 2, -h / 2, w, h);
      const px2 = x2.getImageData(0, 0, W2, H2).data;
      const again = trace(px2, W2, H2, transparent, bg);
      if (again) {
        const drawUrl = await new Promise<string | null>((resolve) => c2.toBlob((b) => resolve(b ? URL.createObjectURL(b) : null), "image/webp", 0.92));
        if (drawUrl) return { ...again, w: W2, h: H2, tiltDeg: (tilt * 180) / Math.PI, drawUrl };
      }
    }
  }
  // Scale back to the picture's own pixels so the SVG can draw the original unscaled.
  const k = 1 / scale;
  return {
    w: w * k, h: h * k, x0: first.x0 * k, x1: first.x1 * k, y0: first.y0 * k, y1: first.y1 * k,
    vertical: first.vertical, across: first.across.map((v) => v * k) as Float32Array,
    centre: first.centre * k, tiltDeg: (tilt * 180) / Math.PI, drawUrl: null,
  };
}

/** The board's silhouette in one canvas: its box, its width along the long
 *  side, where its middle runs, and how much that middle leans. */
function trace(px: Uint8ClampedArray, w: number, h: number, transparent: boolean, bg: number[]) {
  const mask = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < mask.length; i += 4, j++) {
    mask[j] = transparent
      ? (px[i + 3] > 110 ? 1 : 0)
      : (Math.hypot(px[i] - bg[0], px[i + 1] - bg[1], px[i + 2] - bg[2]) > 48 ? 1 : 0);
  }
  const rows = new Uint32Array(h), cols = new Uint32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { rows[y]++; cols[x]++; }
  const edge = (counts: Uint32Array, acrossN: number) => {
    const min = Math.max(3, acrossN * 0.02);
    let a = 0, b = counts.length - 1;
    while (a < counts.length && counts[a] < min) a++;
    while (b > a && counts[b] < min) b--;
    return [a, b];
  };
  const [y0, y1] = edge(rows, w), [x0, x1] = edge(cols, h);
  if (x1 - x0 < 20 || y1 - y0 < 20) return null;
  // A "board" filling the whole frame means the background was not found.
  if (x0 <= 1 && y0 <= 1 && x1 >= w - 2 && y1 >= h - 2) return null;

  const vertical = y1 - y0 >= x1 - x0;
  const len = vertical ? y1 - y0 + 1 : x1 - x0 + 1;
  const across = new Float32Array(len);
  const mids: { k: number; c: number }[] = [];
  for (let k = 0; k < len; k++) {
    let a = -1, b = -1;
    if (vertical) {
      const y = y0 + k;
      for (let x = x0; x <= x1; x++) if (mask[y * w + x]) { if (a < 0) a = x; b = x; }
    } else {
      const x = x0 + k;
      for (let y = y0; y <= y1; y++) if (mask[y * w + x]) { if (a < 0) a = y; b = y; }
    }
    across[k] = a < 0 ? 0 : b - a + 1;
    // The middle 80% of the length: the tips are rounded and say little.
    if (a >= 0 && k > len * 0.1 && k < len * 0.9) mids.push({ k, c: (a + b) / 2 });
  }
  let slope = 0, centre = vertical ? (x0 + x1) / 2 : (y0 + y1) / 2;
  if (mids.length > 10) {
    const mk = mids.reduce((s, m) => s + m.k, 0) / mids.length, mc = mids.reduce((s, m) => s + m.c, 0) / mids.length;
    const sxx = mids.reduce((s, m) => s + (m.k - mk) ** 2, 0);
    slope = sxx ? mids.reduce((s, m) => s + (m.k - mk) * (m.c - mc), 0) / sxx : 0;
    centre = mc;
  }
  return { x0, x1, y0, y1, vertical, across, centre, slope };
}

/**
 * Put the picture on the board: scale from a length, pick which end is the
 * tail, and measure the difference to our readings.
 *
 * @param measuredTop  full widths ("Width (top)"), cm, station from the origin
 * @param measuredBottom bottom widths, cm, station from the origin
 */
type FitOpts = {
  lengthCm: number | null; publishedLengthCm: number | null; origin: "tail" | "nose"; measuredTop: SeriesPoints; measuredBottom: SeriesPoints;
  /** The board's stated overall max width (Details, or the web search): it sets the scale across. */
  widthCm?: number | null;
};

export function fitPhoto(
  m: PhotoMask,
  opts: FitOpts,
  force?: { cmPerPx: number; shiftCm: number; tailFirst: boolean },
): PhotoFit | null {
  const longPx = m.vertical ? m.y1 - m.y0 : m.x1 - m.x0;
  const n = m.across.length;
  let lengthCm = opts.lengthCm ?? opts.publishedLengthCm ?? null;
  let scaleFrom: PhotoFit["scaleFrom"] = opts.lengthCm ? "length" : "published length";
  let cmPerPx: number;
  const shift = force?.shiftCm ?? 0;
  const widestPx = Math.max(...Array.from(m.across));
  if (force) {
    cmPerPx = force.cmPerPx;
    lengthCm = lengthCm ?? longPx * cmPerPx;
    scaleFrom = "our widths";
  } else if (!lengthCm && opts.widthCm && widestPx > 0) {
    // No length anywhere, but a stated max width: that sets the scale.
    cmPerPx = opts.widthCm / widestPx;
    lengthCm = longPx * cmPerPx;
    scaleFrom = "stated max width";
  } else if (lengthCm) {
    cmPerPx = lengthCm / longPx;
  } else if (opts.measuredTop.length) {
    // No length anywhere: the widest full width we measured sets the scale.
    const widestPx = Math.max(...Array.from(m.across));
    cmPerPx = Math.max(...opts.measuredTop.map((p) => p.value)) / widestPx;
    lengthCm = longPx * cmPerPx;
    scaleFrom = "top width";
  } else {
    return null;
  }

  // Across the board: the stated max width sets its own scale (not in a
  // matched fit, which is fitted to our own widths).
  const cmPerPxAcross = !force && opts.widthCm && widestPx > 0 ? opts.widthCm / widestPx : cmPerPx;
  const aspectOffPct = cmPerPxAcross !== cmPerPx ? (cmPerPxAcross / cmPerPx - 1) * 100 : null;

  // Width at a distance from ONE end of the picture's long side.
  const widthAt = (fromStart: number) => {
    const k = Math.round(fromStart / cmPerPx);
    return k >= 0 && k < n ? m.across[k] * cmPerPxAcross : null;
  };
  // Station on the plan → distance from the picture's start, both ways round.
  // The picture's own length (long side × scale) runs from its tail end, which
  // sits `shift` cm behind station 0.
  const photoLen = longPx * cmPerPx;
  const fromStart = (station: number, tailFirst: boolean) => {
    const fromTail = (opts.origin === "tail" ? station : (lengthCm as number) - station) + shift;
    return tailFirst ? fromTail : photoLen - fromTail;
  };

  const against = opts.measuredTop.length ? "top" : opts.measuredBottom.length ? "bottom" : null;
  // The last few cm at each end are where a picture's corners round off and a
  // tape reads the edge itself ("19 at 0, tail edge"): comparing there measures
  // the corner radius, not the outline, so both ends are left out.
  const END_CM = 3;
  const ref = (against === "top" ? opts.measuredTop : opts.measuredBottom)
    .filter((p) => { const t = opts.origin === "tail" ? p.station : (lengthCm as number) - p.station; return t >= END_CM && t <= (lengthCm as number) - END_CM; });
  const score = (tailFirst: boolean) => {
    const d = ref.map((p) => { const w = widthAt(fromStart(p.station, tailFirst)); return w == null ? null : Math.abs(w - p.value); })
      .filter((v): v is number => v != null);
    return d.length ? d.reduce((a, b) => a + b, 0) / d.length : Infinity;
  };
  // Product shots stand the board up nose first, so with nothing to compare
  // against, the tail is at the bottom (or the right).
  const tailFirst = force ? force.tailFirst : ref.length ? score(true) < score(false) : false;

  const widths: SeriesPoints = [];
  const L = lengthCm as number;
  for (let s = 0; s <= L; s += 1) {
    const w = widthAt(fromStart(s, tailFirst));
    if (w != null && w > 0) widths.push({ station: s, value: w });
  }

  let compare: PhotoFit["compare"] = null;
  if (against) {
    const diffs = ref.map((p) => {
      const w = interpolate(widths, p.station);
      return w == null || p.station < 0 || p.station > L ? null : { at: p.station, d: w - p.value };
    }).filter((v): v is { at: number; d: number } => v != null);
    if (diffs.length) {
      const worst = diffs.reduce((a, b) => (Math.abs(b.d) > Math.abs(a.d) ? b : a));
      compare = {
        against, n: diffs.length,
        mean: diffs.reduce((a, b) => a + b.d, 0) / diffs.length,
        maxAbs: worst.d, at: worst.at,
      };
    }
  }

  const k = cmPerPx;
  const kA = cmPerPxAcross;
  // The board's own middle, not its box's: a picture with a shadow or a lean
  // would otherwise sit off our centreline.
  const cx = m.vertical ? m.centre : (m.x0 + m.x1) / 2, cy = m.vertical ? (m.y0 + m.y1) / 2 : m.centre;
  // Picture px → plan px: turn and scale so the tail sits at station 0 on the
  // plan's own x axis (the plan's origin end is on the left).
  const matrix = (pad: number, min: number, p: number, centre: number) => {
    const kp = k * p;
    const tailLeft = opts.origin === "tail";
    // Where station s lands on screen: pad + (s - min) * p, with s from the origin.
    // From the picture: distance from the tail along the long side.
    if (m.vertical) {
      const tailAtTop = tailFirst;
      // fromTail = tailAtTop ? (y - y0)k : (y1 - y)k ; station = tailLeft ? fromTail : L - fromTail
      const sign = (tailAtTop ? 1 : -1) * (tailLeft ? 1 : -1);
      const base = (tailAtTop ? -m.y0 * k : m.y1 * k) - shift;   // the picture's tail end sits `shift` behind 0
      const stationConst = tailLeft ? base : L - base;
      const c = sign * kp;
      const e = pad + (stationConst - min) * p;
      // Keep it a rotation, never a mirror: the across axis turns with it.
      const b = -Math.sign(c) * kA * p;
      const f = centre - b * cx;
      return `matrix(0 ${b} ${c} 0 ${e} ${f})`;
    }
    const tailAtLeft = tailFirst;
    const sign = (tailAtLeft ? 1 : -1) * (tailLeft ? 1 : -1);
    const base = (tailAtLeft ? -m.x0 * k : m.x1 * k) - shift;
    const stationConst = tailLeft ? base : L - base;
    const a = sign * kp;
    const e = pad + (stationConst - min) * p;
    const d = Math.sign(a) * kA * p;
    const f = centre - d * cy;
    return `matrix(${a} 0 0 ${d} ${e} ${f})`;
  };

  return { cmPerPx, cmPerPxAcross, aspectOffPct, tailFirst, lengthCm: L, scaleFrom, shiftCm: shift, photoLengthCm: photoLen, widths, matrix, compare };
}

/**
 * "Match to our widths": instead of trusting the board's length alone, find the
 * scale, the offset along the board and which end is the tail that lay the
 * picture's outline best over what we measured. Against bottom widths the
 * picture is expected to be wider by the rail, so a constant rail allowance
 * (cm a side, never negative) is solved for too and reported, not fitted away.
 */
export function matchPhoto(m: PhotoMask, opts: FitOpts): PhotoFit | null {
  const against = opts.measuredTop.length >= 3 ? "top" : opts.measuredBottom.length >= 3 ? "bottom" : null;
  if (!against) return null;
  const pts = against === "top" ? opts.measuredTop : opts.measuredBottom;
  const longPx = m.vertical ? m.y1 - m.y0 : m.x1 - m.x0;
  const n = m.across.length;
  const byLength = opts.lengthCm ?? opts.publishedLengthCm ?? null;
  const start = byLength ? byLength / longPx : Math.max(...pts.map((p) => p.value)) / Math.max(...Array.from(m.across));
  const END_CM = 3;

  const cost = (k: number, shift: number, tailFirst: boolean) => {
    const L = byLength ?? longPx * k;
    const photoLen = longPx * k;
    const d: number[] = [];
    for (const p of pts) {
      const fromTail = opts.origin === "tail" ? p.station : L - p.station;
      if (fromTail < END_CM || fromTail > L - END_CM) continue;
      const pos = (tailFirst ? fromTail + shift : photoLen - (fromTail + shift)) / k;
      const i = Math.round(pos);
      if (i < 0 || i >= n || m.across[i] <= 0) continue;
      d.push(m.across[i] * k - p.value);
    }
    if (d.length < Math.min(5, pts.length)) return null;
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    const rail = against === "bottom" ? Math.max(0, mean) / 2 : 0;
    const rms = Math.sqrt(d.reduce((a, b) => a + (b - 2 * rail) ** 2, 0) / d.length);
    return { rms, rail, n: d.length };
  };

  let best: { k: number; shift: number; tailFirst: boolean; rms: number; rail: number; n: number } | null = null;
  const tryAt = (k: number, shift: number, tailFirst: boolean) => {
    const c = cost(k, shift, tailFirst);
    if (c && (!best || c.rms < best.rms)) best = { k, shift, tailFirst, ...c };
  };
  for (const tailFirst of [true, false]) {
    for (let f = 0.9; f <= 1.1001; f += 0.005) for (let sh = -8; sh <= 8.001; sh += 0.5) tryAt(start * f, sh, tailFirst);
  }
  if (!best) return null;
  const coarse = best as { k: number; shift: number; tailFirst: boolean };
  for (let f = -0.006; f <= 0.006001; f += 0.0005) for (let sh = -0.6; sh <= 0.6001; sh += 0.1) tryAt(coarse.k * (1 + f), coarse.shift + sh, coarse.tailFirst);
  const b = best as unknown as { k: number; shift: number; tailFirst: boolean; rms: number; rail: number; n: number };

  const fit = fitPhoto(m, opts, { cmPerPx: b.k, shiftCm: b.shift, tailFirst: b.tailFirst });
  if (!fit) return null;
  return { ...fit, match: { against, railCm: b.rail, rmsCm: b.rms, n: b.n, byLengthCm: byLength } };
}
