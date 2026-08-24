import Link from "next/link";
import { flags } from "@/lib/flags";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { HeroFindYourFit } from "@/components/experience/hero-find-your-fit";
import { DisciplinesShowcase } from "@/components/experience/disciplines-showcase";
import { DepthBackdrop } from "@/components/experience/depth-backdrop";
import { OceanHeader, NP7_LOGO } from "@/components/experience/ocean-header";
import { Reveal } from "@/components/experience/reveal";
import { Carousel } from "@/components/experience/carousel";
import { UpcomingExperiences } from "@/components/experience/upcoming-experiences";
import { getExperienceCards } from "@/lib/experience-cards";

export const metadata: Metadata = {
  title: { absolute: "NP7 Experience — Premium Watersports Travel" },
  description:
    "Guided windsurf & foil trips with Nico Prien (GER-7). World-class coaching, hand-picked crews, and everything arranged.",
};

export const revalidate = 3600;

import { cdn } from "@/lib/cdn";

const NP7_EXPERIENCE_LOGO = cdn('logos/np7-experience-logo.png');
const HERO_VIDEO = cdn('hero/windsurf-hero.mp4');
const HERO_POSTER = cdn('hero/windsurf-hero-poster.jpg');
// Slow-connection fallback: when the hero video can't play, these four
// crossfade instead of one frozen frame — crew energy plus three destinations.
const HERO_FALLBACKS = [
  HERO_POSTER,
  cdn('experiences/np7-alacati/action/alacati-experience-group-on-water.jpg'),
  cdn('experiences/np7-lake-garda-2026/action/rider-crossing-mountain-backdrop.jpg'),
  cdn('experiences/np7-alacati/action/alacati-experience-action-nico.jpg'),
];

// Dedicated background photo for the "Gift of NP7" band — a plain photo, NOT a
// baked tile graphic. Leave empty for the gradient-only (restrained) band.
const GIFT_PHOTO = "";

/* --------------------------------- page --------------------------------- */

