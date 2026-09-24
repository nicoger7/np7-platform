import "server-only";
import sharp from "sharp";
import type Anthropic from "@anthropic-ai/sdk";
import { PD_RESEARCH_MODEL, pdClaude } from "@/lib/pd-web";
import { openAiVisionJson, pdAiKey } from "@/lib/pd-ai";

/**
 * Cut the boards out of a product picture, and say which one is the deck.
 *
 * Nico, 24.09.2026, with FMX's Invictus Pro 138 picture: "it should be able to
 * cut out the deck from here, and identify what is the deck". Brand pictures
 * often show the deck and the bottom side by side, on a grey gradient, with a
 * shadow underneath, and the two boards touch where they are widest. Reading
 * "everything that is not background" then measures both boards as one.
 *
 * 1. Background: flooded in from the picture's edge, pixel to pixel, as long as
 *    each step is a small colour change and stays near the edge colour. That
 *    follows a gradient and passes soft shadows, and stops at a board's edge.
 *    A picture with a transparent background needs none of this.
 * 2. Shadows and specks go: only big, not-flat shapes can be boards.
 * 3. The boards are told apart by the rows where they stand apart (noses and
 *    tails). Each board's centreline is fitted through the middle of those
 *    rows. In the rows where two boards touch, only each board's OUTER side is
 *    its own, and a board is symmetric: its outline comes from that side,
 *    mirrored.
 * 4. A leak (a white logo at the rail lets the background in) only ever makes a
 *    board narrower. Where both sides are seen and disagree, the wider one is
 *    right. And an outline only widens from the tail to its widest point and
 *    narrows from there to the nose, so every dip is a leak: the outline is
 *    lifted to the smallest shape that never dips (a pointed nose and a square
 *    tail stay as they are). A median first takes out the odd spike.
 * 5. Standing side by side or lying one above the other: both are read, and
 *    the reading whose shapes look like boards (long and narrow) wins.
 *
 * Each board comes back as its own transparent cut-out at the picture's full
 * resolution, so the 2D plan reads a clean outline.
 */

export type CutBoard = {
  /** Transparent webp, the board only. */
  webp: Buffer;
  w: number; h: number;
  /** Where it sits in the picture (px, the picture as a browser shows it). */
  box: { x: number; y: number; w: number; h: number };
  /** 0 = leftmost (standing) or topmost (lying). */
  index: number;
  /** Length over widest, as cut. */
  aspect: number;
  /** How much of the cut-out was board in the picture (0–1). */
  coverage: number;
};

export type CutResult = {
  boards: CutBoard[];
  /** Standing = side by side, nose up or down. Lying = one above the other. */
  layout: "standing" | "lying";
  /** The picture came with a transparent background. */
  transparent: boolean;
  /** Why nothing usable came out, when nothing did. */
  reason?: string;
};

/** lopsided: of the rows where both sides were seen, the share where they
 *  disagree about the centreline. A real board is symmetric; a piece of one,
 *  or two glued together, is not. */
type Found = { y0: number; y1: number; centre: (y: number) => number; half: Float32Array; aspect: number; lopsided: number };

const WORK = 1200;   // px, the long side the boards are found at

