import type { Metadata } from "next";
import Link from "next/link";
import { SignatureApply } from "@/components/experience/signature-apply";

// Public + promoted (unlike the invite-only surveys, this one IS meant to be
// found and shared), so it lives at a top-level route not gated by SHOW_EXPERIENCE.
export const metadata: Metadata = {
  title: "Signature Trips — invite-only windsurf expeditions",
  description: "NP7's most special windsurf trips are small, hand-picked and by application only. Apply to be considered for a Signature Trip — think Madagascar, Mauritius and beyond.",
  alternates: { canonical: "/signature" },
  openGraph: {
    title: "Signature Trips — invite-only windsurf expeditions by NP7",
    description: "Small, hand-picked, unforgettable. Apply to join an NP7 Signature Trip.",
    url: "/signature",
    images: [{ url: "/cdn/assets/hero/windsurf-hero-poster.jpg" }],
  },
};

const HERO = "/cdn/assets/hero/windsurf-hero-poster.jpg";

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex gap-3.5">
      <span className="shrink-0 w-8 h-8 rounded-full grid place-items-center font-black text-[13px] text-[#00374a]" style={{ background: "linear-gradient(145deg,#ffe08a,#f0a500)" }}>{n}</span>
      <div>
        <p className="text-[15px] font-black text-[#00374a]">{title}</p>
        <p className="text-[13.5px] text-[#5a6b72] mt-0.5 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

export default function SignatureTripsPage() {
  return (
    <main className="min-h-[100svh] bg-[#fdf6ea]">
      {/* minimal brand bar (this page stands alone, outside the gated Experience chrome) */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-5 sm:px-8 py-4">
        <Link href="/" className="text-white font-black tracking-tight text-[19px] drop-shadow">NP7</Link>
      </div>

      {/* hero */}
      <header className="relative overflow-hidden flex flex-col min-h-[560px] sm:min-h-[640px] text-white">
        <div className="absolute inset-0 bg-cover bg-center scale-105" style={{ backgroundImage: `url('${HERO}')` }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(1,32,42,0.52) 0%, rgba(1,28,38,0.30) 40%, rgba(1,22,30,0.92) 100%)" }} />
        <div className="absolute top-0 inset-x-0 h-[3px] z-10" style={{ background: "linear-gradient(90deg,#ffe08a,#f0a500 45%,#f47b20)" }} />
        <div className="relative z-10 mt-auto w-full max-w-[760px] mx-auto px-5 sm:px-8 pb-14 pt-20">
          <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.26em]" style={{ color: "#ffd97a" }}>
            <span aria-hidden>✦</span> By application only
          </span>
          <h1 className="text-[46px] sm:text-[72px] font-black tracking-[-0.035em] mt-4 leading-[0.98]">Signature Trips</h1>
          <p className="text-white/85 text-[17px] sm:text-[19px] leading-relaxed mt-5 max-w-[560px]">
            My most special windsurf trips — small, hand-picked crews, in the kind of places you talk about for years. Think Madagascar, Mauritius, and spots most people never reach.
          </p>
          <a href="#apply" className="inline-flex items-center gap-2 mt-7 rounded-full text-white text-[15px] font-black px-7 py-3.5 shadow-[0_12px_30px_rgba(240,123,32,0.3)] hover:-translate-y-0.5 transition-transform" style={{ background: "linear-gradient(135deg,#f7b733 0%,#f47b20 55%,#e0590f 100%)" }}>
            Apply for a spot
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </a>
        </div>
      </header>

      <div className="max-w-[760px] mx-auto px-5 sm:px-8 py-12 sm:py-16 space-y-12">
        {/* the story */}
        <section>
          <h2 className="text-[13px] font-black uppercase tracking-[0.16em] text-[#b0791e]">Not your average trip</h2>
          <p className="text-[17px] text-[#3a4a50] leading-relaxed mt-3">
            A Signature Trip isn&apos;t a package you book — it&apos;s a small group I put together myself. I keep the crew tight and the vibe right, because the people make the trip. That&apos;s why these run <strong className="text-[#00374a]">by application</strong>: I want to know who&apos;s coming.
          </p>
        </section>

        {/* how it works */}
        <section className="rounded-2xl border border-[#ecdcbb] bg-white p-6 sm:p-7 shadow-[0_10px_30px_rgba(120,90,20,0.05)]">
          <h2 className="text-[13px] font-black uppercase tracking-[0.16em] text-[#b0791e] mb-4">How it works</h2>
          <div className="space-y-4">
            <Step n="1" title="Apply" body="A few details and a short video or voice note — tell me who you are and why this trip." />
            <Step n="2" title="I review it personally" body="Every application comes straight to me. No bots, no forms lost in an inbox." />
            <Step n="3" title="We talk" body="If there's a fit, I'll reach out — often just a quick call to say hello." />
            <Step n="4" title="You're invited" body="Get the details of the trip and your spot. That's when the countdown begins. 🌊" />
          </div>
        </section>

        {/* apply */}
        <section id="apply" className="scroll-mt-6">
          <h2 className="text-[26px] sm:text-[30px] font-black tracking-[-0.02em] text-[#00374a]">Apply for a Signature Trip</h2>
          <p className="text-[14.5px] text-[#5a6b72] mt-2 mb-6">Two minutes. The pitch is the part that matters — I&apos;d rather hear you than read a CV.</p>
          <SignatureApply />
        </section>
      </div>
    </main>
  );
}
