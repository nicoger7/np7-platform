/**
 * Promo Studio — pure Canvas2D renderer.
 *
 * ONE draw function serves the live preview AND the PNG export, so what you
 * see is pixel-identical to what you download. It also returns every
 * element's bounding box (in canvas coordinates) — the editor's selection /
 * hit-testing layer is driven by those, never by a parallel layout.
 *
 * The layer recipe is the BrandedTile scaled to poster size (see
 * branded-tile.tsx): photo → sun-to-sea washes → flag drape (masked, screen
 * blend) → logo → texts → coach cutout with double shadow.
 */

import type { Box, PromoFormat, PromoState, TextLayer } from "./promo-template";
import { PROMO_FORMATS, promoOrder } from "./promo-template";

export interface PromoFonts {
  /** Canvas font-family lists, e.g. `"__Anton_x", "__Anton_Fallback_x"`. */
  anton: string;
  poppins: string;
}

export type HitBox = { id: string; box: Box };

// -- image cache --------------------------------------------------------------

const imageCache = new Map<string, HTMLImageElement>();
const imagePromises = new Map<string, Promise<HTMLImageElement>>();

/** Load (and cache) an image with CORS enabled so export canvases stay clean. */
export function loadPromoImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return Promise.resolve(cached);
  const pending = imagePromises.get(src);
  if (pending) return pending;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageCache.set(src, img);
      imagePromises.delete(src);
      resolve(img);
    };
    img.onerror = () => {
      imagePromises.delete(src);
      reject(new Error(`image failed: ${src}`));
    };
    img.src = src;
  });
  imagePromises.set(src, p);
  return p;
}

export function getCachedImage(src: string | null): HTMLImageElement | null {
  return src ? imageCache.get(src) ?? null : null;
}

/** Every image URL a state references — preload before drawing. */
export function promoImageSources(state: PromoState): string[] {
  return [state.photo.src, state.flag.src, state.coach.src, state.logo.src].filter(
    (s): s is string => !!s
  );
}

// -- gradient helper ----------------------------------------------------------

type Stop = [number, string];

