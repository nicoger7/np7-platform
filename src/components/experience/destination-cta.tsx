"use client";

import { useEffect, useState } from "react";

/**
 * Slim sticky action bar for a destination page. Slides up once the hero is
 * scrolled past, keeping the "see the trips" CTA one tap away. Destinations
 * have many trips (no single price), so it leads with the trip count instead.
 */
export function DestinationCta({
  name,
  tripCount,
  target = "#trips",
}: {
  name: string;
  tripCount: number;
  target?: string;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.85);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={`fixed bottom-0 inset-x-0 z-50 transition-transform duration-300 ${show ? "translate-y-0" : "translate-y-full"}`}>
      <div className="bg-[#00374a]/95 backdrop-blur-lg border-t border-white/10">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-3 flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-white truncate">{name}</p>
            <p className="text-[12px] text-white/60">
              {tripCount > 0
                ? <>{tripCount} {tripCount === 1 ? "trip" : "trips"} here</>
                : "New trips coming soon"}
            </p>
          </div>
          <a
            href={target}
            className="shrink-0 px-6 py-3 rounded-full text-[13px] font-bold bg-[#00afdb] text-white shadow-[0_4px_16px_rgba(0,175,219,0.35)] hover:bg-[#0bb6dd] transition-colors"
          >
            See the trips
          </a>
        </div>
      </div>
    </div>
  );
}
