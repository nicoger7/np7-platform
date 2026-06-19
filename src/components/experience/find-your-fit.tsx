"use client";

import Link from "next/link";
import { useRef, useState, useEffect, useCallback } from "react";

/**
 * "Find your fit" — a pinned, scroll-driven self-segmentation module. As you scroll
 * through the section it stays pinned: the overview of every fit is always visible
 * (click one to jump straight to it), the active fit's detail flies through, and a
 * progress rail on the left tracks where you are. Degrades to a simple stacked view
 * on small screens.
 */

type Segment = {
  id: string;
  chip: string;
  icon: React.ReactNode;
  tag: string;
  title: string;
  body: string;
  points: string[];
  cta: string;
  image: string;
};

const I = {
  flame: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 2c1 3 4 4.5 4 8a4 4 0 11-8 0c0-1.2.4-2 1-3 .2 1.2 1 1.8 1.8 2-.2-2.4 0-5 1.2-7z" /><path d="M8.5 14a3.5 3.5 0 007 0" /></svg>
  ),
  cycle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M3 12a9 9 0 0115-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 01-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
  ),
  sprout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 22V12" /><path d="M12 12C12 8 9 6 5 6c0 4 3 6 7 6z" /><path d="M12 14c0-3 3-5 7-5 0 3-3 5-7 5z" /></svg>
  ),
  duo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M2 20c0-3 2.5-5 6-5s6 2 6 5" /><path d="M16 15c2.5 0 4 1.6 4 4" /></svg>
  ),
};

const SEGMENTS: Segment[] = [
  {
    id: "enthusiast", chip: "I live for it", icon: I.flame, tag: "The enthusiast",
    title: "You already love the ride.",
    body: "You windsurf as much as you can and you want to go further — faster planing, cleaner jibes, your first moves. This is where you level up.",
    points: ["Coaching from one of the world's best", "Daily video analysis to break plateaus", "The best spots & conditions we can find", "A crew on your level that pushes you"],
    cta: "See advanced trips",
    image: "https://surfcenter-experience.com/wp-content/uploads/2025/11/Balz_Muller-5.jpg",
  },
  {
    id: "returnee", chip: "I'm getting back into it", icon: I.cycle, tag: "The comeback",
    title: "Back on the water after a break.",
    body: "It's been a few years and you're not sure what you've still got. Don't worry — it comes back fast, and we make the whole thing easy.",
    points: ["Patient coaching that meets you where you are", "Small groups, zero pressure", "All gear sorted — just turn up and sail", "You'll be planing again by day two"],
    cta: "Find your week",
    image: "https://surfcenter-experience.com/wp-content/uploads/2025/11/Rossmeier-2.jpg",
  },
  {
    id: "beginner", chip: "I'm just starting", icon: I.sprout, tag: "The first-timer",
    title: "Your first real sessions.",
    body: "New to windsurfing, or only had a lesson or two? You'll be amazed how far you get in a week with the right coach and good conditions.",
    points: ["A dedicated beginner coach", "From zero to planing in a week", "Beginner-friendly gear included", "Completely at your own pace"],
    cta: "See beginner-friendly trips",
    image: "https://surfcenter-experience.com/wp-content/uploads/2025/01/53724070151_54cd73586b_k-1536x1024.jpg",
  },
  {
    id: "together", chip: "I'm bringing someone", icon: I.duo, tag: "Together",
    title: "Make it a trip for two.",
    body: "Whether they ride or relax — bring your person. One of you chases the wind while the other soaks up the island, and the evenings are yours together.",
    points: ["Add a beginner or non-riding package", "They get the island: beach, dinners, downtime", "Lessons for them whenever they're curious", "Same hotel, same sunsets, shared memories"],
    cta: "Plan a trip for two",
    image: "https://surfcenter-experience.com/wp-content/uploads/2025/01/P1021717-Kopie-scaled-e1736503004873.jpg",
  },
];

const N = SEGMENTS.length;

