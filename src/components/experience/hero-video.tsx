"use client";

import { useEffect, useRef, useState } from "react";

/** Extract a YouTube video id from the common URL shapes. */
export function youtubeId(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : /^[A-Za-z0-9_-]{11}$/.test(url.trim()) ? url.trim() : null;
}

/**
 * Muted, autoplaying, looping YouTube background for the event hero.
 * Falls back to the poster image until the video is mounted (and if the URL
 * can't be parsed). Scaled to cover the container like a background-video.
 */
export function HeroVideo({ url, poster }: { url: string; poster?: string | null }) {
  const id = youtubeId(url);
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // only start the embed once it's on screen (saves the request on cold loads)
  useEffect(() => {
    if (!id) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShow(true), { threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, [id]);

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      {poster && (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${poster}')` }} />
      )}
      {id && show && (
        <iframe
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[177.78vh] min-w-full h-[56.25vw] min-h-full pointer-events-none"
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&disablekb=1`}
          title="Experience video"
          allow="autoplay; encrypted-media"
          frameBorder={0}
          aria-hidden
        />
      )}
    </div>
  );
}
