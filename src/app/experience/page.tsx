import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { WaterHero } from "@/components/experience/water-hero";
import { WaveDivider } from "@/components/experience/wave-divider";
import { OceanHeader, NP7_LOGO } from "@/components/experience/ocean-header";
import { Reveal } from "@/components/experience/reveal";
import { Carousel } from "@/components/experience/carousel";

export const metadata: Metadata = {
  title: "NP7 Experience — Premium Watersports Travel",
  description:
    "Guided windsurf, wing & foil trips with Nico Prien (GER-7). World-class coaching, hand-picked crews, and everything arranged.",
};

export const revalidate = 60;

const NP7_EXPERIENCE_LOGO =
  "https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/assets/logos/np7-experience-logo.png";

/* ----------------------------- data shaping ----------------------------- */

type Edition = {
  date_start: string | null;
  date_end: string | null;
  max_spots: number | null;
  spots_taken: number | null;
  status: string | null;
  active: boolean | null;
};

type RawExperience = {
  id: string;
  title: string;
  slug: string;
  location: string | null;
  price: number | null;
  currency: string | null;
  description: string | null;
  hero_image: string | null;
  exp_editions: Edition[] | null;
};

function nextEdition(editions: Edition[] | null) {
  const today = new Date().toISOString().slice(0, 10);
  return (editions ?? [])
    .filter((e) => e.status === "published" && e.date_start && e.date_start >= today)
    .sort((a, b) => (a.date_start! < b.date_start! ? -1 : 1))[0];
}

function fmtRange(start?: string | null, end?: string | null) {
  if (!start) return "Dates coming soon";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const year = (e ?? s).getFullYear();
  return e ? `${day(s)} – ${day(e)} ${year}` : `${day(s)} ${year}`;
}

function money(n: number | null, currency: string | null) {
  if (n == null) return null;
  const symbol = currency === "EUR" || !currency ? "€" : `${currency} `;
  return `${symbol}${n.toLocaleString("en-US")}`;
}

const DISCIPLINES = [
  { name: "Windsurf", tag: "Plane, jibe, send", color: "#00afdb" },
  { name: "Wingfoil", tag: "Fly above the water", color: "#f47b20" },
  { name: "Foil", tag: "Silent, weightless glide", color: "#ffc42e" },
];

/* --------------------------------- page --------------------------------- */

