"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cinematic full-bleed photo hero for destination pages.
 *
 * The image slowly "breathes" (Ken Burns scale) and drifts on scroll (parallax),
 * so the destination feels alive the moment the page loads — then the content
 * settles in with a staggered reveal. A soft scroll cue invites the descent.
 * Content is passed as children (server-rendered → SEO-safe); only the motion
 * is client-side, and it disables itself under prefers-reduced-motion.
 */
export function ParallaxHero({
  image,
  children,
  scrollCue = true,
}: {
  image: string;
  children?: React.ReactNode;
  scrollCue?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduce(true);
      return;
    }
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = ref.current, bg = bgRef.current;
        if (!el || !bg) return;
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;
        // drift the image down ~18% of scroll for depth
        bg.style.transform = `translate3d(0, ${Math.min(window.scrollY * 0.18, 180)}px, 0) scale(1.12)`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);

  return (
    <section ref={ref} className="relative h-[100svh] min-h-[620px] flex items-end overflow-hidden bg-[#00374a]">
      <div
        ref={bgRef}
        className={`absolute inset-0 bg-cover bg-center will-change-transform ${reduce ? "" : "ph-kenburns"}`}
        style={{ backgroundImage: image ? `url('${image}')` : undefined, transform: "scale(1.12)" }}
        aria-hidden
      />
      {/* legibility + brand tint */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#00374a] via-[#00374a]/35 to-black/25" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/40 to-transparent" />
      {/* thin sun→sea accent line riding the bottom */}
      <div className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: "linear-gradient(90deg,#ffc42e,#f47b20,#00afdb)" }} />

      <div className="relative w-full">{children}</div>

      {scrollCue && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/70 ph-cue" aria-hidden>
          <span className="text-[10px] font-bold tracking-[0.3em] uppercase">Scroll</span>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
        </div>
      )}

      <style>{`
        @keyframes phKenburns { from { transform: scale(1.12); } to { transform: scale(1.22); } }
        .ph-kenburns { animation: phKenburns 24s ease-out forwards; }
        @keyframes phCue { 0%,100% { transform: translate(-50%, 0); opacity: 0.7; } 50% { transform: translate(-50%, 8px); opacity: 1; } }
        .ph-cue { animation: phCue 2.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .ph-kenburns, .ph-cue { animation: none; } }
      `}</style>
    </section>
  );
}
