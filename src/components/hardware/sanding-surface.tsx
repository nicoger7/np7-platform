"use client";

import { useEffect, useRef } from "react";

/**
 * The workshop "sanding" overlay for sand-colored sections: a heavier grain
 * base plus a cursor-following sanding trail — moving the pointer scuffs the
 * surface with fine dust speckles that slowly settle (fade). Pure decoration:
 * pointer-events none, skipped for touch devices and reduced-motion users.
 */
export function SandingSurface() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const section = canvas.parentElement;
    const ctx = canvas.getContext("2d");
    if (!section || !ctx) return;

    let raf = 0;
    let running = false;

    const resize = () => {
      const r = section.getBoundingClientRect();
      canvas.width = Math.round(r.width);
      canvas.height = Math.round(r.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(section);

    // dust speckles in sanded-primer tones — a mix of deep-sand and ink flecks
    const stamp = (x: number, y: number) => {
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * 26;
        const px = x + Math.cos(a) * d;
        const py = y + Math.sin(a) * d * 0.6; // sanding strokes bias horizontal
        const ink = Math.random() < 0.25;
        ctx.fillStyle = ink ? "rgba(20,20,18,0.10)" : "rgba(160,156,146,0.22)";
        const s = ink ? 1 : 1 + Math.random() * 1.6;
        ctx.fillRect(px, py, s, s);
      }
    };

    const settle = () => {
      // the dust slowly settles — evaporate the trail
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.045)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(settle);
    };

    const onMove = (e: PointerEvent) => {
      const r = section.getBoundingClientRect();
      stamp(e.clientX - r.left, e.clientY - r.top);
      if (!running) { running = true; raf = requestAnimationFrame(settle); }
    };

    section.addEventListener("pointermove", onMove);
    return () => {
      section.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <>
      {/* sanded patches — uneven primer, like spots already worked over */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 34% 22% at 22% 30%, rgba(160,156,146,0.20), transparent 70%), radial-gradient(ellipse 28% 20% at 74% 62%, rgba(160,156,146,0.16), transparent 70%), radial-gradient(ellipse 40% 26% at 55% 15%, rgba(255,255,255,0.35), transparent 70%)",
        }}
      />
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 pointer-events-none" />
    </>
  );
}
