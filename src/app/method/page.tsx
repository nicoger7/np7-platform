import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MagazineTabs } from "@/components/blog/magazine-tabs";
import { SECTION_CHROME } from "@/lib/blog-section";
import { SectionHeader } from "@/components/shared/section-header";
import { BlogFooter } from "@/components/blog/blog-footer";
import { flags } from "@/lib/flags";

export const metadata: Metadata = {
  title: "The NP7 Method",
  description:
    "Great windsurfing was never one fix on the water — it's seven things moving together. The NP7 Method is Nico Prien's proven, holistic coaching system for building the whole rider across one week by the sea.",
  alternates: { canonical: "/method" },
};
export const revalidate = 60;

// The flagship manifesto copy (judge-panel synthesis, 2026-07-18). Kept as data
// so the JSX stays clean and the words are easy to tweak in one place.
const EYEBROW = "THE NP7 METHOD";
const HEADLINE = "The whole rider — not just the move.";
const SUBHEAD =
  "Great windsurfing was never one fix on the water — it's seven things moving together. The NP7 Method is Nico's proven system for building all of them, in you, across one week by the sea. It's the coaching approach he's refined teaching hundreds of thousands of windsurfers through YouTube and camps worldwide — now built around the whole rider, with every complex movement broken into clear, actionable steps, tailored to you.";

const DIMENSIONS = [
  { name: "Technique", oneLiner: "The complex, broken into steps that finally click.", body: "Every move you're chasing — locking into the straps, the jibe, your first loop — is a sequence of small, learnable steps, not one impossible leap. We break the complicated down until each piece is something you can actually feel and repeat, then rebuild it in an order your body understands. And we film it and watch it back together, because seeing yourself is the moment it stops being confusing and starts making sense. This is the craft NP7 is known for: the hardest things on the water, made simple." },
  { name: "Fundamentals", oneLiner: "Get the base right and everything above it comes easier.", body: "The best riders aren't doing more — they're standing better. Before we chase the flashy stuff, we lock in the foundation: your stance, your balance, the way you carry the pull of the sail. A jibe built on a shaky stance never holds, but fix the base once and every move you build on top of it lands faster — natural instead of forced." },
  { name: "Mindset", oneLiner: "Progress is a headspace before it's a maneuver.", body: "The biggest thing between you and the next move usually isn't your arms — it's your head. The riders who improve fastest aren't the most talented; they're the ones who stay patient, curious, and willing to fall. So we coach the mental side too: how you talk to yourself after a bail, how you make peace with the wipeouts that come right before a breakthrough, how you keep showing up when the wind is testing you. Get your head right and your body follows." },
  { name: "Decision-making", oneLiner: "Knowing what to do — and exactly when.", body: "A good session is a thousand tiny decisions: when to commit, when to wait, which gust to take, when to bear away. We teach you to read the moment and make the right call in real time, so the right move becomes instinct instead of a gamble — and you stop reacting to the water and start choosing your line through it. That judgement is the quiet difference between riders who look in control and riders who just got lucky." },
  { name: "Conditions", oneLiner: "Read the wind and water like a local — don't just fight it.", body: "The wind, the swell and your gear are always telling you something, and the ocean is never the same twice. We teach you to listen — to see the gusts before they arrive, understand why a spot behaves the way it does, and dial your setup to whatever the day hands you. Once you can truly read conditions, you'll get good sessions out of days you'd have sat out before — and you're no longer tied to one beach. Every spot on earth opens up to you." },
  { name: "Confidence", oneLiner: "Earned on the water, session by session — never talked into you.", body: "Real confidence doesn't come from a pep talk — it comes from proof, built on a foundation you've learned to trust. We stack small wins on purpose, so as the fundamentals lock in and the wipeouts stop scaring you, you'll catch yourself reaching for more wind, more chop, more speed — and grinning through it. You go home at ease in conditions that would have kept you on the beach on day one, and it stays with you long after the trip." },
  { name: "Enjoyment", oneLiner: "Because this is supposed to feel incredible.", body: "Every other dimension leads here — and fun isn't the reward at the end, it's the engine. When technique, confidence and the right conditions finally line up, windsurfing stops feeling like work and turns into pure flow: that weightless, lost-in-it feeling that hooked you in the first place. We protect the joy as carefully as the technique, because the riders who love the process are the ones who keep getting better for years — and joy is what pulls you back to the water for the rest of your life." },
];

const MOMENTUM_HEADING = "Momentum, not moments.";
const MOMENTUM_BODY =
  "Nobody transforms in a single moment on the water — real progress is momentum, and it builds. The day you book the week, you've already made the real decision: to get better. From there it compounds — morning focus into evening video, one session standing on the last. And because it's a week where windsurfing is the only topic — talked over breakfast, watched back at night, lived from sunrise to sunset with a crew who love it as much as you do — you're not squeezing in a lesson, you're fully immersed. That combination, momentum plus your crew, is exactly where the real jump happens.";

