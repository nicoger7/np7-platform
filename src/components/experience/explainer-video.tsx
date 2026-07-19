"use client";

import { useState } from "react";

/** Pull the YouTube id from watch / youtu.be / embed URLs. */
function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/**
 * "Nico walks you through the trip" — a lite-YouTube facade: shows the thumbnail
 * + play button, and only loads the iframe on click (fast, no third-party JS
 * until the visitor actually wants to watch). Renders nothing without a URL.
 */
export function ExplainerVideo({ url, title = "Nico walks you through the week" }: { url?: string | null; title?: string }) {
  const [playing, setPlaying] = useState(false);
  const id = url ? youtubeId(url) : null;
  if (!id) return null;
  const thumb = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;

  return (
    <section className="relative py-16 sm:py-24 bg-[#00374a] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(0,175,219,0.18),transparent_60%)]" aria-hidden />
      <div className="relative max-w-[1000px] mx-auto px-6 sm:px-8 text-center">
        <p className="text-[11px] font-bold tracking-[0.22em] text-[#8fe6f2] mb-3">WATCH THE TRIP</p>
        <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-white">{title}</h2>
        <p className="text-white/55 text-[14.5px] mt-3 max-w-[520px] mx-auto">A few minutes with Nico on what the week actually looks like — the spot, the coaching, the vibe.</p>

        <div className="mt-9 relative rounded-3xl overflow-hidden shadow-[0_24px_70px_rgba(0,15,22,0.5)] aspect-video bg-black">
          {playing ? (
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
              title={title} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen
            />
          ) : (
            <button type="button" onClick={() => setPlaying(true)} aria-label="Play video" className="group absolute inset-0 w-full h-full">
              <span className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105" style={{ backgroundImage: `url('${thumb}')` }} />
              <span className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 grid place-items-center w-[76px] h-[76px] rounded-full bg-white/95 shadow-2xl transition-transform group-hover:scale-110">
                <svg className="w-7 h-7 translate-x-0.5 text-[#00374a]" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
