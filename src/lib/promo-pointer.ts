/**
 * Promo Studio — screen pixels to artboard pixels.
 *
 * The artboard is a 1080-wide canvas painted at whatever size fits the window,
 * so every click has to be converted before it can be tested against a layer's
 * box. That conversion looks like one line and is not, because of `zoom`.
 *
 * The admin shell zooms itself — `@media (min-width:1024px){.admin-root{zoom:1.1}}`
 * in admin-shell.tsx, so the team is not squinting at 13px type. CSS `zoom` is
 * the one thing browsers still disagree about here. A pointer event always
 * reports real viewport pixels. getBoundingClientRect() is supposed to report
 * the same space, and Chromium does; WebKit returned the element's own,
 * UNZOOMED box for thirteen years (bug 77998, fixed only in Safari 26.4).
 *
 * Divide a viewport distance by an unzoomed box and you get two errors at once:
 * every distance is overstated by the zoom factor, AND the element's own
 * distance from the top of the viewport leaks in as a constant. On an artboard
 * sitting 330px down the page that constant alone is ~78 artboard pixels, so
 * picking the date chip meant clicking somewhere up in the subtitle. That is
 * the "I have to click way higher than the item" report.
 *
 * The fix is not to guess the browser. `layout` is the element's own layout
 * size, which is unzoomed in every engine; whichever of the two candidates the
 * measured rect matches tells us which space it came from. On a browser that
 * gets it right the factor is exactly 1 and the arithmetic is unchanged.
 *
 * Note what is NOT in here: devicePixelRatio. The backing store is pinned to
 * the artboard's own 1080×H, never multiplied by DPR, so the device pixel grid
 * has no term in this transform. Adding one is the classic way to reintroduce
 * the bug.
 */

export type RectLike = { left: number; top: number; width: number; height: number };
export type SizeLike = { width: number; height: number };
export type Artboard = { w: number; h: number };
export type ClientPoint = { clientX: number; clientY: number };

/**
 * What to multiply a measured rect by to land in the pointer's coordinate
 * space: 1 when the engine already reports client pixels, `zoom` when it
 * reported the element's own unzoomed box instead.
 *
 * Decided on size, not position — a size is a pure scale, while a position
 * also depends on scrolling, which both spaces agree about.
 */
export function clientSpaceFactor(rect: RectLike, layout: SizeLike, zoom: number): number {
  if (!(zoom > 0) || zoom === 1) return 1;
  // Nothing measurable (display:none, a fresh mount): trust the rect.
  if (!(rect.width > 0) || !(layout.width > 0)) return 1;
  const asPainted = Math.abs(rect.width - layout.width * zoom) + Math.abs(rect.height - layout.height * zoom);
  const asLayout = Math.abs(rect.width - layout.width) + Math.abs(rect.height - layout.height);
  return asLayout < asPainted ? zoom : 1;
}

/** A pointer's client coordinates → artboard pixels. */
export function screenToArtboard(p: ClientPoint, rect: RectLike, art: Artboard, k = 1): { x: number; y: number } {
  const w = rect.width * k;
  const h = rect.height * k;
  return {
    x: w > 0 ? (p.clientX - rect.left * k) * (art.w / w) : 0,
    y: h > 0 ? (p.clientY - rect.top * k) * (art.h / h) : 0,
  };
}

/** The inverse. Only the tests use it, and that is the point: a transform you
 *  cannot run backwards is a transform nobody can check. */
export function artboardToScreen(p: { x: number; y: number }, rect: RectLike, art: Artboard, k = 1): ClientPoint {
  return {
    clientX: rect.left * k + (art.w > 0 ? (p.x * rect.width * k) / art.w : 0),
    clientY: rect.top * k + (art.h > 0 ? (p.y * rect.height * k) / art.h : 0),
  };
}

/** Artboard units in one SCREEN pixel. Thresholds that should feel the same
 *  however far you are zoomed out (snapping, the forgiving hit test) are
 *  written in screen pixels and converted through this — never through the
 *  React `scale`, which is a frame behind and in a different space again. */
export function artboardUnitsPerScreenPx(rect: RectLike, art: Artboard, k = 1): number {
  const w = rect.width * k;
  return w > 0 ? art.w / w : 2;
}

// ── DOM side ────────────────────────────────────────────────────────────────

/** The zoom an element actually renders at, ancestors included. */
export function cssZoomOf(el: Element | null): number {
  if (!el || typeof window === "undefined") return 1;
  // Chromium ≥128 hands it over directly; it is also the only engine where the
  // walk below could disagree with what was painted.
  const direct = (el as Element & { currentCSSZoom?: number }).currentCSSZoom;
  if (typeof direct === "number" && direct > 0) return direct;
  let z = 1;
  for (let node: Element | null = el; node; node = node.parentElement) {
    const raw = window.getComputedStyle(node).zoom;
    const v = parseFloat(raw);
    if (Number.isFinite(v) && v > 0) z *= v;
  }
  return z;
}

/**
 * Measure the artboard element and say which space its rect is in.
 *
 * The rect is re-read every time — the page scrolls, and a stale origin is the
 * bug this module exists to kill. The *factor* is cached per element, because
 * working it out costs a computed-style walk and it only changes when the zoom
 * does, which always resizes the artboard too. Keyed on the rounded painted
 * width for exactly that reason, with a short expiry as a backstop.
 */
const factorCache = new WeakMap<Element, { key: number; k: number; at: number }>();

export function measureArtboard(el: HTMLElement): { rect: RectLike; k: number } {
  const rect = el.getBoundingClientRect();
  const key = Math.round(rect.width);
  const now = Date.now();
  const hit = factorCache.get(el);
  if (hit && hit.key === key && now - hit.at < 2000) return { rect, k: hit.k };
  const k = clientSpaceFactor(rect, { width: el.offsetWidth, height: el.offsetHeight }, cssZoomOf(el));
  factorCache.set(el, { key, k, at: now });
  return { rect, k };
}