export async function cutOutBoards(input: Buffer, opts: { k?: number } = {}): Promise<CutResult> {
  // Oriented like a browser shows it (EXIF), with an alpha channel either way.
  const { data: full, info } = await sharp(input, { failOn: "none" }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W0 = info.width, H0 = info.height;
  const fullRaw = { raw: { width: W0, height: H0, channels: 4 as const } };
  const scale = Math.min(1, WORK / Math.max(W0, H0));
  const w = Math.max(1, Math.round(W0 * scale)), h = Math.max(1, Math.round(H0 * scale));
  const data = scale < 1 ? await sharp(full, fullRaw).resize(w, h, { fit: "fill" }).raw().toBuffer() : full;

  let clear = 0;
  for (let i = 3; i < data.length; i += 16) if (data[i] < 16) clear++;
  const transparent = clear / (data.length / 16) > 0.03;

  let fg: Uint8Array;
  if (transparent) {
    fg = new Uint8Array(w * h);
    for (let j = 0; j < w * h; j++) fg[j] = data[j * 4 + 3] > 110 ? 1 : 0;
  } else {
    // Hairline cracks (JPEG noise inside a white stripe that happens to match
    // the background) would split a board in two: closed before reading.
    fg = closeMask(floodForeground(data, w, h), w, h, 2);
  }
  keepBoards(fg, w, h);

  // Read standing and lying. A reading counts only if EVERY board in it is
  // board-shaped (long, narrow, symmetric); with both, the one whose boards
  // are the narrower. (The median of two used to pick the larger one, so a
  // lying reading with one thin sliver beat two real standing boards: FMX 124.)
  const tfg = transpose(fg, w, h);
  const upright = findBoards(fg, w, h, opts.k), turned = findBoards(tfg, h, w, opts.k);
  const sound = (bs: Found[]) => bs.length > 0 && bs.every((b) => b.aspect >= 1.6 && b.aspect <= 9 && b.lopsided <= 0.3);
  const least = (bs: Found[]) => Math.min(...bs.map((b) => b.aspect));
  const lying = sound(turned) && (!sound(upright) || least(turned) > least(upright));
  const found = lying ? turned : upright;
  const M = lying ? tfg : fg, mw = lying ? h : w;
  const layout = lying ? "lying" : "standing";
  if (!found.length) return { boards: [], layout, transparent, reason: "No board shape found in the picture." };

  const boards: CutBoard[] = [];
  for (let k = 0; k < found.length; k++) {
    const b = found[k];
    const coverage = coverageOf(b, M, mw);
    if (b.aspect < 1.6 || b.aspect > 9) return { boards: [], layout, transparent, reason: `Board ${k + 1} does not have a board's shape (length ${b.aspect.toFixed(1)}× its width).` };
    if (coverage < 0.85) return { boards: [], layout, transparent, reason: `Board ${k + 1} could not be told apart from the background cleanly.` };
    if (b.lopsided > 0.3) return { boards: [], layout, transparent, reason: `Board ${k + 1} came out lopsided: the picture could not be cut apart cleanly.` };

    // The silhouette's extent, in the working frame (along = rows, across = columns).
    let a0 = Infinity, a1 = -Infinity;
    for (let y = b.y0; y <= b.y1; y++) {
      const c = b.centre(y), hw = b.half[y];
      a0 = Math.min(a0, c - hw); a1 = Math.max(a1, c + hw + 1);
    }
    // To the full picture: along/across → x/y.
    const L0 = Math.max(0, Math.floor(b.y0 / scale) - 2), L1 = Math.min((lying ? W0 : H0) - 1, Math.ceil((b.y1 + 1) / scale) + 2);
    const C0 = Math.max(0, Math.floor(a0 / scale) - 2), C1 = Math.min((lying ? H0 : W0) - 1, Math.ceil(a1 / scale) + 2);
    const box = lying
      ? { x: L0, y: C0, w: L1 - L0 + 1, h: C1 - C0 + 1 }
      : { x: C0, y: L0, w: C1 - C0 + 1, h: L1 - L0 + 1 };

    const out = Buffer.alloc(box.w * box.h * 4);
    for (let y = 0; y < box.h; y++) full.copy(out, y * box.w * 4, ((box.y + y) * W0 + box.x) * 4, ((box.y + y) * W0 + box.x + box.w) * 4);

    // Alpha at full resolution: the board's own alpha times how much of each
    // pixel the silhouette covers (a one-pixel soft edge).
    const halfAt = (m: number) => {
      const mm = Math.min(b.y1, Math.max(b.y0, m)), i = Math.floor(mm), f = mm - i;
      return b.half[i] * (1 - f) + b.half[Math.min(b.y1, i + 1)] * f;
    };
    const alongN = lying ? box.w : box.h, acrossN = lying ? box.h : box.w;
    const along0 = lying ? box.x : box.y, across0 = lying ? box.y : box.x;
    for (let ai = 0; ai < alongN; ai++) {
      const A = along0 + ai;
      const inside = (A + 0.5) * scale >= b.y0 && (A + 0.5) * scale < b.y1 + 1;
      const m = (A + 0.5) * scale - 0.5;
      const cf = (b.centre(m) + 0.5) / scale, hf = (halfAt(m) + 0.5) / scale;
      for (let ci = 0; ci < acrossN; ci++) {
        const px = lying ? (ci * box.w + ai) : (ai * box.w + ci);
        const cov = inside ? Math.min(1, Math.max(0, hf + 0.5 - Math.abs(across0 + ci + 0.5 - cf))) : 0;
        out[px * 4 + 3] = Math.round(out[px * 4 + 3] * cov);
      }
    }
    const webp = await sharp(out, { raw: { width: box.w, height: box.h, channels: 4 } }).webp({ quality: 90, alphaQuality: 100 }).toBuffer();
    boards.push({ webp, w: box.w, h: box.h, box, index: k, aspect: b.aspect, coverage });
  }
  return { boards, layout, transparent };
}

function medianOf(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1];
}

