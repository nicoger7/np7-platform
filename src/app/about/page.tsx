import Link from "next/link";
import type { Metadata } from "next";
import { flags } from "@/lib/flags";
import { SectionHeader } from "@/components/shared/section-header";
import { SECTION_VARS } from "@/components/shared/section-world";
import { BlogFooter } from "@/components/blog/blog-footer";

export const metadata: Metadata = {
  title: "About — NP7",
  description:
    "NP7 is Nico Prien (GER-7): two worlds, one passion — premium watersports travel & coaching, and custom boards & fins shaped by hand.",
};

const secondaryCta =
  "px-7 py-3.5 rounded-full text-[14px] font-bold border-[1.5px] border-white/50 text-white hover:bg-white/10 transition-all";

const WORLDS = [
  {
    href: "/experience",
    eyebrow: "NP7 EXPERIENCE",
    title: "Travel, coaching & community",
    body: "Guided windsurf, wing & foil trips around the planet — world-class coaching, hand-picked crews, and everything arranged. You arrive solo and leave with a crew.",
    accent: "#00afdb",
  },
  {
    href: "/hardware",
    eyebrow: "NP7 HARDWARE",
    title: "Custom boards & fins",
    body: "Boards and fins shaped on the bench and finished by hand — built around how you ride, not the other way round.",
    accent: "#1f9e57",
  },
];

export default function AboutPage() {
  // `?from=` (carried by the header link) and the np7_section cookie are both
  // request APIs, and reading either one costs this page its prerender. The
  // world is settled in the browser instead (section-world.tsx) — including the
  // `?from=` precedence — so the chrome is CSS variables.
  const chrome = SECTION_VARS;

  return (
    <>
      <SectionHeader />

      {/* ---------------------------------------------------------------- HERO */}
      <section className="relative text-white pt-16 pb-14 overflow-hidden" style={{ background: chrome.heroBackground }}>
        <div className="relative max-w-[820px] mx-auto px-6 sm:px-8">
          <p className="text-[11px] font-bold tracking-[0.25em] mb-3" style={{ color: chrome.eyebrow }}>NICO PRIEN · GER-7</p>
          <h1 className="text-4xl sm:text-6xl font-black tracking-[-0.03em] leading-[1.02]">Two worlds,<br />one passion.</h1>
          <span className="block h-1.5 w-28 rounded-full mt-5" style={{ background: chrome.stripe }} />
          <p className="mt-5 text-[17px] sm:text-[19px] text-white/75 leading-relaxed max-w-[640px]">
            NP7 is Nico Prien — top-ranked windsurfer, GER-7, and the biggest windsurf channel on YouTube.
            One obsession with the water, split across two worlds.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- STORY */}
      <section className="bg-white py-16 sm:py-20">
        <div className="max-w-[760px] mx-auto px-6 sm:px-8">
          <div className="space-y-5 text-[16px] sm:text-[17px] text-[#5a6b72] leading-relaxed">
            <p>
              NP7 grew out of a simple idea: the best part of this sport isn&apos;t just the riding — it&apos;s the
              people you ride with and the gear that gets you there. So it became two things that feed each other.
            </p>
            <p>
              On one side, <strong className="font-bold text-[#00374a]">Experience</strong> — premium watersports travel,
              coaching and community. On the other, <strong className="font-bold text-[#00374a]">Hardware</strong> — custom
              boards and fins shaped by hand. Same passion, same standards, two ways in.
            </p>
          </div>

          {/* the two worlds */}
          <div className="grid sm:grid-cols-2 gap-5 mt-12">
            {WORLDS.map((w) => (
              <Link
                key={w.href}
                href={w.href}
                className="group rounded-2xl border border-[#ece3d3] bg-[#fdfaf3] p-7 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(0,55,74,0.10)] transition-all"
              >
                <p className="text-[11px] font-bold tracking-[0.18em] mb-2" style={{ color: w.accent }}>{w.eyebrow}</p>
                <h2 className="text-xl font-extrabold tracking-[-0.02em] text-[#00374a] mb-2.5">{w.title}</h2>
                <p className="text-[14.5px] text-[#6a7a80] leading-relaxed mb-4">{w.body}</p>
                <span className="inline-flex items-center gap-1.5 text-[13px] font-bold transition-all group-hover:gap-2.5" style={{ color: w.accent }}>
                  Explore
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- CTA */}
      <section className="relative py-16 sm:py-20 text-white overflow-hidden" style={{ background: `linear-gradient(160deg, ${chrome.accent}, ${chrome.heroBg})` }}>
        <div className="max-w-[640px] mx-auto px-6 sm:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-black tracking-[-0.03em] mb-3">Come ride with us.</h2>
          <p className="text-[15px] text-white/80 leading-relaxed mb-7">
            Read the stories in the Magazine, or jump straight into a trip or a board built for you.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/blog" className="px-7 py-3.5 rounded-full text-[14px] font-bold bg-white transition-all hover:-translate-y-0.5" style={{ color: chrome.onAccent }}>
              Read the Magazine
            </Link>
            {/* one per world, the reader's shown by CSS — same reason as the
                header: picking here would need the request */}
            <Link href="/experience" data-np7-section="experience" className={secondaryCta}>
              Explore Experience
            </Link>
            {flags.showHardware && (
              <Link href="/hardware" data-np7-section="hardware" className={secondaryCta}>
                Explore Hardware
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* the footer's own background comes from a server-picked section; the
          wrapper lets the browser's world win instead (section-world.tsx) */}
      <div className="np7-section-footer">
        <BlogFooter showExperience={flags.showExperience} showHardware={flags.showHardware} />
      </div>
    </>
  );
}
