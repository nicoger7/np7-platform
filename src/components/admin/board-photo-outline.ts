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
  w: number; h: number;                // picture size in px
  x0: number; x1: number; y0: number; y1: number; // the board's bounding box
  vertical: boolean;                   // long side runs top to bottom
  across: Float32Array;                // board width in px at each px along the long side (from x0 or y0)
};

export type PhotoFit = {
  cmPerPx: number;
  tailFirst: boolean;                  // the tail is at the top (vertical) or left (horizontal) of the picture
  lengthCm: number;
  scaleFrom: "length" | "published length" | "top width";
  /** Full width in cm at each cm from the tail, drawn as the photo outline. */
  widths: SeriesPoints;
  /** SVG matrix placing the picture on the plan, given the plan's own scale. */
  matrix: (pad: number, min: number, pxPerCm: number, centre: number) => string;
  compare: { against: "top" | "bottom"; mean: number; maxAbs: number; at: number; n: number } | null;
};

/** Read the board's silhouette out of a picture. Null if no board edge is found. */
export async function readPhotoMask(url: string): Promise<PhotoMask | null> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("The picture did not load."));
    i.src = url;
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
  const mask = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < mask.length; i += 4, j++) {
    mask[j] = transparent
      ? (px[i + 3] > 110 ? 1 : 0)
      : (Math.hypot(px[i] - bg[0], px[i + 1] - bg[1], px[i + 2] - bg[2]) > 48 ? 1 : 0);
  }

  const rows = new Uint32Array(h), cols = new Uint32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { rows[y]++; cols[x]++; }
  const edge = (counts: Uint32Array, across: number) => {
    const min = Math.max(3, across * 0.02);
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
  for (let k = 0; k < len; k++) {
    let first = -1, last = -1;
    if (vertical) {
      const y = y0 + k;
      for (let x = x0; x <= x1; x++) if (mask[y * w + x]) { if (first < 0) first = x; last = x; }
    } else {
      const x = x0 + k;
      for (let y = y0; y <= y1; y++) if (mask[y * w + x]) { if (first < 0) first = y; last = y; }
    }
    across[k] = first < 0 ? 0 : last - first + 1;
  }
  // Scale back to the picture's own pixels so the SVG can use it unscaled.
  const s = 1 / scale;
  const out = new Float32Array(len);
  for (let k = 0; k < len; k++) out[k] = across[k];
  return { w: w * s, h: h * s, x0: x0 * s, x1: x1 * s, y0: y0 * s, y1: y1 * s, vertical, across: out.map((v) => v * s) as Float32Array };
}

/**
 * Put the picture on the board: scale from a length, pick which end is the
 * tail, and measure the difference to our readings.
 *
 * @param measuredTop  full widths ("Width (top)"), cm, station from the origin
 * @param measuredBottom bottom widths, cm, station from the origin
 */
export function fitPhoto(
  m: PhotoMask,
  opts: { lengthCm: number | null; publishedLengthCm: number | null; origin: "tail" | "nose"; measuredTop: SeriesPoints; measuredBottom: SeriesPoints },
): PhotoFit | null {
  const longPx = m.vertical ? m.y1 - m.y0 : m.x1 - m.x0;
  const n = m.across.length;
  let lengthCm = opts.lengthCm ?? opts.publishedLengthCm ?? null;
  let scaleFrom: PhotoFit["scaleFrom"] = opts.lengthCm ? "length" : "published length";
  let cmPerPx: number;
  if (lengthCm) {
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

  // Width at a distance from ONE end of the picture's long side.
  const widthAt = (fromStart: number) => {
    const k = Math.round(fromStart / cmPerPx);
    return k >= 0 && k < n ? m.across[k] * cmPerPx : null;
  };
  // Station on the plan → distance from the picture's start, both ways round.
  const fromStart = (station: number, tailFirst: boolean) => {
    const fromTail = opts.origin === "tail" ? station : (lengthCm as number) - station;
    return tailFirst ? fromTail : (lengthCm as number) - fromTail;
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
  const tailFirst = ref.length ? score(true) < score(false) : false;

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
  const cx = (m.x0 + m.x1) / 2, cy = (m.y0 + m.y1) / 2;
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
      const base = tailAtTop ? -m.y0 * k : m.y1 * k;       // fromTail = sign0*y*k + base
      const stationConst = tailLeft ? base : L - base;
      const c = sign * kp;
      const e = pad + (stationConst - min) * p;
      // Keep it a rotation, never a mirror: the across axis turns with it.
      const b = -Math.sign(c) * kp;
      const f = centre - b * cx;
      return `matrix(0 ${b} ${c} 0 ${e} ${f})`;
    }
    const tailAtLeft = tailFirst;
    const sign = (tailAtLeft ? 1 : -1) * (tailLeft ? 1 : -1);
    const base = tailAtLeft ? -m.x0 * k : m.x1 * k;
    const stationConst = tailLeft ? base : L - base;
    const a = sign * kp;
    const e = pad + (stationConst - min) * p;
    const d = Math.sign(a) * kp;
    const f = centre - d * cy;
    return `matrix(${a} 0 0 ${d} ${e} ${f})`;
  };

  return { cmPerPx, tailFirst, lengthCm: L, scaleFrom, widths, matrix, compare };
}