function floodForeground(data: Buffer, w: number, h: number): Uint8Array {
  const edge: number[][] = [];
  const col = (j: number) => [data[j * 4], data[j * 4 + 1], data[j * 4 + 2]];
  for (let x = 0; x < w; x++) edge.push(col(x), col((h - 1) * w + x));
  for (let y = 0; y < h; y++) edge.push(col(y * w), col(y * w + w - 1));
  const med = [0, 1, 2].map((i) => edge.map((c) => c[i]).sort((a, b) => a - b)[edge.length >> 1]);
  const d2 = (j: number, r: number, g: number, bl: number) => {
    const dr = data[j * 4] - r, dg = data[j * 4 + 1] - g, db = data[j * 4 + 2] - bl;
    return dr * dr + dg * dg + db * db;
  };
  const NEAR = 60 * 60, STEP = 10 * 10;
  // Nothing brighter than the background is background. Product shots sit on
  // light grey, and a board's white parts (FMX's nose stripes and white tail,
  // at 247-255 on a 242 background) are only a few steps lighter: without this
  // the background flowed into them and cut the deck in pieces (24.09.2026,
  // live: "it didnt do a good cut out of the deck"). On a pure white
  // background the cap is simply never reached.
  const lum = (j: number) => (data[j * 4] + data[j * 4 + 1] + data[j * 4 + 2]) / 3;
  const edgeLum = edge.map((c) => (c[0] + c[1] + c[2]) / 3).sort((a, b) => a - b);
  const CAP = edgeLum[Math.floor(edgeLum.length * 0.98)] + 4;
  const seen = new Uint8Array(w * h), q = new Int32Array(w * h);
  let qh = 0, qt = 0;
  const seed = (j: number) => { if (!seen[j] && lum(j) <= CAP && d2(j, med[0], med[1], med[2]) < NEAR) { seen[j] = 1; q[qt++] = j; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (qh < qt) {
    const j = q[qh++], x = j % w, y = (j / w) | 0;
    const r = data[j * 4], g = data[j * 4 + 1], bl = data[j * 4 + 2];
    const step = (n: number) => {
      if (seen[n]) return;
      if (lum(n) <= CAP && d2(n, r, g, bl) < STEP && d2(n, med[0], med[1], med[2]) < NEAR) { seen[n] = 1; q[qt++] = n; }
    };
    if (x + 1 < w) step(j + 1);
    if (x > 0) step(j - 1);
    if (y + 1 < h) step(j + w);
    if (y > 0) step(j - w);
  }
  const fg = new Uint8Array(w * h);
  for (let j = 0; j < w * h; j++) fg[j] = seen[j] ? 0 : 1;
  return fg;
}

/** Morphological closing with a (2r+1)² square: gaps up to 2r px wide fill in,
 *  outlines stay where they are. Separable running max, then running min. */
function closeMask(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const pass = (src: Uint8Array, horizontal: boolean, grow: boolean): Uint8Array => {
    const out = new Uint8Array(w * h);
    const n = horizontal ? w : h, lines = horizontal ? h : w;
    for (let l = 0; l < lines; l++) {
      for (let i = 0; i < n; i++) {
        let v = grow ? 0 : 1;
        for (let d = -r; d <= r; d++) {
          const k = i + d;
          const s = k < 0 || k >= n ? 0 : src[horizontal ? l * w + k : k * w + l];
          if (grow ? s : !s) { v = grow ? 1 : 0; break; }
        }
        out[horizontal ? l * w + i : i * w + l] = v;
      }
    }
    return out;
  };
  return pass(pass(pass(pass(m, true, true), false, true), true, false), false, false);
}

/** Keep only big, not-flat shapes: boards, not shadows or specks. */
function keepBoards(fg: Uint8Array, w: number, h: number) {
  const lab = new Uint8Array(w * h), q = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!fg[i] || lab[i]) continue;
    let qh = 0, qt = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    q[qt++] = i; lab[i] = 1;
    while (qh < qt) {
      const j = q[qh++], x = j % w, y = (j / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x + 1 < w && fg[j + 1] && !lab[j + 1]) { lab[j + 1] = 1; q[qt++] = j + 1; }
      if (x > 0 && fg[j - 1] && !lab[j - 1]) { lab[j - 1] = 1; q[qt++] = j - 1; }
      if (y + 1 < h && fg[j + w] && !lab[j + w]) { lab[j + w] = 1; q[qt++] = j + w; }
      if (y > 0 && fg[j - w] && !lab[j - w]) { lab[j - w] = 1; q[qt++] = j - w; }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const keep = qt > 0.01 * w * h && Math.max(bw, bh) > 0.25 * Math.max(w, h) && Math.min(bw, bh) > 0.06 * Math.min(w, h);
    if (!keep) for (let n = 0; n < qt; n++) fg[q[n]] = 0;
  }
}

function transpose(a: Uint8Array, w: number, h: number): Uint8Array {
  const t = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t[x * h + y] = a[y * w + x];
  return t;
}

/**
 * A straight line through (y, x) points, refitted without the outliers until
 * it settles: rows where a leak bites one side put their middle off by half
 * the bite, and one refit is not always enough to shake a long run of them.
 */
function fitLine(pts: [number, number][]): ((y: number) => number) | null {
  if (pts.length < 10) return null;
  const fit = (p: [number, number][]) => {
    const my = p.reduce((s, q) => s + q[0], 0) / p.length, mx = p.reduce((s, q) => s + q[1], 0) / p.length;
    const syy = p.reduce((s, q) => s + (q[0] - my) ** 2, 0);
    const k = syy ? p.reduce((s, q) => s + (q[0] - my) * (q[1] - mx), 0) / syy : 0;
    return (y: number) => mx + k * (y - my);
  };
  let line = fit(pts), used = pts.length;
  for (let round = 0; round < 8; round++) {
    const res = pts.map((p) => Math.abs(p[1] - line(p[0])));
    const lim = Math.max(1.5, 2.5 * medianOf(res));
    const kept = pts.filter((_, i) => res[i] <= lim);
    if (kept.length < 10 || kept.length === used) break;
    line = fit(kept); used = kept.length;
  }
  return line;
}

/** Boards standing side by side: each one's outline from its own sides. */
function findBoards(fg: Uint8Array, w: number, h: number, forceK?: number): Found[] {
  const rows: [number, number][][] = [];
  for (let y = 0; y < h; y++) {
    const runs: [number, number][] = [];
    let a = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && fg[y * w + x] > 0;
      if (on && a < 0) a = x;
      if (!on && a >= 0) { if (x - a >= 2) runs.push([a, x - 1]); a = -1; }
    }
    rows.push(runs);
  }
  const withRuns = rows.filter((r) => r.length).length;
  if (!withRuns) return [];
  const counts = new Map<number, number>();
  rows.forEach((r) => { if (r.length) counts.set(r.length, (counts.get(r.length) ?? 0) + 1); });
  let K = 1;
  for (const [k, n] of counts) if (k > K && k <= 4 && n > withRuns * 0.12) K = k;
  // Told how many boards there are (the AI counted them): trust that, as long
  // as enough rows show them standing apart to find each one's centreline.
  if (forceK && forceK >= 1 && forceK <= 4) K = forceK;

  // Pass 1: centrelines from the rows where every board stands apart.
  const mids: [number, number][][] = Array.from({ length: K }, () => []);
  rows.forEach((r, y) => { if (r.length === K) r.forEach((run, k) => mids[k].push([y, (run[0] + run[1]) / 2])); });
  const lines = mids.map(fitLine);
  if (lines.some((l) => !l)) return [];
  const centre = lines as ((y: number) => number)[];

  // Pass 2: every run belongs to the boards whose centreline it holds. Its
  // left end is the leftmost of them's own side, its right end the rightmost's;
  // sides where two boards touch are nobody's.
  const L = Array.from({ length: K }, () => new Float32Array(h).fill(NaN));
  const R = Array.from({ length: K }, () => new Float32Array(h).fill(NaN));
  rows.forEach((r, y) => {
    for (const [a, b] of r) {
      let k0 = -1, k1 = -1;
      for (let k = 0; k < K; k++) {
        const c = centre[k](y);
        if (c >= a && c <= b) { if (k0 < 0) k0 = k; k1 = k; }
      }
      if (k0 < 0) continue;                         // a piece off to the side: not a board's middle
      L[k0][y] = a; R[k1][y] = b;
    }
  });

  const out: Found[] = [];
  for (let k = 0; k < K; k++) {
    let both = 0, off = 0;
    let y0 = -1, y1 = -1;
    for (let y = 0; y < h; y++) if (!Number.isNaN(L[k][y]) || !Number.isNaN(R[k][y])) { if (y0 < 0) y0 = y; y1 = y; }
    if (y0 < 0 || y1 - y0 < 20) continue;
    const raw = new Float32Array(h).fill(NaN);
    for (let y = y0; y <= y1; y++) {
      const c = centre[k](y);
      const l = Number.isNaN(L[k][y]) ? null : c - L[k][y];
      const r = Number.isNaN(R[k][y]) ? null : R[k][y] - c;
      // Both sides seen: the middle of them, unless one is bitten into.
      if (l != null && r != null) { both++; if (Math.abs(l - r) > Math.max(3, 0.08 * (l + r) / 2)) off++; }
      const v = l != null && r != null ? (Math.abs(l - r) <= 3 ? (l + r) / 2 : Math.max(l, r)) : (l ?? r);
      if (v != null) raw[y] = Math.max(0, v);
    }
    // Rows with nothing to say: straight across from the neighbours.
    let last = -1;
    for (let y = y0; y <= y1; y++) {
      if (Number.isNaN(raw[y])) continue;
      if (last >= 0 && y - last > 1) for (let g = last + 1; g < y; g++) raw[g] = raw[last] + ((raw[y] - raw[last]) * (g - last)) / (y - last);
      last = y;
    }
    const RAD = Math.max(4, Math.round((y1 - y0) * 0.015));
    const half = smooth(raw, y0, y1, RAD);
    let widest = 0;
    for (let y = y0; y <= y1; y++) widest = Math.max(widest, half[y]);
    if (widest < 2) continue;
    out.push({ y0, y1, centre: centre[k], half, aspect: (y1 - y0 + 1) / (2 * widest + 1), lopsided: both >= 20 ? off / both : 0 });
  }
  return out;
}

