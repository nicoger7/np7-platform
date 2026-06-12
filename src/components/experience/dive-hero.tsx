"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll-scrubbed "dive" hero.
 *
 * A full-bleed windsurf clip whose playback position is driven directly by
 * scroll — the rider moves as you scroll (Apple-style scrubbing). The clip is
 * encoded all-intra (every frame a keyframe) so seeking to an arbitrary
 * `currentTime` lands instantly and reads smooth.
 *
 * Over the pinned scroll distance the shot slowly zooms, the colour grade sinks
 * toward deep-ocean, and the headline drifts up and fades. The foam wavefront
 * that closes the dive is the leading edge of the descent section below (so the
 * surface and the first feature rise together, with no gap between them).
 *
 * Falls back to a static poster hero when the user prefers reduced motion or the
 * video can't load, so the hero always looks intentional.
 */

type Props = {
  src: string;
  poster: string;
  /** length of the pinned scrub, in viewport heights (2.8 ≈ 280vh) */
  scenes?: number;
  children?: React.ReactNode;
};

export function DiveHero({
  src,
  poster,
  scenes = 2.0,
  children,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const gradeRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"video" | "static">("video");

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setMode("static");
      return;
    }
    const wrap = wrapRef.current;
    const video = videoRef.current;
    if (!wrap || !video) return;

    let duration = 0;
    let ready = false;
    let current = 0;

    const onMeta = () => {
      duration = video.duration || 0;
      ready = true;
      // prime the decoder — some mobile browsers won't seek until played once
      video.play().then(() => video.pause()).catch(() => {});
    };
    const onError = () => setMode("static");
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("error", onError);

    const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const progress = () => {
      const rect = wrap.getBoundingClientRect();
      const dist = wrap.offsetHeight - window.innerHeight;
      return dist <= 0 ? 0 : clamp(-rect.top / dist);
    };

    let raf = 0;
    let running = true;
    const tick = () => {
      const target = progress();
      current += (target - current) * 0.14;
      if (Math.abs(target - current) < 0.0005) current = target;
      const p = current;

      // video scrub — only re-seek on a meaningful delta to spare the decoder
      if (ready && duration) {
        const t = p * (duration - 0.05);
        if (video.readyState >= 2 && Math.abs(video.currentTime - t) > 0.01) {
          try {
            video.currentTime = t;
          } catch {
            /* seek can throw mid-load; ignore */
          }
        }
      }

      if (zoomRef.current)
        zoomRef.current.style.transform = `scale(${1 + 0.12 * p})`;
      if (gradeRef.current)
        gradeRef.current.style.opacity = String(clamp((p - 0.12) / 0.6) * 0.26);

      // headline drifts up + fades over the first ~half
      const pe = clamp(p / 0.5);
      if (contentRef.current) {
        contentRef.current.style.transform = `translateY(${-70 * pe}px)`;
        contentRef.current.style.opacity = String(Math.max(1 - pe * 1.18, 0));
      }
      if (cueRef.current)
        cueRef.current.style.opacity = String(Math.max(1 - p / 0.12, 0));

      raf = running ? requestAnimationFrame(tick) : 0;
    };

    // only run the loop while the hero is on screen
    const io = new IntersectionObserver(
      ([entry]) => {
        running = entry.isIntersecting;
        if (running && !raf) raf = requestAnimationFrame(tick);
        else if (!running && raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { threshold: 0 }
    );
    io.observe(wrap);
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("error", onError);
    };
  }, []);

  /* The signature NP7 "sun to sea": the full sun→coral→ocean→deep colour fade
     the page had before the video, laid back over the footage. Two layers — a
     semi-opaque gradient that carries the actual colour (sun-yellow at the top
     melting through coral into bright ocean blue), plus a soft-light pass that
     keeps it vivid while the footage still reads through as texture. */
  const sunWash = (
    <>
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,196,46,0.78) 0%, rgba(244,123,32,0.60) 30%, rgba(0,175,219,0.42) 64%, rgba(26,163,199,0.58) 100%)",
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #ffc42e 0%, #f47b20 34%, #00afdb 70%, #1aa3c7 100%)",
          mixBlendMode: "soft-light",
        }}
        aria-hidden
      />
    </>
  );

  /* soft dark scrim so the colour-matched logo & text separate from the water */
  const scrim = (
    <div
      className="absolute inset-0 bg-[radial-gradient(ellipse_58%_48%_at_50%_42%,rgba(0,28,42,0.55)_0%,rgba(0,28,42,0.2)_45%,transparent_75%)]"
      aria-hidden
    />
  );

  if (mode === "static") {
    return (
      <section className="relative w-full h-[100svh] min-h-[640px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${poster}')` }}
          aria-hidden
        />
        {sunWash}
        {scrim}
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
          {children}
        </div>
      </section>
    );
  }

  return (
    <section
      ref={wrapRef}
      className="relative w-full"
      style={{ height: `${scenes * 100}vh` }}
    >
      <div className="sticky top-0 h-[100svh] min-h-[560px] overflow-hidden">
        <div ref={zoomRef} className="absolute inset-0 will-change-transform">
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            muted
            playsInline
            preload="auto"
            tabIndex={-1}
            aria-hidden
            disablePictureInPicture
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        </div>

        {/* warm sun-to-sea wash over the footage */}
        {sunWash}

        {/* as the dive deepens, tint toward the bright shallow turquoise the
            descent opens with — NOT deep navy, which would read as a dark bar
            against the bright water below. The water only goes navy lower down. */}
        <div
          ref={gradeRef}
          className="absolute inset-0 bg-[#1aa3c7]"
          style={{ opacity: 0 }}
          aria-hidden
        />
        {scrim}

        {/* headline / logo / CTAs */}
        <div
          ref={contentRef}
          className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6 will-change-transform"
        >
          {children}
        </div>

        {/* scroll cue */}
        <div
          ref={cueRef}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-white/70 animate-bounce"
          aria-hidden
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>
    </section>
  );
}
