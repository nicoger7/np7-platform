"use client";

import { useEffect, useRef } from "react";

/**
 * The workshop "sanding" effect for primer sections: real 2×2 twill CARBON
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
const CELL = 22;          // twill cell size (px)
const BRUSH = 26;         // sanding head radius
const WEAR_ALPHA = 0.05;  // permanent erosion per pass (accumulates)
const FRESH_FADE = 0.045; // how fast the bright scratch calms down

/** One 2×2 twill tile: neighbouring blocks run their tows perpendicular. */
function carbonTile(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = CELL * 2;
  c.height = CELL * 2;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b0b0d";
  g.fillRect(0, 0, CELL * 2, CELL * 2);

  const block = (bx: number, by: number, dir: 1 | -1) => {
    g.save();
    g.beginPath();
    g.rect(bx, by, CELL, CELL);
    g.clip();
    // each block catches light differently — that's what reads as "woven"
    const grad = g.createLinearGradient(bx, by, bx + CELL, by + CELL);
    grad.addColorStop(0, dir > 0 ? "#1a1a1e" : "#0c0c0f");
    grad.addColorStop(1, dir > 0 ? "#0c0c0f" : "#1a1a1e");
    g.fillStyle = grad;
    g.fillRect(bx, by, CELL, CELL);
    // the tows: fine parallel filaments at ±45°
    g.translate(bx + CELL / 2, by + CELL / 2);
    g.rotate((dir * Math.PI) / 4);
    g.lineWidth = 1;
    for (let i = -CELL; i <= CELL; i += 2) {
      g.strokeStyle = i % 4 === 0 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.4)";
      g.beginPath();
      g.moveTo(-CELL, i);
      g.lineTo(CELL, i);
      g.stroke();
    }
    g.restore();
  };
  block(0, 0, 1);
  block(CELL, 0, -1);
  block(0, CELL, -1);
  block(CELL, CELL, 1);
  return c;
}

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
    const pattern = ctx.createPattern(carbonTile(), "repeat")!;

    let raf = 0;
    let idle = 0;
    let running = false;

    const paintCarbon = () => {
      cctx.setTransform(1, 0, 0, 1, 0, 0);
      cctx.fillStyle = pattern;
      cctx.fillRect(0, 0, carbon.width, carbon.height);
      // clear-coat gloss so it reads as laminated, not flat fabric
      const gloss = cctx.createLinearGradient(0, 0, carbon.width * 0.6, carbon.height);
      gloss.addColorStop(0, "rgba(255,255,255,0.10)");
      gloss.addColorStop(0.45, "rgba(255,255,255,0.02)");
      gloss.addColorStop(1, "rgba(0,0,0,0.25)");
      cctx.fillStyle = gloss;
      cctx.fillRect(0, 0, carbon.width, carbon.height);
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
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      for (const c of [carbon, coat, fresh, wear]) { c.width = w; c.height = h; }
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
      const g = target.createRadialGradient(0, 0, 0, 0, 0, BRUSH);
      g.addColorStop(0, `rgba(0,0,0,${strength})`);
      g.addColorStop(0.65, `rgba(0,0,0,${strength * 0.35})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      target.fillStyle = g;
      target.beginPath();
      target.arc(0, 0, BRUSH, 0, Math.PI * 2);
      target.fill();
      target.restore();
    };

    const scratch = (x: number, y: number) => {
      // grit lines strictly along the stroke — never radiating
      fctx.save();
      fctx.translate(x, y);
      fctx.rotate(angle);
      for (let i = 0; i < 3; i++) {
        const off = (Math.random() - 0.5) * 22;
        const len = 26 + Math.random() * 40;
        fctx.fillStyle = `rgba(0,0,0,${0.16 + Math.random() * 0.16})`;
        fctx.fillRect(-len / 2, off, len, 0.8 + Math.random() * 0.7);
      }
      fctx.restore();
    };

    const sand = (x: number, y: number) => {
      if (!last) { last = { x, y }; return; }
      const dx = x - last.x;
      const dy = y - last.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1.2) return;             // micro-jitter: don't stamp at all
      if (dist >= 3 || !hasAngle) {       // only a real move sets the direction
        angle = Math.atan2(dy, dx);
        hasAngle = true;
      }
      const steps = Math.max(1, Math.min(12, Math.round(dist / 7)));
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
      sand(e.clientX - r.left, e.clientY - r.top);
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