/**
 * A running median over ±r rows (nothing beyond the nose and tail), then no
 * dips. An outline only widens up to its widest point and narrows after it, so
 * a dip is a leak, however long: it is bridged by a curve that carries on the
 * outline's own slope from both sides, and never drops below the smallest
 * no-dip shape (which alone would fill it flat). A pointed nose or a square
 * tail is left exactly as it was.
 */
function smooth(raw: Float32Array, y0: number, y1: number, r: number): Float32Array {
  const n = raw.length;
  const get = (y: number) => (y < y0 || y > y1 ? 0 : raw[y]);
  const med = new Float32Array(n), up = new Float32Array(n), env = new Float32Array(n);
  const win: number[] = new Array(2 * r + 1);
  for (let y = y0; y <= y1; y++) {
    for (let d = -r; d <= r; d++) win[d + r] = get(y + d);
    win.sort((a, b) => a - b);
    med[y] = win[r];
  }
  let m = 0, peak = 0;
  for (let y = y0; y <= y1; y++) { m = Math.max(m, med[y]); up[y] = m; }
  peak = m; m = 0;
  for (let y = y1; y >= y0; y--) { m = Math.max(m, med[y]); env[y] = Math.min(up[y], m); }

  const out = Float32Array.from(env);
  for (let y = y0; y <= y1;) {
    if (med[y] >= env[y] - 0.5) { y++; continue; }
    const a = y;
    while (y <= y1 && med[y] < env[y] - 0.5) y++;
    const p = a - 1, q = y;                          // the last good rows either side
    if (p < y0 || q > y1) continue;                  // runs off an end: the flat fill stands
    const len = q - p, chord = (med[q] - med[p]) / len;
    const s0 = Math.min(8, p - y0), s1 = Math.min(8, y1 - q);
    const d0 = s0 >= 2 ? (med[p] - med[p - s0]) / s0 : chord;
    const d1 = s1 >= 2 ? (med[q + s1] - med[q]) / s1 : chord;
    for (let k = a; k < q; k++) {
      const t = (k - p) / len, t2 = t * t, t3 = t2 * t;
      const v = (2 * t3 - 3 * t2 + 1) * med[p] + (t3 - 2 * t2 + t) * len * d0 + (3 * t2 - 2 * t3) * med[q] + (t3 - t2) * len * d1;
      out[k] = Math.max(env[k], Math.min(v, peak * 1.1));
    }
  }
  return out;
}

