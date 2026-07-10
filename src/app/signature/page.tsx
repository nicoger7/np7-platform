import type { Metadata } from "next";
import Link from "next/link";
import { cdn } from "@/lib/cdn";
import { flags } from "@/lib/flags";
import { OceanHeader } from "@/components/experience/ocean-header";
import { ParallaxHero } from "@/components/experience/parallax-hero";
import { Reveal } from "@/components/experience/reveal";
import { SignatureApply } from "@/components/experience/signature-apply";

// Public + promoted (unlike the invite-only surveys, this one IS meant to be
// found and shared), so it lives at a top-level route not gated by SHOW_EXPERIENCE.
export const metadata: Metadata = {
  title: "Signature Trips — invite-only windsurf expeditions",
  description: "NP7's most special windsurf trips — private villas, a chef, world-class coaching, in places like Madagascar and Mauritius. Premium, small-group and by application only.",
  alternates: { canonical: "/signature" },
  openGraph: {
    title: "Signature Trips — invite-only windsurf expeditions by NP7",
    description: "Small, hand-picked, unforgettable. Apply to join an NP7 Signature Trip.",
    url: "/signature",
    images: [{ url: cdn("hero/windsurf-hero-poster.jpg") }],
  },
};

const HERO = cdn("hero/windsurf-hero-poster.jpg");
// Real Madagascar scenery (already public on the site). Swap MAURITIUS for a real
// Mauritius shot when there's one — both are single consts so it's a 10-sec change.
const MADAGASCAR = "https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/assets/experience/Mazavaloha-resort-mer-emeraude-madagascar-kite-windsurf-11.jpg";
const MAURITIUS = cdn("hero/windsurf-hero-poster.jpg");
const EYEBROW = "text-[11px] font-bold tracking-[0.25em] text-[#8fe6f2]";

const INCLUDES: { icon: string; label: string }[] = [
  { icon: "🏝️", label: "Private villa, right on the water" },
  { icon: "👨‍🍳", label: "Your own private chef" },
  { icon: "🏄", label: "World-class coaching, all week" },
  { icon: "📸", label: "Pro photo & video sessions" },
  { icon: "🍹", label: "Sunset drinks & chill days" },
  { icon: "🤙", label: "A small crew of genuinely good people" },
];

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex gap-3.5">
      <span className="shrink-0 w-8 h-8 rounded-full grid place-items-center font-black text-[13px] text-[#00374a]" style={{ background: "linear-gradient(145deg,#ffe08a,#f0a500)" }}>{n}</span>
      <div>
        <p className="text-[15px] font-black text-white">{title}</p>
        <p className="text-[13.5px] text-white/60 mt-0.5 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function TripCard({ image, place, line }: { image: string; place: string; line: string }) {
  return (
    <div className="group rounded-[20px] overflow-hidden relative border border-white/10 h-[300px] sm:h-[340px]">
      <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105" style={{ backgroundImage: `url('${image}')` }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(1,26,34,0.1) 0%, rgba(1,26,34,0.35) 45%, rgba(1,26,34,0.92) 100%)" }} />
      <div className="absolute bottom-0 inset-x-0 p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#ffd97a]">Signature · past trip</p>
        <h3 className="text-2xl font-black text-white tracking-[-0.02em] mt-1">{place}</h3>
        <p className="text-[13.5px] text-white/75 mt-1.5 leading-relaxed">{line}</p>
      </div>
    </div>
  );
}

