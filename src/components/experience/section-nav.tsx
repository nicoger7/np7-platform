"use client";

import { useEffect, useState } from "react";

export type NavSection = { id: string; label: string };

/**
 * Sticky sub-nav with scroll-spy. Highlights the section currently in view
 * and smooth-scrolls on click. Horizontally scrollable on mobile.
 */
export function SectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  return (
    <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-lg border-b border-[#ebebeb]">
      <nav className="max-w-[1200px] mx-auto px-4 sm:px-8">
        <ul className="flex gap-1 overflow-x-auto scrollbar-hide">
          {sections.map((s) => {
            const isActive = active === s.id;
            return (
              <li key={s.id} className="shrink-0">
                <a
                  href={`#${s.id}`}
                  className={`block px-4 py-3.5 text-[12.5px] font-semibold whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? "border-[#0aa3c7] text-[#111]"
                      : "border-transparent text-[#999] hover:text-[#111]"
                  }`}
                >
                  {s.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