/** How much of the silhouette is board in the mask. */
function coverageOf(b: Found, fg: Uint8Array, w: number): number {
  let all = 0, hit = 0;
  for (let y = b.y0; y <= b.y1; y++) {
    const c = b.centre(y), hw = b.half[y];
    for (let x = Math.max(0, Math.ceil(c - hw)); x <= Math.min(w - 1, Math.floor(c + hw)); x++) {
      all++;
      if (fg[y * w + x]) hit++;
    }
  }
  return all ? hit / all : 0;
}

// ─── Which one is the deck ───────────────────────────────────────────────────

export type BoardView = {
  view: "deck" | "bottom" | "unclear";
  /** Is it the board being worked on (and not another size or model)? */
  this_board: "yes" | "no" | "unclear";
  why: string;
};

const VIEWS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["boards_in_picture", "boards"],
  properties: {
    boards_in_picture: { type: "integer", description: "How many boards the picture shows, whole or partly." },
    boards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["view", "this_board", "why"],
        properties: {
          view: { type: "string", enum: ["deck", "bottom", "unclear"] },
          this_board: { type: "string", enum: ["yes", "no", "unclear"] },
          why: { type: "string", description: "One short line: what gave it away, e.g. \"deck pad and footstrap inserts\"." },
        },
      },
    },
  },
};