export default function SignatureTripsPage() {
  return (
    <>
      <OceanHeader showExperience={flags.showExperience} showHardware={flags.showHardware} showBlog={flags.showBlog} bookHref="#apply" />

      <main className="bg-[#02212e]">
        <ParallaxHero image={HERO}>
          <div className="max-w-[1100px] mx-auto px-6 sm:px-8 pb-20 sm:pb-28">
            <Reveal>
              <span className={`inline-flex items-center gap-2 uppercase ${EYEBROW}`} style={{ color: "#ffd97a" }}><span aria-hidden>✦</span> By application only</span>
              <h1 className="text-[46px] sm:text-6xl lg:text-[70px] font-black text-white leading-[0.96] tracking-[-0.035em] mt-4 drop-shadow-[0_4px_30px_rgba(0,0,0,0.35)]">Signature Trips</h1>
              <p className="mt-5 text-[17px] sm:text-[20px] text-white/85 max-w-[580px] font-medium leading-relaxed">
                Our most special windsurf trips — small, hand-picked crews, private villas, and world-class coaching, in the kind of places you talk about for years. Madagascar. Mauritius. Spots most people never reach.
              </p>
              <a href="#apply" className="inline-flex items-center gap-2 mt-8 px-7 py-4 rounded-full text-[14px] font-bold text-[#00374a] bg-white shadow-[0_8px_30px_rgba(255,255,255,0.2)] hover:-translate-y-0.5 transition-all">
                Apply for a spot
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </a>
            </Reveal>
          </div>
        </ParallaxHero>

        <div style={{ background: "linear-gradient(180deg,#00374a 0%,#012734 45%,#02212e 100%)" }}>
          {/* the story */}
          <section className="pt-24 sm:pt-28 pb-6">
            <div className="max-w-[760px] mx-auto px-6 sm:px-8">
              <Reveal className="text-center max-w-[640px] mx-auto">
                <p className={`${EYEBROW} mb-3`}>NOT YOUR AVERAGE TRIP</p>
                <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-white mb-4">The trips we don&apos;t put on the website</h2>
                <p className="text-[16px] sm:text-[17px] text-white/70 leading-relaxed">
                  A Signature Trip isn&apos;t a package you book — it&apos;s a small group we put together ourselves. We keep the crew tight and the vibe right, because the people make the trip. That&apos;s why these run <strong className="text-white/90">by application</strong>: we want to know who&apos;s coming.
                </p>
                <p className="text-[14.5px] text-white/55 leading-relaxed mt-4">
                  These are our premium, all-in trips — a proper investment, and worth every cent. Everything you pay goes straight back into making the week genuinely unforgettable.
                </p>
              </Reveal>
            </div>
          </section>

          {/* what's included */}
          <section className="py-10">
            <div className="max-w-[900px] mx-auto px-6 sm:px-8">
              <Reveal className="text-center max-w-[560px] mx-auto mb-8">
                <p className={`${EYEBROW} mb-3`}>WHAT&apos;S IN IT</p>
                <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-white">The full experience, handled</h2>
              </Reveal>
              <Reveal>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {INCLUDES.map((it) => (
                    <div key={it.label} className="flex items-center gap-3 rounded-2xl bg-white/[0.05] border border-white/10 backdrop-blur-sm px-4 py-4">
                      <span className="text-[22px]" aria-hidden>{it.icon}</span>
                      <span className="text-[14.5px] font-semibold text-white/90 leading-snug">{it.label}</span>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </section>

          {/* our last trips */}
          <section className="py-12">
            <div className="max-w-[1000px] mx-auto px-6 sm:px-8">
              <Reveal className="text-center max-w-[560px] mx-auto mb-9">
                <p className={`${EYEBROW} mb-3`}>WHERE WE&apos;VE BEEN</p>
                <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-white">Our last Signature Trips</h2>
              </Reveal>
              <Reveal>
                <div className="grid sm:grid-cols-2 gap-5">
                  <TripCard image={MADAGASCAR} place="Madagascar" line="Emerald lagoons and empty down-the-line walls, a beachfront villa, and a crew that clicked from day one." />
                  <TripCard image={MAURITIUS} place="Mauritius" line="One Eye and the flat inside lagoon, sunset sessions, chef dinners, and chill days between the wind." />
                </div>
              </Reveal>
            </div>
          </section>

          {/* how it works */}
          <section className="py-10">
            <div className="max-w-[760px] mx-auto px-6 sm:px-8">
              <Reveal>
                <div className="rounded-[24px] bg-white/[0.05] border border-white/10 backdrop-blur-sm p-7 sm:p-9">
                  <p className={`${EYEBROW} mb-5`}>HOW IT WORKS</p>
                  <div className="space-y-5">
                    <Step n="1" title="Apply" body="A few details and a short video or voice note — tell us who you are and why this trip." />
                    <Step n="2" title="We review it personally" body="Every application comes straight to the team — no bots, no forms lost in an inbox." />
                    <Step n="3" title="We talk" body="If there's a fit, we'll reach out — often just a quick call to say hello." />
                    <Step n="4" title="You're invited" body="Get the details of the trip and your spot. That's when the countdown begins. 🌊" />
                  </div>
                </div>
              </Reveal>
            </div>
          </section>

          {/* apply */}
          <section id="apply" className="scroll-mt-20 pt-10 pb-24 sm:pb-32">
            <div className="max-w-[760px] mx-auto px-6 sm:px-8">
              <Reveal className="text-center max-w-[600px] mx-auto mb-9">
                <p className={`${EYEBROW} mb-3`}>YOUR TURN</p>
                <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-white mb-3">Apply for a Signature Trip</h2>
                <p className="text-[15px] text-white/70">Two minutes. The pitch is the part that matters — we&apos;d rather hear you than read a CV.</p>
              </Reveal>
              <SignatureApply />
            </div>
          </section>

          <footer className="border-t border-white/[0.07] py-8 text-center text-[12px] text-white/40">
            <Link href="/" className="hover:text-white/70 transition-colors font-bold">NP7</Link> · © 2026 Nico Prien (GER-7)
          </footer>
        </div>
      </main>
    </>
  );
}
