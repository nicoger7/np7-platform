"use client";

import { useEffect, useRef } from "react";

/**
 * The workshop "sanding" effect for primer-colored sections: underneath the
 * sanded primer lies the CARBON. Moving the cursor sands the coat off — a soft
 * brush erases the opaque primer canvas and the weave shows through — then the
 * scratches slowly heal so the surface never stays bare. Pure decoration:
 * pointer-events none, skipped for touch devices and reduced-motion users, and
 * the carbon stays hidden until the primer coat has actually been painted (so
 * a JS-less render never flashes dark).
 */

const PRIMER = "#e4e4e0";

export function SandingSurface() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const carbonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const carbon = carbonRef.current;
    if (!canvas || !carbon) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const section = canvas.parentElement;
    const ctx = canvas.getContext("2d");
    if (!section || !ctx) return;

    let raf = 0;
    let running = false;

    const paintPrimer = () => {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = PRIMER;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    const resize = () => {
      const r = section.getBoundingClientRect();
      canvas.width = Math.round(r.width);
      canvas.height = Math.round(r.height);
      paintPrimer();
      // primer coat is on — now the carbon underneath may exist
      carbon.style.opacity = "1";
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(section);

    // THE SANDING BRUSH — not a round eraser: an elongated stroke aligned with
    // the motion, plus thin parallel scratch lines, like sandpaper streaks.
    let last: { x: number; y: number } | null = null;
    const stamp = (x: number, y: number, angle: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.globalCompositeOperation = "destination-out";
      // elongated soft core along the stroke direction
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
      g.addColorStop(0, "rgba(0,0,0,0.38)");
      g.addColorStop(0.7, "rgba(0,0,0,0.12)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.scale(1.9, 0.5); // stretch with the motion, thin across it
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(x, y);
      ctx.rotate(angle);
      // fine scratch lines parallel to the stroke
      for (let i = 0; i < 4; i++) {
        const off = (Math.random() - 0.5) * 26;
        const len = 24 + Math.random() * 42;
        ctx.fillStyle = `rgba(0,0,0,${0.18 + Math.random() * 0.2})`;
        ctx.fillRect(-len / 2, off, len, 0.9 + Math.random() * 0.8);
      }
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
      // loose dust thrown off the stroke
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 18 + Math.random() * 30;
        ctx.fillStyle = "rgba(160,156,146,0.35)";
        ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, 1.5, 1.5);
      }
    };
    const sand = (x: number, y: number) => {
      if (!last) { last = { x, y }; stamp(x, y, 0); return; }
      const dx = x - last.x, dy = y - last.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      // interpolate stamps along the path so fast strokes leave a continuous streak
      const steps = Math.max(1, Math.min(14, Math.round(dist / 9)));
      for (let i = 1; i <= steps; i++) stamp(last.x + (dx * i) / steps, last.y + (dy * i) / steps, angle);
      last = { x, y };
    };

    // the coat heals: primer slowly repaints over the scratches
    const heal = () => {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.028;
      ctx.fillStyle = PRIMER;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(heal);
    };

    const onMove = (e: PointerEvent) => {
      const r = section.getBoundingClientRect();
      sand(e.clientX - r.left, e.clientY - r.top);
      if (!running) { running = true; raf = requestAnimationFrame(heal); }
    };

    const onLeave = () => { last = null; };
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
      {/* THE CARBON — hidden until the primer coat above it is painted */}
      <div
        ref={carbonRef}
        aria-hidden
        className="absolute inset-0 pointer-events-none transition-opacity duration-300"
        style={{
          opacity: 0,
          backgroundColor: "#101012",
          backgroundImage:
            "repeating-linear-gradient(45deg,rgba(255,255,255,0.055) 0 2px,transparent 2px 8px),repeating-linear-gradient(-45deg,rgba(255,255,255,0.055) 0 2px,transparent 2px 8px),radial-gradient(ellipse 60% 45% at 50% 30%, rgba(255,255,255,0.05), transparent 70%)",
        }}
      />
      {/* the primer coat the cursor sands off */}
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 pointer-events-none" />
      {/* sanded patches — uneven primer, like spots already worked over */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 34% 22% at 22% 30%, rgba(160,156,146,0.18), transparent 70%), radial-gradient(ellipse 28% 20% at 74% 62%, rgba(160,156,146,0.14), transparent 70%)",
        }}
      />
    </>
  );
}