/**
 * Ask the AI which face each board shows. Without a key, or when the AI does
 * not answer: two boards are taken as deck then bottom (how brands lay them
 * out), marked as a guess, with the reason.
 */
export async function identifyBoards(picture: Buffer, count: number, layout: "standing" | "lying", boardName: string): Promise<{ views: BoardView[]; by: "ai" | "guess"; model?: string; why?: "no-key" | "failed"; seen?: number }> {
  const guess = (): BoardView[] => Array.from({ length: count }, (_, i) => ({
    view: count === 2 ? (i === 0 ? "deck" : "bottom") : i === 0 ? "deck" : "unclear",
    this_board: "unclear",
    why: "guessed from the order",
  }));
  const ai = pdAiKey();
  if (!ai) return { views: guess(), by: "guess", why: "no-key" };

  const jpg = await sharp(picture, { failOn: "none" }).rotate()
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
  const order = layout === "standing" ? "from left to right" : "from top to bottom";
  const instructions = `You look at product pictures of windsurf and windfoil boards for a board designer.
The picture shows ${count} boards ${layout === "standing" ? "side by side" : "one above the other"}. For each board, in order ${order}, say which face it shows:
- deck: the top the rider stands on. Deck pad (often textured or a different colour), footstrap inserts or straps, the mast track or mast base.
- bottom: the underside. Fin box or foil boxes near the tail, no pad, usually one smooth finish, sometimes vents or channels.
Brands often show the same board twice, deck and bottom, next to each other.
Also say whether each board is the one named below. Printed sizes or model names can tell; if nothing tells them apart, answer unclear.
Also count the boards you see in the picture (boards_in_picture); the cut-out found ${count}, and your count is used to check it.
Give exactly ${count} entries, ${order}.`;
  const text = `The board: ${boardName}.`;
  try {
    let views: BoardView[] | null = null, model: string | undefined, seen: number | undefined;
    if (ai.provider === "openai") {
      const r = await openAiVisionJson<{ boards: BoardView[]; boards_in_picture: number }>({
        key: ai.key, instructions, text, image: `data:image/jpeg;base64,${jpg.toString("base64")}`, name: "board_faces", schema: VIEWS_SCHEMA,
      });
      views = r.data?.boards ?? null; model = r.model; seen = r.data?.boards_in_picture;
    } else {
      const client = pdClaude();
      if (client) {
        const msg = await client.messages.create({
          model: PD_RESEARCH_MODEL,
          max_tokens: 2000,
          system: instructions,
          tools: [{ name: "record_faces", description: "Record which face each board shows.", input_schema: VIEWS_SCHEMA as Anthropic.Tool.InputSchema, strict: true } as Anthropic.Tool],
          tool_choice: { type: "tool", name: "record_faces" },
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpg.toString("base64") } },
            { type: "text", text },
          ] }],
        });
        const call = msg.content.find((c) => c.type === "tool_use");
        if (call && call.type === "tool_use") {
          const got = call.input as { boards?: BoardView[]; boards_in_picture?: number };
          views = got.boards ?? null; seen = got.boards_in_picture;
        }
        model = msg.model;
      }
    }
    if (views && views.length === count) return { views, by: "ai", model, seen };
    // It counted differently: say so, so the picture can be cut again with its count.
    if (typeof seen === "number" && seen !== count) return { views: guess(), by: "guess", why: "failed", model, seen };
  } catch {
    // The picture still gets cut out; the faces are then a guess.
  }
  return { views: guess(), by: "guess", why: "failed" };
}
