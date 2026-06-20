"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Workshop hero for NP7 Hardware — raw, dark and tactile: a concrete/carbon
 * surface lit by a single overhead workshop lamp, with fine dust drifting in
 * the beam. The board is the craft; the neon is the finish ("veredelung").
 *
 * Dust is a lightweight 2D canvas (no WebGL); it idles for reduced-motion.
 */
function DustCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const N = 70;
    const motes = Array.from({ length: N }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 1.6,
      vy: 0.04 + Math.random() * 0.12,
      vx: (Math.random() - 0.5) * 0.05,
      a: 0.1 + Math.random() * 0.5,
    }));

    let raf = 0, running = true;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        if (running && !reduce) {
          m.y -= m.vy / h * 60;
          m.x += m.vx / w * 60;
          if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
        }
        // brighter near the top-centre beam
        const beam = Math.max(0, 1 - Math.hypot((m.x - 0.5) * 1.6, m.y - 0.1));
        ctx.beginPath();
        ctx.arc(m.x * w, m.y * h, m.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,244,220,${m.a * (0.25 + beam * 0.75)})`;
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();

    const io = new IntersectionObserver(([e]) => {
      running = e.isIntersecting;
      if (running && !reduce && !raf) draw();
      if (!running) { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0.01 });
    io.observe(canvas);

    return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener("resize", resize); io.disconnect(); };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full" aria-hidden />;
}

const NOISE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E";

export function WorkshopHero({ children }: { children?: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <section className="relative w-full h-[100svh] min-h-[640px] overflow-hidden bg-[#0e0e10]">
      {/* concrete base + warmth */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% -10%, #26241f 0%, #161618 38%, #0c0c0e 100%)" }} />
      {/* carbon weave, low and subtle toward the floor */}
      <div
        className="absolute inset-x-0 bottom-0 h-2/3 opacity-[0.5]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.035) 0 2px, transparent 2px 7px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.035) 0 2px, transparent 2px 7px)",
          maskImage: "linear-gradient(to top, #000 0%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to top, #000 0%, transparent 100%)",
        }}
        aria-hidden
      />
      {/* overhead lamp beam */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(40% 55% at 50% 0%, rgba(255,236,200,0.18) 0%, transparent 60%)" }} aria-hidden />
      {/* grit / film grain */}
      <div className="absolute inset-0 opacity-[0.06] mix-blend-overlay" style={{ backgroundImage: `url("${NOISE}")` }} aria-hidden />
      {/* dust motes in the beam */}
      {mounted && <DustCanvas />}
      {/* floor vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" aria-hidden />

      {children}
    </section>
  );
}
