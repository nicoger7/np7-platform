"use client";

import { useEffect, useRef, useState } from "react";

export type StoryItem = { icon: string; t: string; d: string };

/**
 * Scrollytelling: a sticky image panel whose photo cross-fades as each text item
 * scrolls past. Gives the long "what you take home" list a moving, vibey backdrop
 * without adding vertical bulk. Images cycle if there are fewer than items.
 * Falls back to a clean card grid on mobile (no sticky) and to a brand gradient
 * when no images are available.
 */
export function ScrollStory({ items, images }: { items: StoryItem[]; images: string[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        // pick the most-visible item closest to the viewport centre
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const idx = Number((visible[0].target as HTMLElement).dataset.idx);
          if (!Number.isNaN(idx)) setActive(idx);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.5, 1] }
    );
    refs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [items.length]);

  const hasImages = images.length > 0;
  const imgFor = (i: number) => images[i % images.length];

  return (
    <div className="grid lg:grid-cols-[1fr_1.05fr] gap-10 lg:gap-16 items-start">
      {/* Sticky image panel (desktop) */}
      <div className="hidden lg:block sticky top-24 h-[72vh] rounded-[28px] overflow-hidden shadow-[0_30px_70px_rgba(0,55,74,0.18)] bg-[#00374a]">
        {hasImages ? (
          items.map((_, i) => (
            <div
              key={i}
              aria-hidden
              className="absolute inset-0 bg-cover bg-center transition-opacity duration-700 ease-out"
              style={{ backgroundImage: `url('${imgFor(i)}')`, opacity: active === i ? 1 : 0 }}
            />
          ))
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(0,175,219,0.45),transparent_60%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-7 text-white">
          <span className="text-[34px] leading-none" aria-hidden>{items[active]?.icon}</span>
          <h3 className="text-2xl font-black tracking-[-0.02em] mt-3">{items[active]?.t}</h3>
          {/* progress dots */}
          <div className="flex gap-1.5 mt-5">
            {items.map((_, i) => (
              <span key={i} className={`h-1 rounded-full transition-all duration-500 ${active === i ? "w-7 bg-white" : "w-3 bg-white/35"}`} />
            ))}
          </div>
        </div>
      </div>

      {/* Scrolling text items */}
      <div className="space-y-3 lg:space-y-5">
        {items.map((o, i) => (
          <div
            key={o.t}
            data-idx={i}
            ref={(el) => { refs.current[i] = el; }}
            className={`rounded-2xl border p-6 transition-colors duration-300 ${
              active === i ? "border-[#00afdb]/40 bg-white shadow-[0_14px_40px_rgba(0,55,74,0.08)]" : "border-[#ebeef0] bg-white/70"
            }`}
          >
            {/* image on top for mobile only */}
            {hasImages && (
              <div className="lg:hidden aspect-[16/9] -mx-6 -mt-6 mb-5 bg-cover bg-center" style={{ backgroundImage: `url('${imgFor(i)}')` }} />
            )}
            <span className="text-[24px] leading-none lg:hidden" aria-hidden>{o.icon}</span>
            <h3 className="text-[18px] font-black tracking-[-0.01em] text-[#00374a] mb-2 leading-[1.2] mt-2 lg:mt-0">{o.t}</h3>
            <p className="text-[14.5px] text-[#5a6b72] leading-relaxed">{o.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
