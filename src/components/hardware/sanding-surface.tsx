"use client";

import { useEffect, useRef } from "react";

/**
 * The workshop "sanding" effect for primer sections: UNIDIRECTIONAL carbon
 * lies under the primer, and the cursor sands the coat off.
 *
 * Three layers so it behaves like actual sanding:
 *   · carbon  — procedural twill weave (canvas pattern, not a CSS mesh)
 *   · coat    — the visible primer, rebuilt each frame from the two masks
 *   · masks   — `fresh` (strong, fades away) + `wear` (weak, PERMANENT)
 * so a pass leaves a bright scratch that softens, and a permanent worn patch
 * that never fully heals. Decoration only: pointer-events none, skipped for
 * touch + reduced-motion, and the carbon is painted only once the coat exists.
 */

const PRIMER = "#e4e4e0";
const FIBRE_ANGLE = -12;  // degrees — the tows all run this way (UD, not woven)
const BRUSH = 26;         // sanding head radius
const WEAR_ALPHA = 0.05;  // permanent erosion per pass (accumulates)
const FRESH_FADE = 0.045; // how fast the bright scratch calms down

export function SandingSurface() {
  const carbonRef = useRef<HTMLCanvasElement>(null);
  const coatRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const carbon = carbonRef.current;
    const coat = coatRef.current;
    if (!carbon || !coat) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const section = coat.parentElement;
    const cctx = carbon.getContext("2d");
    const ctx = coat.getContext("2d");
    if (!section || !cctx || !ctx) return;

    // offscreen masks
    const fresh = document.createElement("canvas");
    const wear = document.createElement("canvas");
    const fctx = fresh.getContext("2d")!;
    const wctx = wear.getContext("2d")!;

    // Retina: draw at device pixels. Rendering the weave at CSS px and letting
    // the browser upscale it turned the twill into a blurry moiré.
    const S = Math.min(window.devicePixelRatio || 1, 2);

    let raf = 0;
    let idle = 0;
    let running = false;

    /** UNIDIRECTIONAL carbon: continuous parallel tows, laid at one angle.
     *  Drawn full-size (not a repeating tile) so the filaments run edge to edge
     *  like real UD, with a random-walk so they cluster into bundles rather
     *  than reading as regular stripes. */
    const paintCarbon = () => {
      const w = carbon.width;
      const h = carbon.height;
      cctx.setTransform(1, 0, 0, 1, 0, 0);
      cctx.fillStyle = "#0a0a0c";
      cctx.fillRect(0, 0, w, h);
      if (w === 0 || h === 0) return;

      const diag = Math.ceil(Math.hypot(w, h));
      const off = document.createElement("canvas");
      off.width = diag;
      off.height = diag;
      const o = off.getContext("2d");
      if (!o) return;
      o.fillStyle = "#0b0b0e";
      o.fillRect(0, 0, diag, diag);

      // the tows — a smoothed random walk clusters filaments into bundles
      const step = Math.max(1, Math.round(1.2 * S));
      let v = 0;
      for (let y = 0; y < diag; y += step) {
        v = v * 0.72 + (Math.random() - 0.5);
        const light = Math.max(-1, Math.min(1, v));
        o.fillStyle = light > 0
          ? `rgba(255,255,255,${(0.02 + light * 0.075).toFixed(3)})`
          : `rgba(0,0,0,${(0.05 + -light * 0.3).toFixed(3)})`;
        o.fillRect(0, y, diag, step);
      }
      // a whisper of sheen along the fibres — wide soft bands read as blur,
      // so this stays tight and faint
      for (let i = 0; i < 5; i++) {
        const y = Math.random() * diag;
        const spread = 7 * S;
        const band = o.createLinearGradient(0, y - spread, 0, y + spread);
        band.addColorStop(0, "rgba(255,255,255,0)");
        band.addColorStop(0.5, "rgba(255,255,255,0.05)");
        band.addColorStop(1, "rgba(255,255,255,0)");
        o.fillStyle = band;
        o.fillRect(0, y - spread, diag, spread * 2);
      }

      // lay the fibres down at the sheet angle
      cctx.save();
      cctx.translate(w / 2, h / 2);
      cctx.rotate((FIBRE_ANGLE * Math.PI) / 180);
      cctx.drawImage(off, -diag / 2, -diag / 2);
      cctx.restore();

      // clear-coat depth ACROSS the fibres
      const gloss = cctx.createLinearGradient(0, 0, w * 0.8, h);
      gloss.addColorStop(0, "rgba(255,255,255,0.03)");
      gloss.addColorStop(0.5, "rgba(255,255,255,0)");
      gloss.addColorStop(1, "rgba(0,0,0,0.16)");
      cctx.fillStyle = gloss;
      cctx.fillRect(0, 0, w, h);
      carbon.style.opacity = "1";
    };

    // the visible coat = primer minus both masks (rebuilt, never compounded)
    const rebuild = () => {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, coat.width, coat.height);
      ctx.fillStyle = PRIMER;
      ctx.fillRect(0, 0, coat.width, coat.height);
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(wear, 0, 0);
      ctx.drawImage(fresh, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    };

    const resize = () => {
      const r = section.getBoundingClientRect();
      const w = Math.round(r.width * S);
      const h = Math.round(r.height * S);
      for (const c of [carbon, coat, fresh, wear]) { c.width = w; c.height = h; }
      // A canvas is a REPLACED element: `inset-0` does NOT stretch it, so it
      // takes its layout size from the backing store — at S=2 that made the
      // whole surface render twice as large and the sanding drift away from
      // the cursor. Pin the CSS size to the section.
      for (const c of [carbon, coat]) {
        c.style.width = `${r.width}px`;
        c.style.height = `${r.height}px`;
      }
      paintCarbon();
      rebuild();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(section);

    /* ── the brush ─────────────────────────────────────────────────────────
       Stamps are oriented by a SMOOTHED direction. A jittery per-event angle
       (which is what tiny slow movements produce) fanned the elongated stamps
       around one point — that was the "star". Below a real movement threshold
       we reuse the last direction instead of inventing a new one.            */
    let last: { x: number; y: number } | null = null;
    let angle = 0;
    let hasAngle = false;

    const stamp = (target: CanvasRenderingContext2D, x: number, y: number, strength: number) => {
      target.save();
      target.translate(x, y);
      target.rotate(angle);
      target.scale(1.7, 0.55); // long with the stroke, thin across it
      const R = BRUSH * S;
      const g = target.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, `rgba(0,0,0,${strength})`);
      g.addColorStop(0.65, `rgba(0,0,0,${strength * 0.35})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      target.fillStyle = g;
      target.beginPath();
      target.arc(0, 0, R, 0, Math.PI * 2);
      target.fill();
      target.restore();
    };

    const scratch = (x: number, y: number) => {
      // grit lines strictly along the stroke — never radiating
      fctx.save();
      fctx.translate(x, y);
      fctx.rotate(angle);
      for (let i = 0; i < 3; i++) {
        const off = (Math.random() - 0.5) * 22 * S;
        const len = (26 + Math.random() * 40) * S;
        fctx.fillStyle = `rgba(0,0,0,${0.16 + Math.random() * 0.16})`;
        fctx.fillRect(-len / 2, off, len, (0.8 + Math.random() * 0.7) * S);
      }
      fctx.restore();
    };

    const sand = (x: number, y: number) => {
      if (!last) { last = { x, y }; return; }
      const dx = x - last.x;
      const dy = y - last.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1.2 * S) return;         // micro-jitter: don't stamp at all
      if (dist >= 3 * S || !hasAngle) {   // only a real move sets the direction
        angle = Math.atan2(dy, dx);
        hasAngle = true;
      }
      const steps = Math.max(1, Math.min(12, Math.round(dist / (7 * S))));
      for (let i = 1; i <= steps; i++) {
        const px = last.x + (dx * i) / steps;
        const py = last.y + (dy * i) / steps;
        stamp(fctx, px, py, 0.42);          // bright fresh scratch
        stamp(wctx, px, py, WEAR_ALPHA);    // permanent wear underneath
        if (Math.random() < 0.6) scratch(px, py);
      }
      last = { x, y };
      idle = 0;
    };

    // fresh scratches calm down; the worn patch stays
    const tick = () => {
      fctx.globalCompositeOperation = "destination-out";
      fctx.fillStyle = `rgba(0,0,0,${FRESH_FADE})`;
      fctx.fillRect(0, 0, fresh.width, fresh.height);
      fctx.globalCompositeOperation = "source-over";
      rebuild();
      if (++idle > 180) { running = false; return; } // settled — stop the loop
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const r = section.getBoundingClientRect();
      sand((e.clientX - r.left) * S, (e.clientY - r.top) * S);
      if (!running) { running = true; raf = requestAnimationFrame(tick); }
    };
    const onLeave = () => { last = null; hasAngle = false; };

    section.addEventListener("pointermove", onMove);
    section.addEventListener("pointerleave", onLeave);
    return () => {
      section.removeEventListener("pointermove", onMove);
      section.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <>
      {/* the carbon underneath — painted only once the coat is up */}
      <canvas ref={carbonRef} aria-hidden className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-300" />
      {/* the primer coat the cursor sands off */}
      <canvas ref={coatRef} aria-hidden className="absolute inset-0 pointer-events-none" />
    </>
  );
}
