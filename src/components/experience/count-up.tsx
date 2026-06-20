"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates the FIRST integer found in a string from 0 up to its value when the
 * element scrolls into view, leaving the rest of the string intact. So
 * "80–90%" counts the 80 then shows "–90%", "15–25 kn" counts the 15, and a
 * purely textual value like "May–October" renders as-is. Gives the conditions
 * band that premium, "live data" feel without breaking ranges or units.
 */
export function CountUp({ value, className = "" }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const match = value.match(/\d+/);
  const target = match ? parseInt(match[0], 10) : null;
  const [n, setN] = useState(target ?? 0);

  useEffect(() => {
    if (target === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(target); return; }
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const dur = 1100, start = performance.now();
      const tick = (t: number) => {
        const p = Math.min((t - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        setN(Math.round(eased * target));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      setN(0);
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target]);

  if (target === null) return <span className={className}>{value}</span>;
  const rest = value.slice(value.indexOf(match![0]) + match![0].length);
  const pre = value.slice(0, value.indexOf(match![0]));
  return <span ref={ref} className={`tabular-nums ${className}`}>{pre}{n}{rest}</span>;
}