export function FindYourFit() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0); // 0..1 across the pinned section
  const [active, setActive] = useState(0);
  const raf = useRef(0);

  const measure = useCallback(() => {
    const el = sectionRef.current;
    if (!el) return;
    const scrollable = el.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return;
    const p = Math.min(1, Math.max(0, -el.getBoundingClientRect().top / scrollable));
    setProgress(p);
    setActive(Math.min(N - 1, Math.floor(p * N)));
  }, []);

  useEffect(() => {
    const onScroll = () => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [measure]);

  function goTo(i: number) {
    const el = sectionRef.current;
    if (!el) return;
    const scrollable = el.offsetHeight - window.innerHeight;
    const docTop = window.scrollY + el.getBoundingClientRect().top;
    const targetP = (i + 0.5) / N;
    window.scrollTo({ top: docTop + targetP * scrollable, behavior: "smooth" });
  }

  return (
    <section ref={sectionRef} id="find-your-fit" className="relative" style={{ height: `${N * 100}vh` }}>
      <div className="sticky top-0 h-screen overflow-hidden flex items-center">
        {/* progress rail */}
        <div className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 h-[46vh] w-[3px] rounded-full bg-white/12">
          <div className="w-full rounded-full bg-[#8fe6f2]" style={{ height: `${progress * 100}%`, transition: "height 120ms linear" }} />
          {SEGMENTS.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to ${SEGMENTS[i].tag}`}
              onClick={() => goTo(i)}
              className="absolute -left-[6px] w-[15px] h-[15px] grid place-items-center"
              style={{ top: `calc(${(i / (N - 1)) * 100}% - 7px)` }}
            >
              <span className={`block rounded-full transition-all ${active === i ? "w-[11px] h-[11px] bg-[#8fe6f2] shadow-[0_0_10px_rgba(143,230,242,0.8)]" : "w-[7px] h-[7px] bg-white/40"}`} />
            </button>
          ))}
        </div>

        <div className="w-full max-w-[1180px] mx-auto px-10 sm:px-16 grid lg:grid-cols-[300px_1fr] gap-7 lg:gap-14 items-center">
          {/* OVERVIEW — always visible */}
          <div className="relative z-10">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#8fe6f2] mb-3">FIND YOUR FIT</p>
            <h2 className="text-2xl sm:text-4xl font-black tracking-[-0.03em] text-white mb-2 leading-[1.05]">Whatever brings you to the water</h2>
            <p className="text-[14px] text-white/60 leading-relaxed mb-5 hidden lg:block">Scroll through — or jump straight to the one that&apos;s you.</p>
            <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible scrollbar-hide -mx-2 px-2 lg:mx-0 lg:px-0">
              {SEGMENTS.map((s, i) => {
                const on = i === active;
                return (
                  <button
                    key={s.id}
                    onClick={() => goTo(i)}
                    aria-current={on}
                    className={`shrink-0 lg:w-full flex items-center gap-3 text-left px-4 py-3 rounded-2xl border transition-all ${
                      on ? "bg-white text-[#00374a] border-white shadow-[0_8px_24px_rgba(0,20,30,0.25)]" : "bg-white/[0.06] text-white/80 border-white/12 hover:border-[#8fe6f2]/60"
                    }`}
                  >
                    <span className={`shrink-0 ${on ? "text-[#00afdb]" : "text-[#8fe6f2]"}`}>{s.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-extrabold leading-tight">{s.tag}</span>
                      <span className={`block text-[12px] leading-tight ${on ? "text-[#5a6b72]" : "text-white/50"}`}>{s.chip}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* DETAIL — flies through as the active fit changes */}
          <div className="relative h-[58vh] lg:h-[72vh]">
            {SEGMENTS.map((s, i) => {
              const on = i === active;
              return (
                <div
                  key={s.id}
                  aria-hidden={!on}
                  className="fyf-card absolute inset-0 rounded-[28px] overflow-hidden border border-white/10 shadow-[0_30px_70px_rgba(0,20,30,0.4)]"
                  style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(28px) scale(0.985)", pointerEvents: on ? "auto" : "none" }}
                >
                  <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${s.image}')` }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#00374a] via-[#00374a]/60 to-[#00374a]/5" />
                  <div className="relative h-full flex flex-col justify-end p-6 sm:p-10">
                    <span className="self-start text-[10px] font-extrabold tracking-[0.2em] uppercase px-3 py-1.5 rounded-full bg-white/90 text-[#00374a] mb-4">{s.tag}</span>
                    <h3 className="text-2xl sm:text-[34px] font-black tracking-[-0.02em] text-white leading-[1.05] mb-3">{s.title}</h3>
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
                    <div>
                      <Link href="#experiences" className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-[13.5px] font-bold text-[#00374a] bg-[#ffc42e] shadow-[0_4px_16px_rgba(255,196,46,0.28)] hover:bg-[#ffce52] hover:-translate-y-0.5 transition-all">
                        {s.cta}
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        .fyf-card { transition: opacity .5s ease, transform .5s ease; }
        @media (prefers-reduced-motion: reduce) { .fyf-card { transition: none; } }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
}
