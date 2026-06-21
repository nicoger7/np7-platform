"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Unified hero + "Find your fit": one continuous pinned scroll where the
 * scroll-scrubbed windsurf clip is the backdrop the whole way. Scene 0 is the
 * logo/headline hero (fades out as you scroll, like before); then the Find your
 * fit overview is always on screen while each fit's detail flies through over the
 * same running video, with a left progress rail. Click any fit to jump to it.
 * Falls back to a static, non-pinned version when reduced-motion / no video.
 */

type Segment = { id: string; chip: string; icon: React.ReactNode; tag: string; title: string; body: string; points: string[]; cta: string; image: string };

const I = {
  flame: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 2c1 3 4 4.5 4 8a4 4 0 11-8 0c0-1.2.4-2 1-3 .2 1.2 1 1.8 1.8 2-.2-2.4 0-5 1.2-7z" /><path d="M8.5 14a3.5 3.5 0 007 0" /></svg>,
  cycle: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M3 12a9 9 0 0115-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 01-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>,
  sprout: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 22V12" /><path d="M12 12C12 8 9 6 5 6c0 4 3 6 7 6z" /><path d="M12 14c0-3 3-5 7-5 0 3-3 5-7 5z" /></svg>,
  duo: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M2 20c0-3 2.5-5 6-5s6 2 6 5" /><path d="M16 15c2.5 0 4 1.6 4 4" /></svg>,
};

const SEGMENTS: Segment[] = [
  { id: "enthusiast", chip: "I live for it", icon: I.flame, tag: "The enthusiast", title: "You already love the ride.", body: "You windsurf as much as you can and you want to go further — faster planing, cleaner jibes, your first moves. This is where you level up.", points: ["Coaching from one of the world's best", "Daily video analysis to break plateaus", "The best spots & conditions we can find", "A crew on your level that pushes you"], cta: "See advanced trips", image: "https://surfcenter-experience.com/wp-content/uploads/2025/11/Balz_Muller-5.jpg" },
  { id: "returnee", chip: "I'm getting back into it", icon: I.cycle, tag: "The comeback", title: "Back on the water after a break.", body: "It's been a few years and you're not sure what you've still got. Don't worry — it comes back fast, and we make the whole thing easy.", points: ["Patient coaching that meets you where you are", "Small groups, zero pressure", "All gear sorted — just turn up and sail", "You'll be planing again by day two"], cta: "Find your week", image: "https://surfcenter-experience.com/wp-content/uploads/2025/11/Rossmeier-2.jpg" },
  { id: "beginner", chip: "I'm just starting", icon: I.sprout, tag: "The first-timer", title: "Your first real sessions.", body: "New to windsurfing, or only had a lesson or two? You'll be amazed how far you get in a week with the right coach and good conditions.", points: ["A dedicated beginner coach", "From zero to planing in a week", "Beginner-friendly gear included", "Completely at your own pace"], cta: "See beginner-friendly trips", image: "https://surfcenter-experience.com/wp-content/uploads/2025/01/53724070151_54cd73586b_k-1536x1024.jpg" },
  { id: "together", chip: "I'm bringing someone", icon: I.duo, tag: "Together", title: "Make it a trip for two.", body: "Whether they ride or relax — bring your person. One of you chases the wind while the other soaks up the island, and the evenings are yours together.", points: ["Add a beginner or non-riding package", "They get the island: beach, dinners, downtime", "Lessons for them whenever they're curious", "Same hotel, same sunsets, shared memories"], cta: "Plan a trip for two", image: "https://surfcenter-experience.com/wp-content/uploads/2025/01/P1021717-Kopie-scaled-e1736503004873.jpg" },
];

const N = SEGMENTS.length;
const HERO_SCENES = 1.3;       // scroll length of the logo hero
const FIT_SCENES = 0.85;       // scroll length per fit
const DIVE_SCENES = 1.1;       // dive-out: video fades + experiences rise over it
const TOTAL = HERO_SCENES + N * FIT_SCENES + DIVE_SCENES;
const HERO_END = HERO_SCENES / TOTAL;                       // fits take over
const FITS_END = (HERO_SCENES + N * FIT_SCENES) / TOTAL;    // fits done, dive-out begins

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

const sunWash = (
  <>
    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(255,196,46,0.78) 0%, rgba(244,123,32,0.60) 30%, rgba(0,175,219,0.42) 64%, rgba(26,163,199,0.58) 100%)" }} aria-hidden />
    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #ffc42e 0%, #f47b20 34%, #00afdb 70%, #1aa3c7 100%)", mixBlendMode: "soft-light" }} aria-hidden />
  </>
);