/** CSS-style linear-gradient over a w×h rect: 0deg = to top, 90deg = to right. */
function cssGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  deg: number,
  stops: Stop[]
): CanvasGradient {
  const rad = (deg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const g = ctx.createLinearGradient(
    cx - (dx * len) / 2,
    cy - (dy * len) / 2,
    cx + (dx * len) / 2,
    cy + (dy * len) / 2
  );
  for (const [at, color] of stops) g.addColorStop(Math.min(1, Math.max(0, at)), color);
  return g;
}

// -- rich text ----------------------------------------------------------------

/** Split "*gold* rest" into styled segments. */
function segments(text: string): { text: string; accent: boolean }[] {
  const out: { text: string; accent: boolean }[] = [];
  let accent = false;
  for (const part of text.split("*")) {
    if (part) out.push({ text: part, accent });
    accent = !accent;
  }
  return out;
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = `${px}px`;
}

// -- main draw ----------------------------------------------------------------

/**
 * Draw the full design. Missing images are skipped silently (they pop in on
 * the next draw once loaded). Returns the hit boxes in z-order, bottom-first.
 */
export function drawPromo(
  ctx: CanvasRenderingContext2D,
  state: PromoState,
  fonts: PromoFonts,
  opts?: { skipTextId?: string | null }
): HitBox[] {
  const fmt: PromoFormat = state.format;
  const { w: W, h: H } = PROMO_FORMATS[fmt];
  const hits: HitBox[] = [];

  ctx.save();
  ctx.textBaseline = "alphabetic";
  setSpacing(ctx, 0);

  // 0 — ground
  ctx.fillStyle = "#00202c";
  ctx.fillRect(0, 0, W, H);
  hits.push({ id: "photo", box: { x: 0, y: 0, w: W, h: H } });

  // 1 — photo (cover + focal + zoom)
  const photo = getCachedImage(state.photo.src);
  if (photo) {
    const f = state.photo.focal[fmt];
    const scale = Math.max(W / photo.naturalWidth, H / photo.naturalHeight) * (f.zoom / 100);
    const dw = photo.naturalWidth * scale;
    const dh = photo.naturalHeight * scale;
    const dx = (W - dw) * (f.x / 100);
    const dy = (H - dh) * (f.y / 100);
    ctx.drawImage(photo, dx, dy, dw, dh);
  }

  // 2 — sun-to-sea washes (exact BrandedTile gradients)
  if (state.washes.softlight) {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = cssGradient(ctx, 0, 0, W, H, 115, [
      [0, "rgba(255,164,38,0.5)"],
      [0.38, "rgba(244,123,32,0.3)"],
      [0.62, "rgba(0,55,74,0.12)"],
      [1, "rgba(0,175,219,0.3)"],
    ]);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  if (state.washes.veil) {
    ctx.fillStyle = cssGradient(ctx, 0, 0, W, H, 150, [
      [0, "rgba(255,196,46,0.22)"],
      [0.44, "rgba(255,196,46,0.05)"],
      [0.68, "rgba(0,175,219,0.09)"],
      [1, "rgba(0,175,219,0.25)"],
    ]);
    ctx.fillRect(0, 0, W, H);
  }
  if (state.washes.darkenLeft) {
    ctx.fillStyle = cssGradient(ctx, 0, 0, W, H, 90, [
      [0, "rgba(0,32,44,0.55)"],
      [0.3, "rgba(0,32,44,0.22)"],
      [0.52, "rgba(0,32,44,0)"],
    ]);
    ctx.fillRect(0, 0, W, H);
  }
  if (state.washes.darkenBottom) {
    ctx.fillStyle = cssGradient(ctx, 0, 0, W, H, 0, [
      [0, "rgba(0,24,34,0.62)"],
      [0.26, "rgba(0,24,34,0.28)"],
      [0.46, "rgba(0,24,34,0)"],
    ]);
    ctx.fillRect(0, 0, W, H);
  }

  // 3+ — the movable layers, in the design's own z-order (bottom→top)
  for (const layerId of promoOrder(state)) {
    if (layerId === "flag") drawFlagLayer(ctx, state, fmt, hits);
    else if (layerId === "logo") drawLogoLayer(ctx, state, fmt, hits);
    else if (layerId === "coach") drawCoachLayer(ctx, state, fmt, hits);
    else {
      const t = state.texts.find((x) => x.id === layerId);
      if (t?.visible) hits.push({ id: t.id, box: drawText(ctx, t, fmt, fonts, opts?.skipTextId === t.id) });
    }
  }

  ctx.restore();
  return hits;
}

function drawFlagLayer(ctx: CanvasRenderingContext2D, state: PromoState, fmt: PromoFormat, hits: HitBox[]) {
  const flagImg = state.flag.visible ? getCachedImage(state.flag.src) : null;
  if (state.flag.visible && state.flag.src) {
    const b = state.flag.box[fmt];
    if (flagImg && b.w > 4 && b.h > 4) {
      const off = document.createElement("canvas");
      off.width = Math.round(b.w);
      off.height = Math.round(b.h);
      const octx = off.getContext("2d")!;
      const s = Math.max(b.w / flagImg.naturalWidth, b.h / flagImg.naturalHeight);
      octx.drawImage(flagImg, 0, 0, flagImg.naturalWidth * s, flagImg.naturalHeight * s);
      // sideways fade (hides the drape's own edge toward the canvas centre)
      const f0 = state.flag.fadeSide / 100;
      octx.globalCompositeOperation = "destination-in";
      octx.fillStyle = cssGradient(octx, 0, 0, b.w, b.h, 104, [
        [f0, "rgba(0,0,0,0)"],
        [Math.min(1, f0 + 0.28), "rgba(0,0,0,0.85)"],
        [Math.min(1, f0 + 0.52), "rgba(0,0,0,1)"],
      ]);
      octx.fillRect(0, 0, b.w, b.h);
      // downward fade (gone before the coach)
      const v0 = state.flag.fadeDown[fmt] / 100;
      octx.fillStyle = cssGradient(octx, 0, 0, b.w, b.h, 180, [
        [v0, "rgba(0,0,0,1)"],
        [Math.min(1, v0 + 0.31), "rgba(0,0,0,0)"],
      ]);
      octx.fillRect(0, 0, b.w, b.h);

      ctx.save();
      ctx.globalAlpha = state.flag.opacity;
      ctx.globalCompositeOperation = state.flag.blend === "screen" ? "screen" : "source-over";
      ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
      ctx.rotate((state.flag.rotate * Math.PI) / 180);
      ctx.drawImage(off, -b.w / 2, -b.h / 2);
      ctx.restore();
    }
    hits.push({ id: "flag", box: { ...b } });
  }
}

function drawLogoLayer(ctx: CanvasRenderingContext2D, state: PromoState, fmt: PromoFormat, hits: HitBox[]) {
  const logoImg = state.logo.visible ? getCachedImage(state.logo.src) : null;
  if (state.logo.visible && state.logo.src) {
    const b = state.logo.box[fmt];
    if (logoImg) {
      ctx.save();
      ctx.shadowColor = "rgba(0,24,34,0.5)";
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 4;
      ctx.drawImage(logoImg, b.x, b.y, b.w, b.h);
      ctx.restore();
    }
    hits.push({ id: "logo", box: { ...b } });
  }
}

// coach cutout with double drop-shadow (drawn via the offset trick so the
// figure itself is painted exactly once)
function drawCoachLayer(ctx: CanvasRenderingContext2D, state: PromoState, fmt: PromoFormat, hits: HitBox[]) {
  const coachImg = state.coach.visible ? getCachedImage(state.coach.src) : null;
  if (state.coach.visible && state.coach.src) {
    const b = state.coach.box[fmt];
    if (coachImg) {
      const OFF = 10000;
      ctx.save();
      if (state.coach.shadow) {
        ctx.shadowColor = "rgba(0,10,16,0.5)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = -16 + OFF;
        ctx.shadowOffsetY = 12;
        ctx.drawImage(coachImg, b.x - OFF, b.y, b.w, b.h);
        ctx.shadowBlur = 44;
        ctx.shadowOffsetX = -30 + OFF;
        ctx.shadowOffsetY = 24;
        ctx.drawImage(coachImg, b.x - OFF, b.y, b.w, b.h);
        ctx.shadowColor = "transparent";
      }
      ctx.drawImage(coachImg, b.x, b.y, b.w, b.h);
      ctx.restore();
    }
    hits.push({ id: "coach", box: { ...b } });
  }
}

// -- text kinds ---------------------------------------------------------------

const GOLD = "#ffd257";

function drawText(
  ctx: CanvasRenderingContext2D,
  t: TextLayer,
  fmt: PromoFormat,
  fonts: PromoFonts,
  measureOnly: boolean
): Box {
  const pos = t.pos[fmt];
  const lines = t.text.split("\n");
  ctx.save();
  let box: Box;
  switch (t.kind) {
    case "place":
      box = drawPlace(ctx, lines, pos, t.size, fonts, measureOnly);
      break;
    case "eyebrow":
      box = drawEyebrow(ctx, t.text, pos, t.size, fonts, measureOnly);
      break;
    case "subtitle":
      box = drawSubtitle(ctx, lines, pos, t.size, fonts, measureOnly);
      break;
    case "chip-gold":
    case "chip-glass":
      box = drawChip(ctx, t.text, pos, t.size, fonts, t.kind === "chip-gold", measureOnly);
      break;
    case "details":
      box = drawRich(ctx, t.text, pos, t.size, fonts, "details", measureOnly);
      break;
    case "partner":
      box = drawRich(ctx, t.text, pos, t.size, fonts, "partner", measureOnly);
      break;
    case "with":
      box = drawWith(ctx, t.text, pos, t.size, fonts, measureOnly);
      break;
  }
  ctx.restore();
  return box;
}

function drawPlace(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  pos: { x: number; y: number },
  size: number,
  fonts: PromoFonts,
  measureOnly: boolean
): Box {
  const lineH = size * 0.84;
  ctx.font = `400 ${size}px ${fonts.anton}`;
  setSpacing(ctx, size * 0.005);
  const upper = lines.map((l) => l.toUpperCase());
  const w = Math.max(1, ...upper.map((l) => ctx.measureText(l).width));
  const h = lineH * (lines.length - 1) + size;
  const box = { x: pos.x, y: pos.y, w, h };
  if (measureOnly) return box;

  const grad = cssGradient(ctx, pos.x, pos.y, w, h, 180, [
    [0, "#fff2c2"],
    [0.42, "#ffd257"],
    [0.66, "#f4a11f"],
    [1, "#d97a12"],
  ]);
  const drawPass = (style: string | CanvasGradient) => {
    ctx.fillStyle = style;
    upper.forEach((line, i) => {
      // Anton caps sit ~0.99em above the alphabetic baseline
      ctx.fillText(line, pos.x, pos.y + size * 0.97 + i * lineH);
    });
  };
  // hard under-shadow, soft ambient, then the gold gradient
  ctx.save();
  ctx.shadowColor = "rgba(120,60,0,0.55)";
  ctx.shadowOffsetY = 4;
  drawPass("rgba(0,0,0,1)");
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowOffsetY = 8;
  ctx.shadowBlur = 20;
  drawPass("rgba(0,0,0,1)");
  ctx.restore();
  drawPass(grad);
  setSpacing(ctx, 0);
  return box;
}

function drawEyebrow(
  ctx: CanvasRenderingContext2D,
  text: string,
  pos: { x: number; y: number },
  size: number,
  fonts: PromoFonts,
  measureOnly: boolean
): Box {
  const RULE_W = 52;
  const RULE_H = 6;
  const GAP = 14;
  ctx.font = `800 ${size}px ${fonts.poppins}`;
  setSpacing(ctx, size * 0.2);
  const tw = ctx.measureText(text.toUpperCase()).width;
  const h = size * 1.3;
  const box = { x: pos.x, y: pos.y, w: RULE_W + GAP + tw, h };
  if (measureOnly) return box;
  const midY = pos.y + h / 2;
  const rg = ctx.createLinearGradient(pos.x, 0, pos.x + RULE_W, 0);
  rg.addColorStop(0, "#ffd257");
  rg.addColorStop(1, "#f47b20");
  ctx.fillStyle = rg;
  roundRect(ctx, pos.x, midY - RULE_H / 2, RULE_W, RULE_H, 3);
  ctx.fill();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text.toUpperCase(), pos.x + RULE_W + GAP, midY + size * 0.36);
  setSpacing(ctx, 0);
  return box;
}

function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  pos: { x: number; y: number },
  size: number,
  fonts: PromoFonts,
  measureOnly: boolean
): Box {
  const lineH = size * 1.25;
  ctx.font = `800 ${size}px ${fonts.poppins}`;
  setSpacing(ctx, size * 0.04);
  const upper = lines.map((l) => l.toUpperCase());
  const w = Math.max(1, ...upper.map((l) => ctx.measureText(l).width));
  const box = { x: pos.x, y: pos.y, w, h: lineH * lines.length };
  if (measureOnly) return box;
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  upper.forEach((line, i) => ctx.fillText(line, pos.x, pos.y + size + i * lineH));
  setSpacing(ctx, 0);
  return box;
}