export default async function ExperienceOverviewPage() {
  const { data } = await supabase
    .from("exp_experiences")
    .select(
      "id,title,slug,location,price,currency,description,hero_image,exp_editions(date_start,date_end,max_spots,spots_taken,status,active)"
    )
    .eq("status", "published");

  const experiences = ((data as RawExperience[] | null) ?? [])
    .map((exp) => {
      const ed = nextEdition(exp.exp_editions);
      const spotsLeft =
        ed && ed.max_spots != null ? ed.max_spots - (ed.spots_taken ?? 0) : null;
      return { ...exp, ed, spotsLeft };
    })
    .sort((a, b) => {
      const ad = a.ed?.date_start ?? "9999";
      const bd = b.ed?.date_start ?? "9999";
      return ad < bd ? -1 : 1;
    });

  // unique destinations derived from experience locations
  const destinations = Array.from(
    experiences.reduce((map, e) => {
      const loc = e.location ?? "Somewhere epic";
      if (!map.has(loc)) map.set(loc, { location: loc, image: e.hero_image, count: 0 });
      map.get(loc)!.count += 1;
      return map;
    }, new Map<string, { location: string; image: string | null; count: number }>())
    .values()
  );

  return (
    <>
      <OceanHeader />

      {/* ---------------------------------------------------------------- */}
      {/* HERO — WebGL sun-to-sea water                                     */}
      {/* ---------------------------------------------------------------- */}
      <WaterHero>
        {/* soft dark scrim so the colour-matched logo & text separate from the water */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_58%_48%_at_50%_42%,rgba(0,28,42,0.55)_0%,rgba(0,28,42,0.2)_45%,transparent_75%)]" aria-hidden />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
          <Reveal from="none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={NP7_EXPERIENCE_LOGO}
              alt="NP7 Experience"
              className="w-[280px] sm:w-[400px] lg:w-[460px] h-auto drop-shadow-[0_6px_30px_rgba(0,0,0,0.55)] mb-7"
            />
          </Reveal>
          <Reveal from="up" delay={120}>
            <h1 className="text-3xl sm:text-5xl lg:text-[56px] font-black text-white leading-[0.98] tracking-[-0.03em] drop-shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
              Chase the ride. Find your crew.
            </h1>
          </Reveal>
          <Reveal from="up" delay={200}>
            <p className="mt-5 text-[16px] sm:text-[19px] text-white/85 max-w-[520px] font-medium">
              World-class windsurf, wing &amp; foil trips around the planet — coaching, community and everything arranged for you.
            </p>
          </Reveal>
          <Reveal from="up" delay={240}>
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
          </Reveal>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/60 animate-bounce">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </div>
        </div>
      </WaterHero>

      {/* ---------------------------------------------------------------- */}
      {/* UPCOMING EXPERIENCES                                              */}
      {/* ---------------------------------------------------------------- */}
      <section id="experiences" className="scroll-mt-20 bg-[#fff7ec] pt-20 sm:pt-28 pb-24">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="text-center max-w-[620px] mx-auto mb-14">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">NEXT ON THE WATER</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mb-4">Upcoming experiences</h2>
            <p className="text-[16px] text-[#5a6b72] leading-relaxed">Pick a date, pack your harness — we&apos;ll handle the rest.</p>
          </Reveal>

          {experiences.length === 0 ? (
            <p className="text-center text-[#5a6b72]">New experiences are being planned — check back soon.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {experiences.map((exp, i) => (
                <Reveal key={exp.id} delay={(i % 3) * 90} as="article">
                  <Link
                    href={`/experience/${exp.slug}`}
                    className="group block bg-white rounded-[18px] overflow-hidden border border-[#f0e6d6] hover:-translate-y-1.5 hover:shadow-[0_24px_50px_rgba(0,55,74,0.12)] transition-all duration-300 h-full"
                  >
                    <div className="relative h-[210px] bg-[#e9eef0] bg-cover bg-center overflow-hidden" style={{ backgroundImage: exp.hero_image ? `url('${exp.hero_image}')` : undefined }}>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
                      {typeof exp.spotsLeft === "number" && (
                        <span className={`absolute top-3 right-3 text-[11px] font-bold px-3 py-1.5 rounded-full backdrop-blur-md ${exp.spotsLeft > 0 ? "bg-white/85 text-[#00374a]" : "bg-[#f47b20] text-white"}`}>
                          {exp.spotsLeft > 0 ? `${exp.spotsLeft} spots left` : "Fully booked"}
                        </span>
                      )}
                      <span className="absolute bottom-3 left-3 text-[11px] font-bold tracking-wide uppercase text-white drop-shadow">
                        {exp.location}
                      </span>
                    </div>
                    <div className="p-6">
                      <p className="text-[12px] font-semibold text-[#00afdb] mb-1.5">{fmtRange(exp.ed?.date_start, exp.ed?.date_end)}</p>
                      <h3 className="text-xl font-extrabold tracking-[-0.02em] text-[#00374a] mb-2.5 group-hover:text-[#00afdb] transition-colors">{exp.title}</h3>
                      {exp.description && (
                        <p className="text-[14px] text-[#6a7a80] leading-relaxed line-clamp-2 mb-4">{exp.description}</p>
                      )}
                      <div className="flex items-center justify-between pt-3 border-t border-[#f0f0f0]">
                        {money(exp.price, exp.currency) ? (
                          <span className="text-[15px] font-bold text-[#00374a]">from {money(exp.price, exp.currency)}</span>
                        ) : <span />}
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#00afdb] group-hover:gap-2.5 transition-all">
                          View trip
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                        </span>
                      </div>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      <WaveDivider topColor="#00374a" bottomColor="#fff7ec" />

      {/* ---------------------------------------------------------------- */}
      {/* DESTINATIONS — the deep-dive (dark ocean)                         */}
      {/* ---------------------------------------------------------------- */}
      <section id="destinations" className="scroll-mt-20 bg-[#00374a] text-white pt-16 pb-24 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, #8fe6f2 0, transparent 40%), radial-gradient(circle at 80% 70%, #00afdb 0, transparent 45%)" }} />
        <div className="relative max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="mb-10">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#8fe6f2] mb-3">WHERE WE RIDE</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em]">Destinations</h2>
          </Reveal>
          <Reveal>
            <Carousel label="Destinations">
              {destinations.map((d) => (
                <Link key={d.location} href="#experiences" className="snap-start shrink-0 w-[260px] sm:w-[300px] group">
                  <div className="relative h-[360px] rounded-3xl overflow-hidden">
                    <div className="absolute inset-0 bg-cover bg-center bg-[#0a4a5e] transition-transform duration-500 group-hover:scale-105" style={{ backgroundImage: d.image ? `url('${d.image}')` : undefined }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#00374a] via-[#00374a]/20 to-transparent" />
                    <div className="absolute bottom-0 p-6">
                      <h3 className="text-2xl font-black tracking-[-0.02em]">{d.location}</h3>
                      <p className="text-[12px] font-semibold text-[#8fe6f2] mt-1">{d.count} {d.count === 1 ? "trip" : "trips"} in 2026</p>
                    </div>
                  </div>
                </Link>
              ))}
            </Carousel>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* DISCIPLINES                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section id="disciplines" className="scroll-mt-20 bg-white py-20 sm:py-28">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="text-center max-w-[560px] mx-auto mb-12">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">YOUR SPORT</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a]">Whatever you ride</h2>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-5">
            {DISCIPLINES.map((d, i) => (
              <Reveal key={d.name} delay={i * 100}>
                <div className="group relative rounded-3xl overflow-hidden p-8 h-[220px] flex flex-col justify-end text-white" style={{ background: `linear-gradient(160deg, ${d.color}, #00374a)` }}>
                  <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10 group-hover:scale-125 transition-transform duration-500" />
                  <h3 className="relative text-2xl font-black tracking-[-0.02em]">{d.name}</h3>
                  <p className="relative text-[13px] font-semibold text-white/80 mt-1">{d.tag}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* VIBE / COMMUNITY                                                  */}
      {/* ---------------------------------------------------------------- */}
      <section id="vibe" className="scroll-mt-20 relative py-24 sm:py-32 text-white overflow-hidden" style={{ background: "linear-gradient(165deg,#00afdb,#00374a)" }}>
        <div className="max-w-[820px] mx-auto px-6 sm:px-8 text-center">
          <Reveal>
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#8fe6f2] mb-4">THE NP7 VIBE</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] mb-6 leading-[1.08]">You arrive solo.<br />You leave with a crew.</h2>
            <p className="text-[17px] text-white/75 leading-relaxed">Small groups of good people, shared sunset sessions and beach dinners, and coaching from one of the world&apos;s best. Most riders come once — then rebook with the friends they made.</p>
            <Link href="#experiences" className="inline-block mt-9 px-8 py-4 rounded-full text-[14px] font-bold text-[#00374a] bg-white hover:-translate-y-0.5 transition-all">Find your trip</Link>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* NEWSLETTER + FOOTER (deepest)                                     */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-[#00374a] text-white pt-20 pb-10 border-t border-white/[0.06]">
        <div className="max-w-[480px] mx-auto text-center px-6 mb-16">
          <h2 className="text-3xl font-black tracking-[-0.03em] mb-3">Catch the next wave</h2>
          <p className="text-white/45 mb-7 text-[15px]">New experiences and early-bird dates, straight to your inbox.</p>
          <form className="flex gap-2">
            <input type="email" placeholder="your@email.com" className="flex-1 px-5 py-3.5 rounded-full border border-white/15 bg-white/[0.06] text-white text-sm outline-none focus:border-[#00afdb] placeholder:text-white/30" />
            <button type="submit" className="px-6 py-3.5 rounded-full text-[13px] font-bold bg-[#00afdb] text-white shadow-[0_4px_16px_rgba(0,175,219,0.3)] hover:bg-[#15c0ec] transition-colors">Subscribe</button>
          </form>
        </div>
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 border-t border-white/[0.07] pt-7 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-white/40">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="NP7 home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={NP7_LOGO} alt="NP7" className="h-5 w-auto invert opacity-70 hover:opacity-100 transition-opacity" />
            </Link>
            <span>© 2026 NP7 Experience · Nico Prien (GER-7)</span>
          </div>
          <div className="flex gap-5">
            <Link href="/hardware" className="hover:text-white transition-colors">Hardware</Link>
            <Link href="#" className="hover:text-white transition-colors">Instagram</Link>
            <Link href="#" className="hover:text-white transition-colors">YouTube</Link>
          </div>
        </div>
      </section>
    </>
  );
}