export default async function ExperienceOverviewPage() {
  const { cards: expCards, experiences } = await getExperienceCards();

  // The gift card's backdrop = a dedicated plain photo (GIFT_PHOTO). We no longer
  // reuse an experience's tile image here — those are baked graphics with text,
  // which looked wrong bleeding through the band. Empty = gradient-only band.
  const giftHero = GIFT_PHOTO || null;

  // Destinations: prefer real destination records (clickable → /destinations/:slug);
  // fall back to location-derived cards (non-clickable) until they're generated in admin.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: destRows } = await (supabase as any).from("destinations").select("id,slug,name,hero_image").eq("status", "published").order("sort_order");
  const tableDest = (destRows ?? []) as { id: string; slug: string; name: string; hero_image: string | null }[];
  const derived = Array.from(
    experiences.reduce((map, e) => {
      const loc = e.location ?? "Somewhere epic";
      if (!map.has(loc)) map.set(loc, { location: loc, image: e.hero_image, count: 0 });
      map.get(loc)!.count += 1;
      return map;
    }, new Map<string, { location: string; image: string | null; count: number }>())
    .values()
  );
  // A "trip" on these cards is an upcoming WEEK, not an experience row —
  // Bonaire is one experience but runs 3 weeks in 2026 and 3 in 2027, and the
  // card used to say "1 trip in 2026" (hardcoded year included).
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcomingWeeks = (list: typeof experiences) => list.flatMap((e) =>
    (e.exp_editions ?? []).filter((ed) => ed.status === "published" && ed.date_start && ed.date_start > todayIso));
  const weekLabel = (ups: { date_start: string | null }[]) => {
    const years = Array.from(new Set(ups.map((ed) => ed.date_start!.slice(0, 4)))).sort();
    const span = years.length === 0 ? "" : years.length === 1 ? ` in ${years[0]}` : ` ${years[0]}–${years[years.length - 1]}`;
    return `${ups.length} ${ups.length === 1 ? "trip" : "trips"}${span}`;
  };
  const destCards = (tableDest.length
    ? tableDest.map((d) => {
        const linked = experiences.filter((e) => e.destination_id === d.id);
        const ups = upcomingWeeks(linked);
        // A destination between seasons (last week ran, next not published yet)
        // stays on the shelf — hiding it read as "we dropped Lake Garda".
        return {
          key: d.slug, title: d.name, image: d.hero_image,
          count: linked.length ? Math.max(ups.length, 1) : 0,
          label: ups.length ? weekLabel(ups) : "New dates coming soon",
          href: `/destinations/${d.slug}`,
        };
      })
    : derived.map((d) => ({ key: d.location, title: d.location, image: d.image, count: d.count, label: `${d.count} ${d.count === 1 ? "trip" : "trips"}`, href: "#experiences" })))
    // Only show destinations we actually run visible trips to. Hides places whose
    // experience is hidden/unpublished (e.g. Madagascar) so no "0 trips" tiles appear.
    .filter((d) => d.count > 0);

  return (
    <>
      <OceanHeader  showAbout={flags.showExperience} showHardware={flags.showHardware} />

      {/* ---------------------------------------------------------------- */}
      {/* HERO — scroll-scrubbed windsurf "dive"                            */}
      {/* ---------------------------------------------------------------- */}
      <HeroFindYourFit src={HERO_VIDEO} poster={HERO_POSTER} fallbackImages={HERO_FALLBACKS}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={NP7_EXPERIENCE_LOGO}
          alt="NP7 Experience"
          className="w-[280px] sm:w-[400px] lg:w-[460px] h-auto drop-shadow-[0_6px_30px_rgba(0,0,0,0.55)] mb-7"
        />
        <h1 className="text-3xl sm:text-5xl lg:text-[56px] font-black text-white leading-[0.98] tracking-[-0.03em] drop-shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
          The No.&thinsp;1 windsurf holiday.
        </h1>
        <p className="mt-5 text-[16px] sm:text-[19px] text-white/85 max-w-[520px] font-medium">
          Chase the ride, find your crew — world-class coaching, community and everything arranged for you.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="#experiences"
            className="px-7 py-4 rounded-full text-[14px] font-bold text-[#00374a] bg-white shadow-[0_8px_30px_rgba(255,255,255,0.25)] hover:-translate-y-0.5 transition-all"
          >
            Explore experiences
          </Link>
          <Link
            href="#destinations"
            className="px-7 py-4 rounded-full text-[14px] font-bold text-white border-[1.5px] border-white/50 hover:bg-white/10 transition-all"
          >
            See destinations
          </Link>
        </div>
      </HeroFindYourFit>

      {/* ---------------------------------------------------------------- */}
      {/* THE DESCENT — the ocean + experiences rise up over the tail of the  */}
      {/* find-your-fit video stage: pulled up so they scroll into view while  */}
      {/* the scrubbed video is still fading out behind them (no line).        */}
      {/* ---------------------------------------------------------------- */}
      <div className="relative z-10 -mt-[78vh]">
      <DepthBackdrop>
        {/* UPCOMING EXPERIENCES — white cards floating on the water */}
        <section id="experiences" className="scroll-mt-20 pt-20 sm:pt-28 pb-24">
          <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
            <Reveal className="text-center max-w-[620px] mx-auto mb-14">
              <p className="text-[11px] font-bold tracking-[0.25em] text-[#8fe6f2] mb-3">NEXT ON THE WATER</p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-white mb-4">Upcoming experiences</h2>
              <p className="text-[16px] text-white/70 leading-relaxed">Pick a date, pack your harness — we&apos;ll handle the rest.</p>
            </Reveal>

            {experiences.length === 0 ? (
              <p className="text-center text-white/70">New experiences are being planned — check back soon.</p>
            ) : (
              <UpcomingExperiences experiences={expCards} showSignature />
            )}

            {/* Gift — a premium, restrained invitation */}
            <Reveal className="mt-16">
              <Link href="/experience/gift" className="group relative block overflow-hidden rounded-[28px]">
                {/* base wash (fallback when no hero) */}
                <div className="absolute inset-0 bg-gradient-to-b from-[#012734] to-[#013143]" aria-hidden />
                {/* hero of the next experience, gently zooming on hover */}
                {giftHero && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={giftHero} alt="" className="absolute inset-0 w-full h-full object-cover scale-105 transition-transform duration-[1200ms] ease-out group-hover:scale-110" />
                )}
                {/* Warm "sun to sea" CI wash — teal body keeps text crisp, a big sun→coral glow up top, sea-blue at the foot */}
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,55,74,0.58) 0%, rgba(6,48,58,0.82) 52%, rgba(8,46,55,0.94) 100%)" }} aria-hidden />
                <div className="absolute inset-0" style={{ background: "radial-gradient(130% 90% at 50% -8%, rgba(244,123,32,0.46), rgba(255,196,46,0.22) 40%, transparent 66%)" }} aria-hidden />
                <div className="absolute inset-0 mix-blend-overlay opacity-50" style={{ background: "linear-gradient(135deg, #f47b20 0%, transparent 55%)" }} aria-hidden />
                <div className="absolute inset-x-0 bottom-0 h-1/3" style={{ background: "linear-gradient(180deg, transparent, rgba(0,175,219,0.18))" }} aria-hidden />
                <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full opacity-45 blur-[110px]" style={{ background: "radial-gradient(circle,#ffb04a,transparent 70%)" }} aria-hidden />
                <div className="absolute inset-0 rounded-[28px] ring-1 ring-inset ring-[#ffc42e]/25" aria-hidden />
                <div className="absolute inset-x-10 top-0 h-px" style={{ background: "linear-gradient(90deg,transparent,#ffc42e,#f47b20,transparent)" }} aria-hidden />
                <div className="relative flex flex-col items-center gap-5 px-8 py-14 sm:py-16 text-center">
                  <p className="text-[11px] font-bold tracking-[0.34em] text-[#ffc42e]">THE GIFT OF NP7</p>
                  <h3 className="text-[27px] sm:text-[34px] font-black tracking-[-0.02em] leading-[1.08] text-white max-w-[620px] drop-shadow-[0_2px_18px_rgba(0,0,0,0.35)]">
                    Give someone the best week<br className="hidden sm:block" /> of their year
                  </h3>
                  <p className="text-[14.5px] text-white/75 max-w-[440px] leading-relaxed">
                    A windsurf, wing &amp; foil adventure — world-class coaching, a crew and every detail arranged, presented as a voucher. For a chosen trip, or any experience.
                  </p>
                  <span className="mt-2 inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[14px] font-bold text-[#00374a] bg-[#ffc42e] shadow-[0_6px_22px_rgba(255,196,46,0.32)] group-hover:bg-[#ffce52] group-hover:-translate-y-0.5 transition-all">
                    Explore gifting
                    <svg className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </span>
                </div>
              </Link>
            </Reveal>
          </div>
        </section>

        {/* DESTINATIONS — drift by mid-water */}
        <section id="destinations" className="scroll-mt-20 text-white pt-8 pb-24">
          <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
            <Reveal className="mb-10">
              <p className="text-[11px] font-bold tracking-[0.25em] text-[#8fe6f2] mb-3">WHERE WE RIDE</p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em]">Destinations</h2>
            </Reveal>
            <Reveal>
              <Carousel label="Destinations">
                {destCards.map((d) => (
                  <Link key={d.key} href={d.href} className="snap-start shrink-0 w-[260px] sm:w-[300px] group">
                    <div className="relative h-[360px] rounded-3xl overflow-hidden">
                      <div className="absolute inset-0 bg-cover bg-center bg-[#0a4a5e] transition-transform duration-500 group-hover:scale-105" style={{ backgroundImage: d.image ? `url('${d.image}')` : undefined }} />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#00374a] via-[#00374a]/20 to-transparent" />
                      <div className="absolute bottom-0 p-6">
                        <h3 className="text-2xl font-black tracking-[-0.02em]">{d.title}</h3>
                        <p className="text-[12px] font-semibold text-[#8fe6f2] mt-1">{d.label}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </Carousel>
            </Reveal>
          </div>
        </section>

        {/* DISCIPLINES */}
        <section id="disciplines" className="scroll-mt-20 py-20 sm:py-28">
          <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
            <Reveal className="text-center max-w-[560px] mx-auto mb-12">
              <p className="text-[11px] font-bold tracking-[0.25em] text-[#8fe6f2] mb-3">YOUR SPORT</p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-white">Whatever you ride</h2>
            </Reveal>
            <Reveal><DisciplinesShowcase /></Reveal>
          </div>
        </section>

        {/* VIBE / COMMUNITY — the warmth surfaces back here (sunset wash) */}
        <section id="vibe" className="scroll-mt-20 relative py-24 sm:py-32 text-white overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 72% 58% at 50% 42%, rgba(255,196,46,0.22) 0%, rgba(255,176,40,0.10) 40%, transparent 72%)",
            }}
            aria-hidden
          />
          <div className="relative max-w-[820px] mx-auto px-6 sm:px-8 text-center">
            <Reveal>
              <p className="text-[11px] font-bold tracking-[0.25em] text-[#ffc42e] mb-4">THE NP7 VIBE</p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] mb-6 leading-[1.08]">You arrive solo.<br />You leave with a crew.</h2>
              <p className="text-[17px] text-white/75 leading-relaxed">Good people, shared sunset sessions and dinners together, and coaching from one of the world&apos;s best. Most riders come once — then rebook with the friends they made.</p>
              <Link href="#experiences" className="inline-block mt-9 px-8 py-4 rounded-full text-[14px] font-bold text-[#00374a] bg-white hover:-translate-y-0.5 transition-all">Find your trip</Link>
            </Reveal>
          </div>
        </section>

        {/* NEWSLETTER + FOOTER — the seabed */}
        <section className="pt-20 pb-10 text-white border-t border-white/[0.06]">
          <div className="max-w-[480px] mx-auto text-center px-6 mb-16">
            <h2 className="text-3xl font-black tracking-[-0.03em] mb-3">Catch the next wave</h2>
            <p className="text-white/45 mb-7 text-[15px]">New experiences and early-bird dates, straight to your inbox.</p>
            <form className="flex gap-2">
              <input type="email" placeholder="your@email.com" className="flex-1 px-5 py-3.5 rounded-full border border-white/15 bg-white/[0.06] text-white text-sm outline-none focus:border-[#00afdb] placeholder:text-white/30" />
              <button type="submit" className="px-6 py-3.5 rounded-full text-[13px] font-bold bg-[#ffc42e] text-[#00374a] shadow-[0_4px_14px_rgba(255,196,46,0.26)] hover:bg-[#ffce52] transition-colors">Subscribe</button>
            </form>
          </div>
          <div className="max-w-[1200px] mx-auto px-6 sm:px-8 border-t border-white/[0.07] pt-7 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-white/40">
            <div className="flex items-center gap-3">
              <Link href="/" aria-label="NP7 home">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={NP7_LOGO} alt="NP7" className="h-5 w-auto invert opacity-70 hover:opacity-100 transition-opacity" />
              </Link>
              <span className="whitespace-nowrap">© 2026 NP7 Experience · Nico Prien (GER-7)</span>
            </div>
            <div className="flex flex-wrap justify-center sm:justify-end gap-x-5 gap-y-2">
              <Link href="/hardware" className="hover:text-white transition-colors">Hardware</Link>
              <Link href="#" className="hover:text-white transition-colors">Instagram</Link>
              <Link href="#" className="hover:text-white transition-colors">YouTube</Link>
              <Link href="/widerruf" className="text-white/70 underline underline-offset-2 hover:text-white transition-colors">Withdraw from contract</Link>
            </div>
          </div>
        </section>
      </DepthBackdrop>
      </div>
    </>
  );
}