const CLOSING =
  "The best part is you can start living the Method today. Dig into the free technique articles, take one focus point into your very next session, and feel it work on your own local water. But the real leap — all seven dimensions at once, six days on the water, a hand-picked crew beside you and a coach in your corner — happens on a trip, where everything you've read turns into the way you actually ride. This is the week it all finally clicks. We'll see you on the water.";

export default async function MethodPage() {
  // Built but kept OFFLINE — 404 in production until SHOW_METHOD=true.
  if (!flags.showMethod) notFound();
  const chrome = SECTION_CHROME.experience;

  return (
    <>
      <SectionHeader section="experience" />
      <main className="bg-[#fff7ec] min-h-[100svh]">
        {/* HERO — a real coaching moment behind the manifesto title */}
        <header className="relative text-white pt-16 pb-14 overflow-hidden" style={{ background: chrome.heroBackground }}>
          <div className="absolute inset-0 bg-cover opacity-25" style={{ backgroundImage: "url('https://media.np-seven.com/experiences/np7-bonaire/people/nico-board-hteory-bonaire.jpg')", backgroundPosition: "center 35%" }} aria-hidden />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,20,29,0.3) 0%, transparent 42%, rgba(0,20,29,0.55) 100%)" }} aria-hidden />
          <div className="relative max-w-[1100px] mx-auto px-6 sm:px-8">
            <p className="text-[11px] font-bold tracking-[0.25em] mb-3" style={{ color: chrome.eyebrow }}>{EYEBROW}</p>
            <h1 className="text-4xl sm:text-6xl font-black tracking-[-0.03em] max-w-[720px] leading-[1.02]">{HEADLINE}</h1>
            <span className="block h-1.5 w-28 rounded-full mt-4" style={{ background: chrome.stripe }} />
            <p className="mt-5 text-[15.5px] sm:text-[17px] text-white/75 max-w-[680px] leading-relaxed">{SUBHEAD}</p>
            <div className="mt-8">
              <MagazineTabs active="technique" accent={chrome.accent} onAccent={chrome.onAccent} />
            </div>
          </div>
        </header>

        {/* THE SEVEN DIMENSIONS — editorial, numbered manifesto */}
        <section className="max-w-[880px] mx-auto px-6 sm:px-8 py-16 sm:py-24">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#b0791e]">Seven dimensions · one rider</p>
          <h2 className="text-2xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mt-2 max-w-[620px]">Great windsurfing is seven things moving together</h2>

          <div className="mt-12 sm:mt-16 flex flex-col gap-12 sm:gap-16">
            {DIMENSIONS.map((d, i) => (
              <div key={d.name} className="grid sm:grid-cols-[auto_1fr] gap-4 sm:gap-8">
                <div className="flex items-baseline gap-3 sm:flex-col sm:items-start sm:gap-1 sm:w-24 shrink-0">
                  <span className="text-[44px] sm:text-[52px] font-black leading-none text-[#00afdb]/25 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div>
                  <h3 className="text-[22px] sm:text-[26px] font-extrabold text-[#00374a] tracking-[-0.02em]">{d.name}</h3>
                  <p className="text-[15px] sm:text-[16.5px] font-bold text-[#0a7f9e] mt-1.5">{d.oneLiner}</p>
                  <p className="text-[14.5px] sm:text-[15.5px] text-[#4a5a60] leading-relaxed mt-3 max-w-[640px]">{d.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* MOMENTUM + IMMERSION — the delivery mechanism (dark band) */}
        <section className="relative overflow-hidden bg-[#00374a] text-white py-16 sm:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_20%,rgba(0,175,219,0.22),transparent_55%)]" aria-hidden />
          <div className="relative max-w-[760px] mx-auto px-6 sm:px-8">
            <p className="text-[11px] font-bold tracking-[0.22em] text-[#8fe6f2] mb-3">HOW THE JUMP HAPPENS</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em]">{MOMENTUM_HEADING}</h2>
            <p className="text-[16px] sm:text-[17.5px] text-white/70 leading-relaxed mt-5">{MOMENTUM_BODY}</p>
          </div>
        </section>

        {/* CLOSING + CTAs */}
        <section className="max-w-[760px] mx-auto px-6 sm:px-8 py-16 sm:py-24 text-center">
          <p className="text-[16px] sm:text-[18px] text-[#3a4a50] leading-relaxed">{CLOSING}</p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/blog/technique" className="inline-flex items-center gap-2 rounded-full border-2 border-[#00374a]/15 text-[#00374a] font-bold text-[14.5px] px-7 py-3.5 hover:border-[#00374a]/40 transition-colors">
              Read the technique guides
              <span aria-hidden>→</span>
            </Link>
            {flags.showExperience && (
              <Link href="/experience" className="inline-flex items-center gap-2 rounded-full font-black text-[14.5px] px-8 py-3.5 text-[#3a2a00] transition-transform hover:-translate-y-0.5" style={{ background: chrome.stripe }}>
                Live it on a trip
                <span aria-hidden>→</span>
              </Link>
            )}
          </div>
        </section>

        <BlogFooter section="experience" showExperience={flags.showExperience} showHardware={flags.showHardware} />
      </main>
    </>
  );
}