function drawChip(
  ctx: CanvasRenderingContext2D,
  text: string,
  pos: { x: number; y: number },
  size: number,
  fonts: PromoFonts,
  gold: boolean,
  measureOnly: boolean
): Box {
  const PAD_X = 22;
  const PAD_Y = 12;
  ctx.font = `800 ${size}px ${fonts.poppins}`;
  setSpacing(ctx, size * 0.06);
  const tw = ctx.measureText(text.toUpperCase()).width;
  const w = tw + PAD_X * 2 + 4;
  const h = size + PAD_Y * 2;
  const box = { x: pos.x, y: pos.y, w, h };
  if (measureOnly) return box;
  ctx.save();
  if (gold) {
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = cssGradient(ctx, pos.x, pos.y, w, h, 180, [
      [0, "#ffe9a8"],
      [0.45, "#ffd257"],
      [1, "#f4a11f"],
    ]);
    roundRect(ctx, pos.x, pos.y, w, h, h / 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#00202c";
  } else {
    ctx.fillStyle = "rgba(0,32,44,0.42)";
    roundRect(ctx, pos.x, pos.y, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    roundRect(ctx, pos.x + 1, pos.y + 1, w - 2, h - 2, (h - 2) / 2);
    ctx.stroke();
    ctx.restore();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = "#ffffff";
  }
  ctx.fillText(text.toUpperCase(), pos.x + PAD_X + 2, pos.y + PAD_Y + size * 0.82);
  setSpacing(ctx, 0);
  return box;
}

function drawRich(
  ctx: CanvasRenderingContext2D,
  text: string,
  pos: { x: number; y: number },
  size: number,
  fonts: PromoFonts,
  kind: "details" | "partner",
  measureOnly: boolean
): Box {
  const segs = segments(text);
  const font = (accent: boolean) =>
    kind === "details"
      ? `${accent ? 800 : 600} ${size}px ${fonts.poppins}`
      : `${accent ? "700" : "italic 500"} ${size}px ${fonts.poppins}`;
  let w = 0;
  for (const s of segs) {
    ctx.font = font(s.accent);
    w += ctx.measureText(s.text).width;
  }
  const box = { x: pos.x, y: pos.y, w: Math.max(1, w), h: size * 1.45 };
  if (measureOnly) return box;
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  let x = pos.x;
  const baseline = pos.y + size;
  for (const s of segs) {
    ctx.font = font(s.accent);
    ctx.fillStyle =
      kind === "details"
        ? s.accent
          ? GOLD
          : "rgba(255,255,255,0.92)"
        : s.accent
          ? "rgba(255,255,255,0.85)"
          : "rgba(255,255,255,0.7)";
    ctx.fillText(s.text, x, baseline);
    x += ctx.measureText(s.text).width;
  }
  return box;
}

function drawWith(
  ctx: CanvasRenderingContext2D,
  name: string,
  pos: { x: number; y: number },
  size: number,
  fonts: PromoFonts,
  measureOnly: boolean
): Box {
  const withSize = size * 0.76;
  ctx.font = `italic 500 ${withSize}px ${fonts.poppins}`;
  const w1 = ctx.measureText("with").width;
  ctx.font = `800 ${size}px ${fonts.poppins}`;
  setSpacing(ctx, size * 0.02);
  const w2 = ctx.measureText(name.toUpperCase()).width;
  setSpacing(ctx, 0);
  const w = Math.max(w1, w2);
  const h = withSize * 1.2 + 6 + size * 1.1;
  // top-RIGHT anchored: pos.x is the right edge
  const box = { x: pos.x - w, y: pos.y, w, h };
  if (measureOnly) return box;
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `italic 500 ${withSize}px ${fonts.poppins}`;
  ctx.fillText("with", pos.x - w1, pos.y + withSize);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${size}px ${fonts.poppins}`;
  setSpacing(ctx, size * 0.02);
  ctx.fillText(name.toUpperCase(), pos.x - w2, pos.y + withSize * 1.2 + 6 + size * 0.9);
  setSpacing(ctx, 0);
  return box;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
