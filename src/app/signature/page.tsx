import type { Metadata } from "next";
import Link from "next/link";
import { cdn } from "@/lib/cdn";
import { flags } from "@/lib/flags";
import { OceanHeader } from "@/components/experience/ocean-header";
import { ParallaxHero } from "@/components/experience/parallax-hero";
import { Reveal } from "@/components/experience/reveal";
import { SignatureApply } from "@/components/experience/signature-apply";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

// Personalised apply section (login-gated), so render per request.
export const dynamic = "force-dynamic";

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

// Real shots from the last Signature Trip (one trip, both islands — Madagascar &
// Mauritius), curated from the trip's memory gallery. Swap the numbers freely.
const MEM = (n: number) => `https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/assets/memories/6af5c7fe-26af-4105-ad45-910390da2594/NP7%20Experience%20Madagascar-${n}.jpg`;
const HERO = MEM(458);        // golden-hour action, two riders — the hero
const TRIP_LEAD = MEM(211);   // windsurf on the emerald lagoon
const TRIP_SHOTS = [MEM(480), MEM(252), MEM(212)];
const EYEBROW = "text-[11px] font-bold tracking-[0.25em] text-[#8fe6f2]";

const INCLUDES: { icon: string; label: string }[] = [
  { icon: "villa", label: "Private villa, right on the water" },
  { icon: "chef", label: "Your own private chef" },
  { icon: "coach", label: "World-class coaching, all week" },
  { icon: "camera", label: "Pro photo & video sessions" },
  { icon: "drinks", label: "Sunset drinks & chill days" },
  { icon: "crew", label: "A small crew of genuinely good people" },
];

function Ico({ name }: { name: string }) {
  const c = { className: "w-5 h-5", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "villa": return <svg {...c}><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></svg>;
    case "chef": return <svg {...c}><path d="M7 13.5a3.4 3.4 0 0 1-1-6.65A3.4 3.4 0 0 1 12.5 5a3.4 3.4 0 0 1 5.5 1.85 3.4 3.4 0 0 1-1 6.65" /><path d="M7 13.5h10V18a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" /></svg>;
    case "coach": return <svg {...c}><path d="M4 20h15" /><path d="M7 20V5l9 9H7z" /></svg>;
    case "camera": return <svg {...c}><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.2" /></svg>;
    case "drinks": return <svg {...c}><path d="M5 4h14l-7 8z" /><path d="M12 12v6" /><path d="M8 21h8" /></svg>;
    case "crew": return <svg {...c}><circle cx="8" cy="9" r="2.6" /><circle cx="16" cy="9" r="2.6" /><path d="M3.5 19a4.5 4.5 0 0 1 9 0" /><path d="M12.5 18.2A4.5 4.5 0 0 1 20.5 19" /></svg>;
    default: return null;
  }
}

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

export default async function SignatureTripsPage() {
  const user = await getPortalUser().catch(() => null);
  let prefill: { name: string | null; email: string | null; phone: string | null } | null = null;
  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db.from("contacts").select("name,email,phone").eq("id", user.contactId).maybeSingle();
    prefill = { name: data?.name ?? null, email: data?.email ?? null, phone: data?.phone ?? null };
  }

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
                <p className="text-[15px] text-white/55 leading-relaxed mt-4">
                  This is the very top of what we do — no compromises, nothing left to chance. The kind of week you&apos;ll be telling stories about for years.
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
                    <div key={it.label} className="flex items-center gap-3.5 rounded-2xl bg-white/[0.05] border border-white/10 backdrop-blur-sm px-4 py-4">
                      <span className="shrink-0 w-10 h-10 rounded-full grid place-items-center" style={{ background: "rgba(240,165,0,0.14)", color: "#ffcf6a" }}><Ico name={it.icon} /></span>
                      <span className="text-[14.5px] font-semibold text-white/90 leading-snug">{it.label}</span>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </section>

          {/* our last trip — one trip, both islands */}
          <section className="py-12">
            <div className="max-w-[1000px] mx-auto px-6 sm:px-8">
              <Reveal className="text-center max-w-[600px] mx-auto mb-9">
                <p className={`${EYEBROW} mb-3`}>WHERE WE&apos;VE BEEN</p>
                <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-white">Our last Signature Trip</h2>
                <p className="text-[15px] text-white/65 mt-3 leading-relaxed">One trip, two islands — Madagascar &amp; Mauritius. Emerald lagoons, empty walls, a beachfront villa, and a crew that clicked from day one.</p>
              </Reveal>
              <Reveal>
                <div className="relative rounded-[22px] overflow-hidden h-[300px] sm:h-[440px] border border-white/10">
                  <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${TRIP_LEAD}')` }} />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(1,26,34,0) 45%, rgba(1,26,34,0.8) 100%)" }} />
                  <div className="absolute bottom-0 inset-x-0 p-6">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#ffd97a]">Signature · Madagascar &amp; Mauritius</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  {TRIP_SHOTS.map((s, i) => (
                    <div key={i} className="h-[110px] sm:h-[170px] rounded-xl overflow-hidden bg-cover bg-center border border-white/10" style={{ backgroundImage: `url('${s}')` }} />
                  ))}
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
              <SignatureApply loggedIn={!!user} prefill={prefill} />
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
