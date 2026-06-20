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

const COVER_CLASS =
  "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[177.78vh] min-w-full h-[56.25vw] min-h-full pointer-events-none";

// Load the YouTube IFrame Player API exactly once.
let apiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((window as any).YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiPromise;
}

/**
 * Muted, autoplaying YouTube background for the event hero.
 * - No start/end → simple full-clip loop via a plain iframe.
 * - With start/end → driven by the IFrame Player API so it loops only the
 *   chosen [start, end] window.
 * Falls back to the poster image until the video mounts (and if unparseable).
 */
export function HeroVideo({
  url,
  start,
  end,
  poster,
}: {
  url: string;
  start?: number | null;
  end?: number | null;
  poster?: string | null;
}) {
  const id = youtubeId(url);
  const hasSegment = (start != null && start > 0) || (end != null && end > 0);
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);

  // only start the embed once it's on screen (saves the request on cold loads)
  useEffect(() => {
    if (!id) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShow(true), { threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, [id]);

  // Segment mode: drive playback with the IFrame API so we can loop just [start, end].
  useEffect(() => {
    if (!id || !show || !hasSegment) return;
    let cancelled = false;
    const s = start != null && start > 0 ? Math.floor(start) : 0;
    const e = end != null && end > s ? Math.floor(end) : undefined;
    loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const YT = (window as any).YT;
      playerRef.current = new YT.Player(hostRef.current, {
        host: "https://www.youtube-nocookie.com",
        videoId: id,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1, mute: 1, controls: 0, rel: 0, showinfo: 0,
          modestbranding: 1, playsinline: 1, disablekb: 1, fs: 0,
          start: s, ...(e ? { end: e } : {}),
        },
        events: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onReady: (ev: { target: any }) => {
            ev.target.mute();
            ev.target.playVideo();
            const iframe = ev.target.getIframe?.();
            if (iframe) {
              iframe.className = COVER_CLASS;
              iframe.setAttribute("aria-hidden", "true");
            }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onStateChange: (ev: { data: number; target: any }) => {
            if (ev.data === YT.PlayerState.ENDED) {
              ev.target.seekTo(s, true);
              ev.target.playVideo();
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* player already torn down */
      }
      playerRef.current = null;
    };
  }, [id, show, hasSegment, start, end]);

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      {poster && (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${poster}')` }} />
      )}
      {id && show && hasSegment && (
        <div className="absolute inset-0">
          {/* replaced in place by the API-managed iframe */}
          <div ref={hostRef} className={COVER_CLASS} />
        </div>
      )}
      {id && show && !hasSegment && (
        <iframe
          className={COVER_CLASS}
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
