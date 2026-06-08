"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * "Find your fit" — a self-segmentation module. The visitor taps the profile
 * that sounds like them and instantly sees how NP7 caters to them, plus a soft
 * CTA. Lets every target group recognise themselves without a wall of text.
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
    id: "enthusiast",
    chip: "I live for it",
    icon: I.flame,
    tag: "The enthusiast",
    title: "You already love the ride.",
    body: "You windsurf as much as you can and you want to go further — faster planing, cleaner jibes, your first moves. This is where you level up.",
    points: [
      "Coaching from one of the world's best",
      "Daily video analysis to break plateaus",
      "The best spots & conditions we can find",
      "A crew on your level that pushes you",
    ],
    cta: "See advanced trips",
    image: "https://surfcenter-experience.com/wp-content/uploads/2025/11/Balz_Muller-5.jpg",
  },
  {
    id: "returnee",
    chip: "I'm getting back into it",
    icon: I.cycle,
    tag: "The comeback",
    title: "Back on the water after a break.",
    body: "It's been a few years and you're not sure what you've still got. Don't worry — it comes back fast, and we make the whole thing easy.",
    points: [
      "Patient coaching that meets you where you are",
      "Small groups, zero pressure",
      "All gear sorted — just turn up and sail",
      "You'll be planing again by day two",
    ],
    cta: "Find your week",
    image: "https://surfcenter-experience.com/wp-content/uploads/2025/11/Rossmeier-2.jpg",
  },
  {
    id: "beginner",
    chip: "I'm just starting",
    icon: I.sprout,
    tag: "The first-timer",
    title: "Your first real sessions.",
    body: "New to windsurfing, or only had a lesson or two? You'll be amazed how far you get in a week with the right coach and good conditions.",
    points: [
      "A dedicated beginner coach",
      "From zero to planing in a week",
      "Beginner-friendly gear included",
      "Completely at your own pace",
    ],
    cta: "See beginner-friendly trips",
    image: "https://surfcenter-experience.com/wp-content/uploads/2025/01/53724070151_54cd73586b_k-1536x1024.jpg",
  },
  {
    id: "together",
    chip: "I'm bringing someone",
    icon: I.duo,
    tag: "Together",
    title: "Make it a trip for two.",
    body: "Whether they ride or relax — bring your person. One of you chases the wind while the other soaks up the island, and the evenings are yours together.",
    points: [
      "Add a beginner or non-riding package",
      "They get the island: beach, dinners, downtime",
      "Lessons for them whenever they're curious",
      "Same hotel, same sunsets, shared memories",
    ],
    cta: "Plan a trip for two",
    image: "https://surfcenter-experience.com/wp-content/uploads/2025/01/P1021717-Kopie-scaled-e1736503004873.jpg",
  },
];

export function FindYourFit() {
  const [active, setActive] = useState(0);
  const seg = SEGMENTS[active];

  return (
    <section id="find-your-fit" className="scroll-mt-20 bg-white py-20 sm:py-28">
      <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
        <div className="text-center max-w-[620px] mx-auto mb-10">
          <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">FIND YOUR FIT</p>
          <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mb-4">Whatever brings you to the water</h2>
          <p className="text-[16px] text-[#6a7a80] leading-relaxed">Tap what sounds like you — and see how we&apos;ll look after you.</p>
        </div>

        {/* chips */}
        <div role="tablist" aria-label="Who are you?" className="flex flex-wrap justify-center gap-2.5 mb-10">
          {SEGMENTS.map((s, i) => {
            const on = i === active;
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={on}
                onClick={() => setActive(i)}
                className={`inline-flex items-center gap-2 px-4 sm:px-5 py-3 rounded-full text-[13.5px] font-bold border transition-all ${
                  on
                    ? "bg-[#00374a] text-white border-[#00374a] shadow-[0_8px_24px_rgba(0,55,74,0.18)]"
                    : "bg-white text-[#3a4b52] border-[#e3e9ec] hover:border-[#00afdb] hover:text-[#00374a]"
                }`}
              >
                <span className={on ? "text-[#5fd0e8]" : "text-[#00afdb]"}>{s.icon}</span>
                {s.chip}
              </button>
            );
          })}
        </div>

        {/* panel */}
        <div
          key={seg.id}
          role="tabpanel"
          className="fyf-anim grid lg:grid-cols-2 rounded-[28px] overflow-hidden border border-[#ebeef0] bg-[#f7fbfc] shadow-[0_20px_60px_rgba(0,55,74,0.08)]"
        >
          <div className="relative min-h-[280px] lg:min-h-[420px]">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${seg.image}')` }} />
            <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-black/45 to-transparent" />
            <span className="absolute top-5 left-5 text-[10px] font-extrabold tracking-[0.2em] uppercase px-3 py-1.5 rounded-full bg-white/90 text-[#00374a]">{seg.tag}</span>
          </div>

          <div className="p-8 sm:p-11 flex flex-col justify-center">
            <h3 className="text-2xl sm:text-[32px] font-black tracking-[-0.02em] text-[#00374a] leading-[1.08] mb-4">{seg.title}</h3>
            <p className="text-[15.5px] text-[#5a6b72] leading-relaxed mb-6">{seg.body}</p>
            <ul className="space-y-3 mb-8">
              {seg.points.map((p) => (
                <li key={p} className="flex items-start gap-3 text-[15px] text-[#23363d] font-medium">
                  <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-[#00afdb]/12 text-[#00afdb] grid place-items-center">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <div>
              <Link
                href="#experiences"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-[14px] font-bold text-white bg-[#00afdb] shadow-[0_4px_18px_rgba(0,175,219,0.3)] hover:bg-[#15c0ec] hover:-translate-y-0.5 transition-all"
              >
                {seg.cta}
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fyfIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .fyf-anim { animation: fyfIn .42s ease; }
        @media (prefers-reduced-motion: reduce) { .fyf-anim { animation: none; } }
      `}</style>
    </section>
  );
}
