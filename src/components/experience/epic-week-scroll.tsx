"use client";

import { useEffect, useRef, useState } from "react";
import { Reveal } from "./reveal";

/**
 * "Your epic week" — a pinned, scroll-driven walk through the trip outcomes.
 *
 * Same feel as the homepage Find-Your-Fit, but the backdrop is static (no scrubbed
 * video): a dark panel with each outcome's photo carried on its own card. As you
 * scroll, the cards fly through one at a time; the overview on the left stays
 * visible and is click-to-jump, with a progress rail. Falls back to a plain stack
 * when motion is reduced or the viewport is too short to pin comfortably.
 */

type Outcome = { icon: string; t: string; d: string };

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

function Icon({ name }: { name: string }) {
  const c = "w-5 h-5";
  const p = { fill: "none" as const, stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "bolt": return <svg className={c} viewBox="0 0 24 24" {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>;
    case "gauge": return <svg className={c} viewBox="0 0 24 24" {...p}><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4.5-4.5" /></svg>;
    case "rotate": return <svg className={c} viewBox="0 0 24 24" {...p}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 4v5h-5" /></svg>;
    case "idea": return <svg className={c} viewBox="0 0 24 24" {...p}><path d="M9 18h6" /><path d="M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></svg>;
    case "globe": return <svg className={c} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" /></svg>;
    case "camera": return <svg className={c} viewBox="0 0 24 24" {...p}><path d="M3 9a2 2 0 0 1 2-2h2l1.5-2h7L19 7h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" /><circle cx="12" cy="13" r="3.5" /></svg>;
    default: return null;
  }
}

/**
 * One coaching level's version of this section.
 *
 * A week sold to beginners and a week sold to advanced riders promise
 * different things, and one shared list had to describe both — so it described
 * neither. Each level carries its own title and cards; a level the team has not
 * written yet simply falls back to the shared copy, which is why turning this
 * on changes nothing until someone actually writes the level-specific version.
 */
export type LevelVariant = {
  /** exp_packages.category — "beginner", "advanced", … */
  key: string;
  /** What the chip says. */
  label: string;
  title: string;
  outcomes: Outcome[];
  images: string[];
};

export function EpicWeekScroll({
  outcomes,
  images,
  eyebrow,
  title,
  intro,
  weekInfo,
  levels,
}: {
  outcomes: Outcome[];
  images: string[];
  eyebrow: string;
  title: string;
  intro: string;
  weekInfo?: string | null;
  /** Levels this experience actually sells. Fewer than two → no selector. */
  levels?: LevelVariant[];
}) {
  // The selector only exists where there is a genuine choice to make: an
  // experience with one coaching level shows exactly what it showed before.
  const variants = (levels ?? []).length >= 2 ? levels! : null;
  const [levelIdx, setLevelIdx] = useState(0);
  const shown = variants?.[levelIdx];
  if (shown) {
    outcomes = shown.outcomes;
    images = shown.images;
    title = shown.title;
  }
  const N = outcomes.length;
  const sectionRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const [enabled, setEnabled] = useState(true);

  // pinned fly on desktop only — phones get a clean reveal grid (the pinned two-column
  // scroll cramps on mobile: weird spacing + the images cross-fade into each other)
  useEffect(() => {
    const compute = () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setEnabled(!reduce && window.innerWidth >= 1024 && window.innerHeight > 540);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const section = sectionRef.current, inner = innerRef.current;
    if (!section || !inner) return;
    let raf = 0, running = true, current = -1; // eased scroll progress (−1 = uninitialised)

    const targetProgress = () => {
      const scrollable = section.offsetHeight - inner.offsetHeight;
      return clamp(-section.getBoundingClientRect().top / Math.max(1, scrollable));
    };

    const render = (p: number) => {
      if (railRef.current) railRef.current.style.height = `${p * 100}%`;
      // each card flies up with the scroll: in from below, out through the top.
      // An eased curve makes it dwell near the centre (slow to pass) then fly out fast.
      const cont = p * N;                       // 0..N continuous position
      const dist = inner.offsetHeight * (window.innerWidth < 1024 ? 0.5 : 0.72); // travel per card
      for (let i = 0; i < N; i++) {
        const el = cardRefs.current[i];
        if (!el) continue;
        let d = cont - (i + 0.5);               // <0 below (incoming), >0 above (gone)
        // first card is already next to the text on the way in; last card stays
        // next to the text on the way out (neither flies off past the centre)
        if (i === 0) d = Math.max(0, d);
        if (i === N - 1) d = Math.min(0, d);
        const ad = Math.abs(d);
        const eased = Math.sign(d) * Math.pow(ad, 1.7) * 1.85;   // flat near centre → dwell
        const op = clamp(1 - Math.max(0, ad - 0.14) * 1.55);     // hold full opacity at centre
        el.style.opacity = String(op);
        el.style.transform = `translateY(${-eased * dist}px)`;
        el.style.pointerEvents = op > 0.6 ? "auto" : "none";
      }
      const idx = clamp(Math.floor(cont), 0, N - 1);
      if (idx !== activeRef.current) { activeRef.current = idx; setActive(idx); }
    };

    // continuous loop: the cards smoothly catch up to the scroll (temporal easing),
    // same feel as the hero video scrub
    const tick = () => {
      const target = targetProgress();
      if (current < 0) current = target;       // first frame: snap, don't sweep from 0
      current += (target - current) * 0.13;
      if (Math.abs(target - current) < 0.0004) current = target;
      render(current);
      raf = running ? requestAnimationFrame(tick) : 0;
    };

    const io = new IntersectionObserver(([e]) => {
      running = e.isIntersecting;
      if (running && !raf) raf = requestAnimationFrame(tick);
      else if (!running && raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0 });
    io.observe(section);
    raf = requestAnimationFrame(tick);

    return () => { running = false; cancelAnimationFrame(raf); io.disconnect(); };
  }, [enabled, N]);

  function goTo(i: number) {
    const section = sectionRef.current, inner = innerRef.current;
    if (!section || !inner) return;
    const scrollable = section.offsetHeight - inner.offsetHeight;
    const targetP = (i + 0.5) / N;
    window.scrollTo({ top: section.offsetTop + targetP * scrollable, behavior: "smooth" });
  }

  const img = (i: number) => (images.length ? images[i % images.length] : null);

  // The level switcher sits ABOVE the whole module — its own centred moment,
  // not a control buried in a text column. A quiet "SEE THE WEEK AS" line, then
  // one white segmented pill. Shared by both layout modes; absent entirely on
  // one-level experiences.
  const levelSwitcher = variants ? (
    <div className="bg-[#f6f9fa] pt-12 sm:pt-16 pb-1 text-center">
      <p className="text-[10.5px] font-bold tracking-[0.3em] uppercase text-[#8aa0a8] mb-3.5">See the week as</p>
      <div className="inline-flex items-center gap-1 rounded-full bg-white border border-[#e2e9ec] p-1.5 shadow-[0_10px_34px_rgba(0,55,74,0.10)]" role="tablist" aria-label="Coaching level">
        {variants.map((v, i) => {
          const on = i === levelIdx;
          return (
            <button
              key={v.key} type="button" role="tab" aria-selected={on}
              onClick={() => setLevelIdx(i)}
              className={`px-7 sm:px-9 py-2.5 rounded-full text-[14.5px] sm:text-[15px] font-bold transition-all ${
                on ? "bg-[#00afdb] text-white shadow-[0_6px_18px_rgba(0,175,219,0.35)]" : "text-[#5a6b72] hover:text-[#00374a]"
              }`}
            >
              {v.label}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  // ---- static fallback: clean wrapping grid (mobile / reduced-motion) ------
  if (!enabled) {
    return (
      <>
      {levelSwitcher}
      <section className={`${variants ? "pt-7 sm:pt-9" : "pt-14 sm:pt-20"} pb-14 sm:pb-20 bg-[#f6f9fa] text-[#00374a]`}>
        <div className="max-w-[1080px] mx-auto px-5 sm:px-8">
          <div className="max-w-[640px] mb-8 sm:mb-10">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">{eyebrow}</p>
            <h2 className="text-[28px] sm:text-5xl font-black tracking-[-0.03em] leading-[1.08] mb-3 sm:mb-4">{title}</h2>
            <p className="text-[15px] sm:text-[16px] text-[#6a7a80] leading-relaxed">{intro}</p>
            {weekInfo && <p className="text-[14px] text-[#7a8a90] leading-relaxed mt-3 whitespace-pre-line">{weekInfo}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {outcomes.map((o, i) => (
              <Reveal key={o.t} as="article" from="up" delay={(i % 2) * 90} className="relative min-h-[230px] sm:min-h-[250px] rounded-3xl overflow-hidden bg-[#012c3b] flex flex-col justify-end">
                {img(i) && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${img(i)}')` }} />}
                <div className="absolute inset-0 bg-gradient-to-t from-[#00263a] via-[#00374a]/55 to-[#00374a]/5" />
                <div className="relative p-5 sm:p-6">
                  <span className="inline-grid place-items-center w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-sm text-[#8fe6f2] mb-3" aria-hidden><Icon name={o.icon} /></span>
                  <h3 className="text-[17px] sm:text-[18px] font-black tracking-[-0.01em] leading-[1.2] text-white">{o.t}</h3>
                  <p className="text-[13.5px] text-white/80 leading-relaxed mt-1.5">{o.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      </>
    );
  }

  // ---- pinned scroll -------------------------------------------------------
  return (
    <>
    {levelSwitcher}
    <section ref={sectionRef} className="relative bg-[#f6f9fa]" style={{ height: `${N * 80 + 50}vh` }}>
      <div ref={innerRef} className="sticky top-0 h-[100svh] overflow-hidden text-[#00374a]">
        {/* soft light backdrop — cool sea glow + a warm sun glow (sun to sea) */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_72%_-5%,rgba(0,175,219,0.10),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_6%_104%,rgba(244,123,32,0.15),transparent_52%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_96%_-8%,rgba(255,150,60,0.1),transparent_46%)]" />

        {/* progress rail (desktop) */}
        <div className="hidden lg:block absolute left-4 sm:left-7 top-1/2 -translate-y-1/2 h-[42vh] w-[2px] rounded-full bg-[#00374a]/12 z-10">
          <div ref={railRef} className="w-full rounded-full bg-[#00afdb]" style={{ height: "0%" }} />
          {outcomes.map((_, i) => (
            <button key={i} aria-label={`Go to ${outcomes[i].t}`} onClick={() => goTo(i)} className="absolute -left-[8px] w-[18px] h-[18px] grid place-items-center" style={{ top: `calc(${(i / (N - 1)) * 100}% - 9px)` }}>
              <span className={`block rounded-full transition-all ${active === i ? "w-[10px] h-[10px] bg-[#00afdb] shadow-[0_0_12px_rgba(0,175,219,0.5)]" : "w-[6px] h-[6px] bg-[#00374a]/25"}`} />
            </button>
          ))}
        </div>

        <div className="relative h-full max-w-[1180px] mx-auto px-5 sm:px-12 lg:px-16 grid lg:grid-cols-[290px_1fr] gap-5 lg:gap-14 items-center">
          {/* overview */}
          <div className="relative">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">{eyebrow}</p>
            <h2 className="text-2xl sm:text-[34px] font-black tracking-[-0.03em] text-[#00374a] mb-3 leading-[1.06]">{title}</h2>
            <p className="text-[13.5px] text-[#6a7a80] leading-relaxed mb-5 hidden lg:block">{intro}</p>
            {/* "About the week" from the admin. It rendered ONLY in the static
                fallback below, so on any desktop with animations on — i.e. the
                page as Nico actually views it — the field went nowhere and the
                admin hint pointed at a paragraph that did not exist. */}
            {weekInfo && <p className="text-[12.5px] text-[#7a8a90] leading-relaxed -mt-2 mb-5 whitespace-pre-line hidden lg:block">{weekInfo}</p>}

            <div className="hidden lg:flex lg:flex-col gap-2">
              {outcomes.map((o, i) => {
                const on = i === active;
                return (
                  <button key={o.t} onClick={() => goTo(i)} aria-current={on} className={`shrink-0 lg:w-full flex items-center gap-3 text-left px-3.5 py-2.5 rounded-2xl border transition-all ${on ? "bg-[#00afdb]/[0.08] border-[#00afdb]/45 text-[#00374a] shadow-[0_6px_18px_rgba(0,175,219,0.12)]" : "bg-white border-[#e3e9ec] text-[#5a6b72] hover:text-[#00374a] hover:border-[#bcd]"}`}>
                    <span className={`shrink-0 ${on ? "text-[#00afdb]" : "text-[#9aa6ac]"}`}><Icon name={o.icon} /></span>
                    <span className="block text-[13px] font-bold leading-tight">{o.t}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* detail cards fly up with the scroll: in from below, out through the top */}
          <div className="relative h-[60vh] lg:h-[66vh]">
            {outcomes.map((o, i) => (
                <article key={o.t} ref={(el) => { cardRefs.current[i] = el; }} aria-hidden={i !== active} className="epic-card absolute inset-0 rounded-[28px] overflow-hidden border border-black/[0.06] shadow-[0_30px_70px_rgba(0,30,45,0.3)]" style={{ willChange: "transform, opacity" }}>
                  {img(i) && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${img(i)}')` }} />}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#00263a] via-[#00374a]/55 to-[#00374a]/5" />
                  <div className="absolute inset-0 flex flex-col justify-end p-8 sm:p-12">
                    <span className="inline-grid place-items-center w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm text-[#8fe6f2] mb-4" aria-hidden><Icon name={o.icon} /></span>
                    <span className="text-[11px] font-bold tracking-[0.2em] text-[#8fe6f2] mb-2">{String(i + 1).padStart(2, "0")} / {String(N).padStart(2, "0")}</span>
                    <h3 className="text-3xl sm:text-[42px] font-black tracking-[-0.02em] leading-[1.04] mb-3 max-w-[640px] text-white">{o.t}</h3>
                    <p className="text-[15px] sm:text-[17px] text-white/85 leading-relaxed max-w-[560px]">{o.d}</p>
                  </div>
                </article>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .epic-card { transition: none; opacity: 0; }
      `}</style>
    </section>
    </>
  );
}
