import type { Metadata } from "next";
import { flags } from "@/lib/flags";
import Link from "next/link";
import { OceanHeader } from "@/components/experience/ocean-header";
import { GiftBuyForm } from "@/components/experience/gift-buy-form";
import { loadGiftData } from "@/lib/gift-data";
import { canSeeExperienceWorld } from "@/lib/auth";
import { VOUCHER_HOW_TO_REDEEM } from "@/lib/vouchers";

// Absolute, so the layout's " · NP7" is not added on top: the tab used to read
// "Gift a trip — NP7 Experience · NP7", the brand twice and a long dash. It is
// a value voucher, so the title says voucher (site audit, 27 Sep 2026).
export const metadata: Metadata = { title: { absolute: "Gift an NP7 voucher" } };
export const dynamic = "force-dynamic";

export default async function GiftPage() {
  const [{ experiences, heroes, packages }, canBrowse] = await Promise.all([
    loadGiftData(),
    canSeeExperienceWorld(flags.showExperience).catch(() => false),
  ]);

  return (
    <>
      <OceanHeader variant="docked"  showAbout={flags.showAbout} showHardware={flags.showHardware} />
      <main className="min-h-[100svh] bg-[#fff7ec]">
        <section className="relative bg-[#00374a] text-white overflow-hidden">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-25 blur-[120px]" style={{ background: "radial-gradient(circle,#f47b20,transparent 70%)" }} aria-hidden />
          <div className="relative max-w-[760px] mx-auto px-6 sm:px-8 py-14 sm:py-16">
            {/* This page is open to everyone, the trips are not yet (Nico, 27 Sep
                2026). Until the Experience world is public a logged-out visitor
                who followed "Back to experiences" landed on a bare login form
                with no word on why. Whoever may browse the trips gets the link
                back; everyone else is told the account is free and what it
                opens, and comes back to the trips after signing in. */}
            {canBrowse ? (
              <Link href="/experience#experiences" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/70 hover:text-white transition-colors mb-5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
                Back to experiences
              </Link>
            ) : (
              <Link href="/account/login?next=/experience" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/70 hover:text-white transition-colors mb-5">
                Create your free account to see the trips
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            )}
            <p className="text-[11px] font-bold tracking-[0.28em] text-[#ffc42e] mb-3">GIVE THE BEST WEEK OF THEIR YEAR</p>
            <h1 className="text-4xl sm:text-5xl font-black tracking-[-0.035em] leading-[1.02]">Gift an NP7 voucher</h1>
            <p className="mt-4 text-[16px] sm:text-[17px] text-white/80 max-w-[560px]">A voucher towards a windsurf, wing &amp; foil trip with coaching, a crew and everything arranged, for someone you love. Add a personal call from Nico to share the news.</p>
            <div className="h-[3px] w-14 rounded-full mt-6" style={{ background: "linear-gradient(90deg,#ffc42e,#f47b20,#00afdb)" }} />
          </div>
        </section>

        {/* Photo band: a taste of the trips on offer (the hero of every experience the form offers).
            Edge-faded so the crop reads as intentional; soft teal foot for cohesion. */}
        {heroes.length > 0 && (
          <div className="-mt-px bg-[#00374a] pb-14">
            <div className="flex gap-3 overflow-x-auto px-5 sm:px-8 pb-1 [justify-content:safe_center] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,#000_4%,#000_96%,transparent)]">
              {heroes.map((src, i) => (
                <div key={i} className="relative h-44 sm:h-56 w-72 sm:w-[21rem] shrink-0 rounded-2xl overflow-hidden ring-1 ring-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,55,74,0) 52%, rgba(0,55,74,0.5))" }} aria-hidden />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cream panel rises over the teal with a soft curve */}
        <div className="relative -mt-7 rounded-t-[2.25rem] bg-[#fff7ec]">
          <div className="max-w-[760px] mx-auto px-6 sm:px-8 pt-10 pb-14 sm:pt-12 sm:pb-16">
            <GiftBuyForm experiences={experiences} packages={packages} />

          {/* How gifting works */}
          <div className="mt-12">
            <p className="text-[11px] font-bold tracking-[0.22em] text-[#f47b20] mb-5 text-center">HOW GIFTING WORKS</p>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { n: "1", t: "Pick a value", d: "Any amount from €200 to €10,000, for any NP7 trip or a specific one. Pay by bank transfer. No account needed." },
                { n: "2", t: "We wrap it up", d: "Once your transfer lands we email a printable PDF voucher. If you asked us to, Nico calls them with the news." },
                { n: "3", t: "They use it", d: `${VOUCHER_HOW_TO_REDEEM} If the trip costs less, whatever is left stays on the voucher.` },
              ].map((s) => (
                <div key={s.n} className="bg-white rounded-2xl border border-[#f0e6d6] p-5">
                  <span className="inline-grid place-items-center w-8 h-8 rounded-full text-[14px] font-black text-white mb-3" style={{ background: "linear-gradient(135deg,#ffc42e,#f47b20)" }}>{s.n}</span>
                  <h3 className="text-[15px] font-extrabold text-[#00374a] mb-1">{s.t}</h3>
                  <p className="text-[13px] text-[#6a7a80] leading-relaxed">{s.d}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2.5">
              {["Valid 1 year, or 2 years for any-trip vouchers over €5,000", "Printable PDF voucher", "Any trip or a specific one", "Optional: a call from Nico"].map((c) => (
                <span key={c} className="px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold text-[#00374a] bg-white border border-[#f0e6d6]">{c}</span>
              ))}
            </div>
          </div>
          </div>
        </div>
      </main>
    </>
  );
}
