"use client";

import { useEffect, useState } from "react";

/**
 * A slow cross-fading photo backdrop. Sits behind a section as ambient texture
 * (kept low-opacity by the caller, with a scrim on top for text contrast).
 * Pauses for users who prefer reduced motion. No deps.
 */
export function Slideshow({ images, interval = 5000, className = "" }: { images: string[]; interval?: number; className?: string }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (images.length < 2) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % images.length), interval);
    return () => clearInterval(id);
  }, [images.length, interval]);

  if (images.length === 0) return null;

  return (
    <div className={`absolute inset-0 ${className}`} aria-hidden>
      {images.map((src, idx) => (
        <div
          key={idx}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-[2000ms] ease-in-out"
          style={{ backgroundImage: `url('${src}')`, opacity: i === idx ? 1 : 0 }}
        />
      ))}
    </div>
  );
}
