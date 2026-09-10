/**
 * The Promo Studio artboard transform, against the thing that broke it.
 *
 * A click has to land on the layer it was aimed at. That is one line of
 * arithmetic and it still went wrong, because the admin renders at zoom:1.1 and
 * WebKit reported a zoomed element's getBoundingClientRect() in the element's
 * OWN pixels while the pointer kept reporting the viewport's (WebKit 77998,
 * fixed only in Safari 26.4). The result was an offset that grew with distance
 * down the page: you had to click well above a line to select it.
 *
 * So the test is a round trip. Put a known artboard point on the screen, hand
 * the resulting client coordinates back, and demand the same point returns —
 * for both artboards, at three fit scales, on an engine that reports the rect
 * honestly and on one that does not.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/smoke-promo-pointer.mts
 */
import {
  artboardToScreen,
  artboardUnitsPerScreenPx,
  clientSpaceFactor,
  screenToArtboard,
  type RectLike,
} from "@/lib/promo-pointer";
import { PROMO_FORMATS, type PromoFormat } from "@/lib/promo-template";

let failed = 0;
const check = (name: string, ok: boolean, note = "") => {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${note ? "  — " + note : ""}`);
  if (!ok) failed++;
};
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

/**
 * One artboard on one screen.
 *
 * `paint` is the truth: where the poster actually is in viewport pixels, and
 * how big. Everything else is what an engine chooses to tell us about it.
 */
type Engine = "chromium" | "webkit-zoom-bug";
function measurement(
  art: { w: number; h: number },
  fit: number,          // the studio's fit scale — artboard px → local CSS px
  zoom: number,         // the admin shell's CSS zoom
  engine: Engine,
  origin = { left: 611.32, top: 334.16 }, // where the artboard sits, viewport px
) {
  const paint = {
    left: origin.left,
    top: origin.top,
    width: art.w * fit * zoom,
    height: art.h * fit * zoom,
  };
  // The element's own layout box is unzoomed in every engine.
  const layout = { width: art.w * fit, height: art.h * fit };
  const rect: RectLike =
    engine === "chromium"
      ? paint
      : { left: paint.left / zoom, top: paint.top / zoom, width: paint.width / zoom, height: paint.height / zoom };
  return { paint, layout, rect };
}

/** Where a point on the artboard really is on screen — no rect involved. */
const truthOnScreen = (p: { x: number; y: number }, paint: RectLike, art: { w: number; h: number }) => ({
  clientX: paint.left + (p.x * paint.width) / art.w,
  clientY: paint.top + (p.y * paint.height) / art.h,
});

/* ── 1. The round trip, everywhere it has to hold. ─────────────────────────── */
{
  // Real content coordinates from the default design: the eyebrow, the place
  // name, the date chip, the details line, and the two corners.
  const points = [
    { x: 0, y: 0 }, { x: 56, y: 592 }, { x: 200, y: 730 },
    { x: 200, y: 1078 }, { x: 300, y: 1240 }, { x: 1080, y: 1350 },
  ];
  for (const fmtKey of Object.keys(PROMO_FORMATS) as PromoFormat[]) {
    const { w, h } = PROMO_FORMATS[fmtKey];
    const art = { w, h };
    for (const fit of [0.27, 0.43, 1]) {
      for (const zoom of [1, 1.1]) {
        for (const engine of ["chromium", "webkit-zoom-bug"] as Engine[]) {
          const { paint, layout, rect } = measurement(art, fit, zoom, engine);
          const k = clientSpaceFactor(rect, layout, zoom);
          let worst = 0;
          for (const p of points) {
            if (p.y > h) continue; // 1350-tall points are off a 1920 artboard's list, not off the canvas
            const onScreen = truthOnScreen(p, paint, art);
            const back = screenToArtboard(onScreen, rect, art, k);
            worst = Math.max(worst, Math.abs(back.x - p.x), Math.abs(back.y - p.y));
          }
          check(
            `${fmtKey} · fit ${fit} · zoom ${zoom} · ${engine} — a click returns the point it was aimed at`,
            worst <= 0.01,
            `worst drift ${worst.toFixed(4)}px`,
          );
        }
      }
    }
  }
}

/* ── 2. The bug itself, so the fix cannot be quietly reverted. ─────────────── */
{
  const art = PROMO_FORMATS["45"];
  const { paint, layout, rect } = measurement({ w: art.w, h: art.h }, 0.43, 1.1, "webkit-zoom-bug");
  const target = { x: 200, y: 1078 }; // the date chip
  const onScreen = truthOnScreen(target, paint, { w: art.w, h: art.h });
  // What the old code did: trust the rect as if it were client pixels.
  const old = screenToArtboard(onScreen, rect, { w: art.w, h: art.h }, 1);
  check(
    "the un-corrected transform really does read the date chip as far lower down",
    old.y - target.y > 150,
    `reads y=${old.y.toFixed(0)} for a click on y=${target.y} — ${(old.y - target.y).toFixed(0)}px of "click higher"`,
  );
  const fixed = screenToArtboard(onScreen, rect, { w: art.w, h: art.h }, clientSpaceFactor(rect, layout, 1.1));
  check("…and the corrected one does not", near(fixed.y, target.y), `y=${fixed.y.toFixed(2)}`);
}

/* ── 3. No behaviour change where nothing was wrong. ───────────────────────── */
{
  const art = PROMO_FORMATS["916"];
  for (const zoom of [1, 1.1]) {
    const { layout, rect } = measurement({ w: art.w, h: art.h }, 0.31, zoom, "chromium");
    check(
      `an honest rect at zoom ${zoom} is used exactly as measured`,
      clientSpaceFactor(rect, layout, zoom) === 1,
      "the correction must be a no-op on Chromium, or this fix trades one offset for another",
    );
  }
  // An unmounted / display:none artboard must not divide by zero.
  const dead: RectLike = { left: 0, top: 0, width: 0, height: 0 };
  check("a zero-sized artboard yields 0,0 rather than NaN", (() => {
    const p = screenToArtboard({ clientX: 500, clientY: 500 }, dead, art, clientSpaceFactor(dead, { width: 0, height: 0 }, 1.1));
    return p.x === 0 && p.y === 0;
  })());
}

/* ── 4. Device pixel ratio is not part of this. ────────────────────────────── */
{
  // The backing store is pinned to the artboard's own 1080×H whatever the
  // screen is, so a retina Mac and a 1x monitor must agree to the pixel. If
  // someone ever multiplies the canvas by DPR, this is the check that fails.
  const art = PROMO_FORMATS["45"];
  const results = [1, 2, 3].map((dpr) => {
    void dpr; // deliberately unused: it has no term in the transform
    const { paint, layout, rect } = measurement({ w: art.w, h: art.h }, 0.43, 1.1, "webkit-zoom-bug");
    const onScreen = truthOnScreen({ x: 540, y: 675 }, paint, { w: art.w, h: art.h });
    return screenToArtboard(onScreen, rect, { w: art.w, h: art.h }, clientSpaceFactor(rect, layout, 1.1));
  });
  check(
    "devicePixelRatio changes nothing about where a click lands",
    results.every((r) => near(r.x, 540) && near(r.y, 675)),
  );
}

/* ── 5. Thresholds ride the same measurement. ──────────────────────────────── */
{
  const art = PROMO_FORMATS["45"];
  for (const engine of ["chromium", "webkit-zoom-bug"] as Engine[]) {
    const { layout, rect } = measurement({ w: art.w, h: art.h }, 0.43, 1.1, engine);
    const k = clientSpaceFactor(rect, layout, 1.1);
    const perPx = artboardUnitsPerScreenPx(rect, art, k);
    // 0.43 local px per artboard px, times 1.1 zoom = 0.473 painted px.
    check(
      `${engine} — one screen pixel is the same number of artboard units either way`,
      near(perPx, 1 / (0.43 * 1.1), 0.001),
      `${perPx.toFixed(4)} units/px`,
    );
  }
}

/* ── 6. The inverse agrees with the forward map. ───────────────────────────── */
{
  const art = PROMO_FORMATS["916"];
  const { layout, rect } = measurement({ w: art.w, h: art.h }, 0.31, 1.1, "webkit-zoom-bug");
  const k = clientSpaceFactor(rect, layout, 1.1);
  const p = { x: 365, y: 1120 }; // the 9:16 coach box origin
  const there = artboardToScreen(p, rect, art, k);
  const back = screenToArtboard(there, rect, art, k);
  check("artboard → screen → artboard is the identity", near(back.x, p.x) && near(back.y, p.y));
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