export function HeroFindYourFit({ src, poster, children }: { src: string; poster: string; children?: React.ReactNode }) {
  const wrapRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const sunWashRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<"video" | "static">("video");

  useEffect(() => {
    // Phones get the clean stacked version — the pinned, video-scrubbed scroll
    // (with overlapping absolute layers) only behaves on a wide viewport.
    if (window.matchMedia("(max-width: 640px)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setMode("static"); return; }
    const wrap = wrapRef.current, video = videoRef.current;
    if (!wrap || !video) return;
    let duration = 0, ready = false, current = 0;
    const onMeta = () => { duration = video.duration || 0; ready = duration > 0; video.play().then(() => video.pause()).catch(() => {}); };
    const onError = () => setMode("static");
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("error", onError);
    // If metadata already loaded before this listener attached (cached / fast load),
    // the event won't fire again — prime it now so scrubbing actually starts.
    if (video.readyState >= 1 && video.duration) onMeta();

    const progress = () => {
      const dist = wrap.offsetHeight - window.innerHeight;
      return dist <= 0 ? 0 : clamp(-wrap.getBoundingClientRect().top / dist);
    };

    let raf = 0, running = true;
    const tick = () => {
      const target = progress();
      current += (target - current) * 0.14;
      if (Math.abs(target - current) < 0.0005) current = target;
      const p = current;

      if (ready && duration) {
        const t = p * (duration - 0.05);
        if (video.readyState >= 1 && Math.abs(video.currentTime - t) > 0.01) {
          try { video.currentTime = t; } catch { /* seeking mid-load */ }
        }
      }
      if (zoomRef.current) zoomRef.current.style.transform = `scale(${1 + 0.1 * p})`;

      // hero logo fades out over the first part of its scene
      const he = clamp(p / (HERO_END * 0.7));
      if (heroRef.current) { heroRef.current.style.opacity = String(Math.max(1 - he * 1.2, 0)); heroRef.current.style.transform = `translateY(${-70 * he}px)`; heroRef.current.style.pointerEvents = he > 0.9 ? "none" : "auto"; }
      if (cueRef.current) cueRef.current.style.opacity = String(Math.max(1 - p / (HERO_END * 0.4), 0));

      // fit stage spans HERO_END..FITS_END; the dive-out spans FITS_END..1
      const fp = clamp((p - HERO_END) / (FITS_END - HERO_END));
      const fitIn = clamp((p - HERO_END * 0.85) / (HERO_END * 0.3));
      // dive-out: the whole video scene fades away over a full screen of scroll
      // (it keeps scrubbing the entire time) while the experiences rise up over it —
      // no hard line, and no empty blue because the cards cover as the video goes.
      const exit = clamp((p - FITS_END) / (1 - FITS_END));
      if (zoomRef.current) zoomRef.current.style.opacity = String(1 - exit);
      if (scrimRef.current) scrimRef.current.style.opacity = String(fitIn * (1 - exit));
      // centre dim — the fit copy sits in the middle now, so darken behind it for legibility
      if (centerRef.current) centerRef.current.style.opacity = String(fitIn * (1 - exit));
      // wash stays a tint from the very start (so the footage reads while it scrubs),
      // then eases further over the fits, then fades out with the rest
      if (sunWashRef.current) sunWashRef.current.style.opacity = String((0.6 - fitIn * 0.25) * (1 - exit));
      if (fitRef.current) { fitRef.current.style.opacity = String(fitIn * (1 - exit)); fitRef.current.style.pointerEvents = fitIn > 0.5 && exit < 0.4 ? "auto" : "none"; }
      if (railRef.current) railRef.current.style.height = `${fp * 100}%`;

      const idx = Math.min(N - 1, Math.floor(fp * N));
      if (idx !== activeRef.current) { activeRef.current = idx; setActive(idx); }

      raf = running ? requestAnimationFrame(tick) : 0;
    };

    const io = new IntersectionObserver(([e]) => { running = e.isIntersecting; if (running && !raf) raf = requestAnimationFrame(tick); else if (!running && raf) { cancelAnimationFrame(raf); raf = 0; } }, { threshold: 0 });
    io.observe(wrap);
    raf = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(raf); io.disconnect(); video.removeEventListener("loadedmetadata", onMeta); video.removeEventListener("error", onError); };
  }, []);

  function goTo(i: number) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const scrollable = wrap.offsetHeight - window.innerHeight;
    const docTop = window.scrollY + wrap.getBoundingClientRect().top;
    const targetP = HERO_END + ((i + 0.5) / N) * (FITS_END - HERO_END);
    window.scrollTo({ top: docTop + targetP * scrollable, behavior: "smooth" });
  }

  // Static fallback: plain hero + a simple stacked Find your fit
  if (mode === "static") {
    return (
      <>
        <section className="relative w-full h-[100svh] min-h-[640px] overflow-hidden">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${poster}')` }} aria-hidden />
          {sunWash}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_58%_48%_at_50%_42%,rgba(0,28,42,0.55)_0%,transparent_75%)]" aria-hidden />
          <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">{children}</div>
        </section>
        <section className="bg-[#00374a] py-16">
          <div className="max-w-[1100px] mx-auto px-6 grid sm:grid-cols-2 gap-5">
            {SEGMENTS.map((s) => (
              <FitDetail key={s.id} s={s} />
            ))}
          </div>
        </section>
      </>
    );
  }

  return (
    <section ref={wrapRef} id="find-your-fit" className="relative w-full bg-[#1aa3c7]" style={{ height: `${TOTAL * 100}vh` }}>
      <div className="sticky top-0 h-[100svh] min-h-[560px] overflow-hidden">
        {/* video backdrop — runs the whole way, then fades out into the ocean */}
        <div ref={zoomRef} className="absolute inset-0 will-change-transform">
          <video ref={videoRef} src={src} poster={poster} muted playsInline preload="auto" tabIndex={-1} aria-hidden disablePictureInPicture className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
        </div>
        <div ref={sunWashRef} className="absolute inset-0 will-change-[opacity]" style={{ opacity: 0.6 }}>{sunWash}</div>
        {/* readability vignette — dark top & bottom for the cards/detail, clear centre */}
        <div ref={scrimRef} className="absolute inset-0 pointer-events-none" style={{ opacity: 0, background: "linear-gradient(to bottom, rgba(0,30,45,0.9) 0%, rgba(0,30,45,0) 24%, rgba(0,18,28,0) 60%, rgba(0,16,26,0.95) 100%)" }} aria-hidden />
        {/* centre dim behind the (now-centred) fit copy, so it reads over the footage */}
        <div ref={centerRef} className="absolute inset-0 pointer-events-none" style={{ opacity: 0, background: "radial-gradient(ellipse 60% 50% at 50% 52%, rgba(0,26,40,0.62) 0%, rgba(0,26,40,0.34) 45%, transparent 72%)" }} aria-hidden />

        {/* HERO (scene 0) */}
        <div ref={heroRef} className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6 will-change-transform">{children}</div>

        {/* scroll cue */}
        <div ref={cueRef} className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-white/70 animate-bounce" aria-hidden>
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </div>

        {/* FIND YOUR FIT stage (scenes 1..N) — cards on top, detail centred at the foot */}
        <div ref={fitRef} className="absolute inset-0 z-20" style={{ opacity: 0 }}>
          {/* progress rail (far left) */}
          <div className="absolute left-4 sm:left-7 top-1/2 -translate-y-1/2 h-[34vh] w-[2px] rounded-full bg-white/20 z-10">
            <div ref={railRef} className="w-full rounded-full bg-[#8fe6f2]" style={{ height: "0%" }} />
            {SEGMENTS.map((_, i) => (
              <button key={i} aria-label={`Go to ${SEGMENTS[i].tag}`} onClick={() => goTo(i)} className="absolute -left-[8px] w-[18px] h-[18px] grid place-items-center" style={{ top: `calc(${(i / (N - 1)) * 100}% - 9px)` }}>
                <span className={`block rounded-full transition-all ${active === i ? "w-[10px] h-[10px] bg-[#8fe6f2] shadow-[0_0_12px_rgba(143,230,242,0.9)]" : "w-[6px] h-[6px] bg-white/50"}`} />
              </button>
            ))}
          </div>

          {/* overview cards — top, centred, clear of the fixed nav */}
          <div className="absolute top-0 inset-x-0 pt-[104px] sm:pt-[120px] px-5 flex flex-col items-center z-10">
            <p className="text-[12px] sm:text-[13px] font-bold tracking-[0.3em] text-[#8fe6f2] mb-1.5 fyf-copy">FIND YOUR FIT</p>
            <h2 className="text-xl sm:text-[26px] font-black tracking-[-0.02em] text-white text-center mb-5 fyf-copy">Whatever brings you to the water</h2>
            <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3.5 max-w-[920px]">
              {SEGMENTS.map((s, i) => {
                const on = i === active;
                return (
                  <button key={s.id} onClick={() => goTo(i)} aria-current={on} className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl border transition-all ${on ? "bg-white text-[#00374a] border-white shadow-[0_14px_38px_rgba(0,20,30,0.45)] scale-[1.04]" : "bg-white/[0.12] text-white border-white/25 backdrop-blur-md hover:bg-white/[0.2]"}`}>
                    <span className={`shrink-0 ${on ? "text-[#00afdb]" : "text-[#8fe6f2]"}`}>{s.icon}</span>
                    <span className="text-left">
                      <span className="block text-[14.5px] font-extrabold leading-tight">{s.tag}</span>
                      <span className={`block text-[12px] leading-tight ${on ? "text-[#5a6b72]" : "text-white/65"}`}>{s.chip}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* active feature — centred, large, grabs attention right away */}
          <div className="absolute inset-0 px-6 flex items-center justify-center z-10 pt-[300px] pb-14 sm:pt-[112px] sm:pb-16">
            <div className="relative w-full max-w-[760px] min-h-[250px] sm:min-h-[280px]">
              {SEGMENTS.map((s, i) => {
                const on = i === active;
                return (
                  <div key={s.id} aria-hidden={!on} className="fyf-card fyf-copy absolute inset-0 flex flex-col items-center justify-center text-center" style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(20px)", pointerEvents: on ? "auto" : "none" }}>
                    <h3 className="text-3xl sm:text-5xl font-black tracking-[-0.02em] text-white leading-[1.04] mb-4">{s.title}</h3>
                    <p className="text-[16px] sm:text-[19px] text-white/90 leading-relaxed mb-6 max-w-[620px] mx-auto">{s.body}</p>
                    <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mb-7 max-w-[680px] mx-auto">
                      {s.points.map((p) => (
                        <span key={p} className="inline-flex items-center gap-2 text-[13.5px] sm:text-[14.5px] text-white/85 font-medium">
                          <span className="shrink-0 w-4 h-4 rounded-full bg-[#8fe6f2]/25 text-[#8fe6f2] grid place-items-center">
                            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                          </span>
                          {p}
                        </span>
                      ))}
                    </div>
                    <Link href="#experiences" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-[14px] font-bold text-[#00374a] bg-[#ffc42e] shadow-[0_6px_22px_rgba(255,196,46,0.32)] hover:bg-[#ffce52] hover:-translate-y-0.5 transition-all">
                      {s.cta}
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .fyf-card { transition: opacity .5s ease, transform .5s ease; }
        .fyf-copy h3, .fyf-copy p, .fyf-copy li { text-shadow: 0 1px 16px rgba(0,20,30,0.55); }
        @media (prefers-reduced-motion: reduce) { .fyf-card { transition: none; } }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
}

function FitDetail({ s, overlay }: { s: Segment; overlay?: boolean }) {
  return (
    <div className={overlay ? "relative h-full flex flex-col justify-end p-6 sm:p-10" : "rounded-[24px] overflow-hidden relative min-h-[300px] flex flex-col justify-end p-7 bg-[#00374a]"}>
      {!overlay && (<><div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${s.image}')` }} /><div className="absolute inset-0 bg-gradient-to-t from-[#00374a] via-[#00374a]/55 to-transparent" /></>)}
      <div className="relative">
        <span className="self-start inline-block text-[10px] font-extrabold tracking-[0.2em] uppercase px-3 py-1.5 rounded-full bg-white/90 text-[#00374a] mb-4">{s.tag}</span>
        <h3 className="text-2xl sm:text-[32px] font-black tracking-[-0.02em] text-white leading-[1.05] mb-3">{s.title}</h3>
        <p className="text-[14.5px] sm:text-[15.5px] text-white/75 leading-relaxed mb-5 max-w-[560px]">{s.body}</p>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mb-6 max-w-[620px]">
          {s.points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-[13.5px] text-white/85 font-medium">
              <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-[#8fe6f2]/20 text-[#8fe6f2] grid place-items-center">
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              {p}
            </li>
          ))}
        </ul>
        <Link href="#experiences" className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-[13.5px] font-bold text-[#00374a] bg-[#ffc42e] shadow-[0_4px_16px_rgba(255,196,46,0.28)] hover:bg-[#ffce52] hover:-translate-y-0.5 transition-all">
          {s.cta}
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
      </div>
    </div>
  );
}
