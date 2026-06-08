import Link from "next/link";
import type { Metadata } from "next";
import { Reveal } from "@/components/experience/reveal";
import { Carousel } from "@/components/experience/carousel";
import { Accordion, type AccordionItem } from "@/components/experience/accordion";
import {
  PackageSelector,
  type CoachingTier,
  type HotelOption,
} from "@/components/experience/package-selector";
import { SectionNav, type NavSection } from "@/components/experience/section-nav";
import { StickyCta } from "@/components/experience/sticky-cta";

export const metadata: Metadata = {
  title: "NP7 Bonaire Experience — Prototype",
  description:
    "Interactive sales-page prototype for NP7 travel experiences. Placeholder content.",
};

/* ------------------------------------------------------------------ */
/*  PLACEHOLDER CONTENT — stand-in for the per-experience CMS fields.  */
/*  Real version will read these from Supabase / the admin panel.     */
/* ------------------------------------------------------------------ */

const IMG = {
  hero: "https://surfcenter-experience.com/wp-content/uploads/2025/01/53724070151_54cd73586b_k-1536x1024.jpg",
  group: "https://surfcenter-experience.com/wp-content/uploads/2025/01/P1021717-Kopie-scaled-e1736503004873.jpg",
  action: "https://surfcenter-experience.com/wp-content/uploads/2025/11/Balz_Muller-5.jpg",
  spot: "https://surfcenter-experience.com/wp-content/uploads/2025/04/4-5-may-768x576.jpg",
  coach: "https://surfcenter-experience.com/wp-content/uploads/2025/11/Rossmeier-2.jpg",
  detail: "https://surfcenter-experience.com/wp-content/uploads/2025/03/21-e1741705621400.jpg",
};

const EXPERIENCE = {
  title: "NP7 Bonaire Experience 2026",
  location: "Bonaire · Dutch Caribbean",
  dateLabel: "30 November – 6 December 2026",
  priceFrom: 2190,
  deposit: 500,
  spotsLeft: 4,
  rating: "4.9",
  reviewCount: 87,
};

const QUICK_FACTS = [
  { icon: "calendar", label: "When", value: "30 Nov – 6 Dec" },
  { icon: "pin", label: "Where", value: "Bonaire, Caribbean" },
  { icon: "wind", label: "Conditions", value: "Flatwater · 12–20 kn" },
  { icon: "users", label: "Group size", value: "Max 14 riders" },
  { icon: "star", label: "Level", value: "Beginner → Semi-Pro" },
  { icon: "plane", label: "Airport", value: "BON · transfers incl." },
];

const USPS = [
  {
    tag: "The crew",
    title: "You arrive solo. You leave with a crew.",
    body: "Small groups of like-minded riders, shared sunset sessions and beach dinners. Most guests come once and rebook with the friends they made.",
    image: IMG.group,
  },
  {
    tag: "The coaching",
    title: "Coached by one of the world's best.",
    body: "Nico Prien (GER-7), top-ranked pro and the biggest windsurf channel on YouTube. Daily video analysis and personal focus points — the NP7 Method.",
    image: IMG.action,
  },
  {
    tag: "The ease",
    title: "Everything handled. You just show up.",
    body: "Hotel, gear, breakfast, beach lunches, transfers and activities — all arranged. No logistics, no stress. Land, ride, repeat.",
    image: IMG.detail,
  },
];

const METHOD_STEPS = [
  {
    n: "01",
    title: "On-water coaching",
    body: "Daily guided sessions in perfect flatwater, grouped by level so you're always with riders who push you at the right pace.",
  },
  {
    n: "02",
    title: "Video analysis",
    body: "We film you on the water. Each evening we break down your riding frame-by-frame on the big screen — you see exactly what to change.",
  },
  {
    n: "03",
    title: "Personal focus points",
    body: "You leave every day with 1–2 clear things to work on. Structured progression, not random tips — a full year's worth of direction in one week.",
  },
];

const INCLUDED = [
  "6 days of pro coaching with Nico + 2 coaches",
  "6 nights in a hand-picked beachfront hotel",
  "Daily video analysis sessions",
  "Pro windsurf gear rental at Jibe City",
  "Breakfast buffet every morning",
  "Healthy beach lunch every day",
  "Airport transfers on Bonaire",
  "Wildlife visits & group activities",
];

const TIERS: CoachingTier[] = [
  {
    id: "nico",
    name: "Coaching with Nico",
    level: "Intermediate · Advanced · Semi-Pro",
    blurb: "Already in the straps? Refine planing, tacks, jibes and freestyle with elite-level coaching.",
    basePrice: 2190,
    popular: true,
    includes: [
      "6 days coaching with Nico Prien",
      "Daily video analysis",
      "Pro gear rental included",
      "Breakfast + daily beach lunch",
      "Airport transfers & activities",
    ],
  },
  {
    id: "starter",
    name: "Starter Group",
    level: "Beginner · First steps",
    blurb: "New or not yet in footstraps & harness? A dedicated beginner coach brings you up to speed fast.",
    basePrice: 1990,
    includes: [
      "6 days with a dedicated beginner coach",
      "Daily video analysis",
      "Beginner-friendly gear included",
      "Breakfast + daily beach lunch",
      "Airport transfers & activities",
    ],
  },
];

const HOTELS: HotelOption[] = [
  {
    id: "sorobon",
    name: "Sorobon Beach Resort",
    rating: "8.9",
    blurb: "Hidden gem right on the lagoon — step off your terrace onto the water.",
    image: IMG.spot,
    priceDelta: 0,
  },
  {
    id: "wanapa",
    name: "Wanapa Boutique Hotel",
    rating: "9.2",
    blurb: "Stylish boutique retreat with pool, a short ride from the spot.",
    image: IMG.detail,
    priceDelta: 200,
  },
];

const ITINERARY: AccordionItem[] = [
  {
    eyebrow: "Day 1",
    title: "Arrival · Registration · Warm-up",
    content: "Land on Bonaire, transfer to your hotel and settle into the Caribbean vibe. Collect your gear and ease into your first session on the water — no pressure, just feel the spot.",
  },
  {
    eyebrow: "Day 2",
    title: "First coaching block + baseline video",
    content: "Level groups are set. Morning on-water coaching, then your first video analysis so we know exactly where you're starting from.",
  },
  {
    eyebrow: "Day 3",
    title: "Technique day + sunset session",
    content: "Focused drills on your personal goals, followed by an optional golden-hour freeride and a group dinner on the beach.",
  },
  {
    eyebrow: "Day 4",
    title: "Wildlife morning + afternoon ride",
    content: "A break from the straps: snorkel or explore the island, then back on the water when the wind fills in.",
  },
  {
    eyebrow: "Day 5",
    title: "Big progression day",
    content: "Everything comes together. Longer sessions, more video, and you'll feel the jump in your riding compared to day one.",
  },
  {
    eyebrow: "Day 6",
    title: "Final session + farewell",
    content: "One last ride with your new crew, a wrap-up of your focus points to take home, and a farewell dinner together.",
  },
];

const COACHES = [
  {
    name: "Nico Prien",
    role: "Pro · GER-7 · Head coach",
    bio: "Top-ranked windsurfer and creator of the biggest windsurf channel on YouTube. Known for a clear, simple coaching style that makes fast progress feel effortless.",
    image: IMG.action,
  },
  {
    name: "Coach Two",
    role: "Freestyle & technique",
    bio: "Years of camp coaching across Bonaire and the Med. Specialises in getting riders confidently into footstraps, harness and their first jibes.",
    image: IMG.coach,
  },
  {
    name: "Coach Three",
    role: "Beginner specialist",
    bio: "Patient, encouraging and great with first-timers. Brings the Starter Group from the basics to planing within the week.",
    image: IMG.spot,
  },
];

const MOMENTS = [
  { quote: "I arrived not knowing anyone and left with a group I'm already booking next year with.", name: "Christian S.", country: "Norway", image: IMG.group },
  { quote: "The video analysis changed everything. I finally understood what I was doing wrong.", name: "Marie L.", country: "Germany", image: IMG.action },
  { quote: "Everything was organised. I just had to show up and ride. Best holiday I've taken.", name: "Tom B.", country: "Netherlands", image: IMG.spot },
  { quote: "Nico breaks things down so simply. A week here is worth a season at home.", name: "Sofia R.", country: "Italy", image: IMG.detail },
];

const GALLERY = [IMG.hero, IMG.action, IMG.group, IMG.spot, IMG.coach, IMG.detail, IMG.hero, IMG.action];

const FAQ: AccordionItem[] = [
  { title: "I'm travelling solo — will I fit in?", content: "Absolutely — most guests come alone. Small group sizes and shared meals mean you'll know everyone by day two." },
  { title: "What level do I need to be?", content: "Anything from total beginner (Starter Group) to semi-pro (Coaching with Nico). We group by level so you're always with the right people." },
  { title: "Is gear included?", content: "Yes. Pro windsurf gear rental at Jibe City is included in every package — bring your harness if you like, but you don't need to ship boards." },
  { title: "How do flights work?", content: "Flights aren't included so you can find the best route, but we guide you on the ideal arrival times and handle all transfers once you land on Bonaire." },
  { title: "What's your cancellation policy?", content: "Secure your spot with a deposit and benefit from a free cancellation window. Full terms are shared at booking." },
];

const NAV_SECTIONS: NavSection[] = [
  { id: "overview", label: "Overview" },
  { id: "coaching", label: "Coaching" },
  { id: "included", label: "What's included" },
  { id: "packages", label: "Packages" },
  { id: "itinerary", label: "Day by day" },
  { id: "crew", label: "The crew" },
  { id: "gallery", label: "Gallery" },
  { id: "faq", label: "FAQ" },
];

/* ------------------------------------------------------------------ */
/*  ICONS                                                              */
/* ------------------------------------------------------------------ */
function FactIcon({ name }: { name: string }) {
  const common = "w-5 h-5";
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "calendar": return <svg className={common} viewBox="0 0 24 24" {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
    case "pin": return <svg className={common} viewBox="0 0 24 24" {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>;
    case "wind": return <svg className={common} viewBox="0 0 24 24" {...p}><path d="M3 8h12a3 3 0 100-6M3 16h16a3 3 0 110 6M3 12h9" /></svg>;
    case "users": return <svg className={common} viewBox="0 0 24 24" {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>;
    case "star": return <svg className={common} viewBox="0 0 24 24" {...p}><path d="M12 2l3 7 7 .5-5.5 4.5 2 7-6.5-4-6.5 4 2-7L2 9.5 9 9z" /></svg>;
    case "plane": return <svg className={common} viewBox="0 0 24 24" {...p}><path d="M17.8 19.2L16 11l3.5-3.5a2.1 2.1 0 00-3-3L13 8 4.8 6.2a.7.7 0 00-.7 1.1L9 11l-2 3-2-.5a.5.5 0 00-.5.8L7 17l1.8 2.5a.5.5 0 00.8-.5L9 17l3-2 3.6 4.9a.7.7 0 001.2-.7z" /></svg>;
    default: return null;
  }
}

/* ------------------------------------------------------------------ */
/*  PAGE                                                               */
/* ------------------------------------------------------------------ */
export default function ExperiencePreviewPage() {
  return (
    <>
      {/* Minimal top bar */}
      <header className="absolute top-0 inset-x-0 z-50">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="bg-white text-[#111] w-9 h-9 rounded-[9px] flex items-center justify-center text-[13px] font-black">NP7</div>
            <span className="text-[11px] font-bold tracking-[0.25em] text-white hidden sm:block">EXPERIENCE</span>
          </Link>
          <Link href="#packages" className="px-5 py-2.5 rounded-full text-[12.5px] font-bold bg-white/10 text-white backdrop-blur-md border border-white/20 hover:bg-white/20 transition-colors">
            Book now
          </Link>
        </div>
      </header>

      {/* ---------------------------------------------------------- */}
      {/* HERO                                                        */}
      {/* ---------------------------------------------------------- */}
      <section className="relative min-h-[92vh] flex items-end overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center scale-105" style={{ backgroundImage: `url('${IMG.hero}')` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/40" />

        <div className="relative w-full max-w-[1200px] mx-auto px-6 sm:px-8 pb-16 sm:pb-20">
          <div className="flex items-center gap-3 mb-5">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white">
              <span className="text-[#ffd24a]">★</span> {EXPERIENCE.rating}
              <span className="text-white/50">({EXPERIENCE.reviewCount} reviews)</span>
            </span>
            {EXPERIENCE.spotsLeft > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#5fd0e8] bg-[#0aa3c7]/15 border border-[#0aa3c7]/30 px-3 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[#5fd0e8] animate-pulse" />
                Only {EXPERIENCE.spotsLeft} spots left
              </span>
            )}
          </div>

          <p className="text-[12px] font-bold tracking-[0.25em] text-white/70 mb-4">
            {EXPERIENCE.location.toUpperCase()} · {EXPERIENCE.dateLabel.toUpperCase()}
          </p>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white leading-[1.0] tracking-[-0.04em] mb-6 max-w-[860px]">
            The No.1 windsurf<br />holiday in the world.
          </h1>
          <p className="text-[16px] sm:text-[18px] text-white/65 max-w-[480px] mb-9">
            Six days of world-class coaching, a hand-picked crew, and a Caribbean island where everything is arranged for you.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="#packages" className="px-7 py-4 rounded-full text-[14px] font-bold bg-[#0aa3c7] text-white shadow-[0_4px_20px_rgba(10,163,199,0.35)] hover:bg-[#0bb6dd] hover:-translate-y-0.5 transition-all">
              See packages · from €{EXPERIENCE.priceFrom.toLocaleString("en-US")}
            </Link>
            <Link href="#overview" className="px-7 py-4 rounded-full text-[14px] font-bold text-white border-[1.5px] border-white/40 hover:bg-white/10 transition-all">
              How it works
            </Link>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/50 animate-bounce">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </div>
      </section>

      {/* Sticky section nav */}
      <SectionNav sections={NAV_SECTIONS} />

      {/* Quick facts bar */}
      <section className="bg-[#111] text-white">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 py-7 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-y-6 gap-x-4">
          {QUICK_FACTS.map((f) => (
            <div key={f.label} className="flex items-center gap-3">
              <span className="text-[#0aa3c7]"><FactIcon name={f.icon} /></span>
              <span>
                <span className="block text-[10px] font-bold tracking-[0.15em] uppercase text-white/40">{f.label}</span>
                <span className="block text-[13.5px] font-bold">{f.value}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* OVERVIEW — the 3 USPs (alternating)                         */}
      {/* ---------------------------------------------------------- */}
      <section id="overview" className="scroll-mt-16 py-20 sm:py-28">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="text-center max-w-[640px] mx-auto mb-16">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#999] mb-3">WHY THIS TRIP</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] mb-4">More than a windsurf trip</h2>
            <p className="text-[16px] text-[#777] leading-relaxed">Three things make an NP7 Experience unforgettable — and they're the reason people come back year after year.</p>
          </Reveal>

          <div className="space-y-16 sm:space-y-24">
            {USPS.map((usp, i) => (
              <div key={usp.tag} className={`grid lg:grid-cols-2 gap-8 lg:gap-16 items-center ${i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}>
                <Reveal from={i % 2 === 1 ? "right" : "left"}>
                  <div className="aspect-[4/3] rounded-3xl bg-cover bg-center shadow-[0_20px_50px_rgba(0,0,0,0.12)]" style={{ backgroundImage: `url('${usp.image}')` }} />
                </Reveal>
                <Reveal from={i % 2 === 1 ? "left" : "right"} delay={100}>
                  <div>
                    <span className="inline-block text-[10px] font-extrabold tracking-[0.2em] uppercase px-3 py-1.5 rounded-full bg-[#0aa3c7]/10 text-[#0aa3c7] mb-5">{usp.tag}</span>
                    <h3 className="text-2xl sm:text-3xl font-black tracking-[-0.02em] mb-4 leading-[1.1]">{usp.title}</h3>
                    <p className="text-[16px] text-[#666] leading-relaxed">{usp.body}</p>
                  </div>
                </Reveal>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* COACHING — the NP7 Method                                   */}
      {/* ---------------------------------------------------------- */}
      <section id="coaching" className="scroll-mt-16 py-20 sm:py-28 bg-[#111] text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        <div className="relative max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="max-w-[640px] mb-14">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#0aa3c7] mb-3">THE NP7 METHOD</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] mb-4">A full year of progress in one week</h2>
            <p className="text-[16px] text-white/55 leading-relaxed">Nico&apos;s coaching is simple, structured and tailored to you. Three things repeat every single day — and they&apos;re why riders leave transformed.</p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-5">
            {METHOD_STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 110} className="h-full">
                <div className="h-full rounded-3xl bg-white/[0.04] border border-white/10 p-7 hover:bg-white/[0.07] transition-colors">
                  <span className="text-[40px] font-black text-[#0aa3c7]/40 tracking-tight">{s.n}</span>
                  <h3 className="text-xl font-extrabold mt-2 mb-3 tracking-[-0.01em]">{s.title}</h3>
                  <p className="text-[14.5px] text-white/60 leading-relaxed">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* INCLUDED                                                    */}
      {/* ---------------------------------------------------------- */}
      <section id="included" className="scroll-mt-16 py-20 sm:py-28">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 grid lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-20 items-center">
          <Reveal from="left">
            <div className="aspect-[4/5] rounded-3xl bg-cover bg-center shadow-[0_20px_50px_rgba(0,0,0,0.12)]" style={{ backgroundImage: `url('${IMG.spot}')` }} />
          </Reveal>
          <Reveal from="right">
            <div>
              <p className="text-[11px] font-bold tracking-[0.25em] text-[#999] mb-3">ALL ARRANGED</p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] mb-4">You just show up</h2>
              <p className="text-[16px] text-[#777] leading-relaxed mb-8">No logistics, no planning, no stress. Every package includes everything you need for the week:</p>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3.5">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[15px] text-[#333]">
                    <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-[#0aa3c7]/10 text-[#0aa3c7] grid place-items-center">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* PACKAGES — interactive selector                             */}
      {/* ---------------------------------------------------------- */}
      <section id="packages" className="scroll-mt-16 py-20 sm:py-28 bg-[#f7f7f7]">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="text-center max-w-[600px] mx-auto mb-12">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#999] mb-3">PACKAGES</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] mb-4">Build your week</h2>
            <p className="text-[16px] text-[#777] leading-relaxed">Pick your coaching group and your hotel — your price updates instantly.</p>
          </Reveal>
          <Reveal>
            <PackageSelector tiers={TIERS} hotels={HOTELS} deposit={EXPERIENCE.deposit} />
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* ITINERARY — accordion timeline                              */}
      {/* ---------------------------------------------------------- */}
      <section id="itinerary" className="scroll-mt-16 py-20 sm:py-28">
        <div className="max-w-[760px] mx-auto px-6 sm:px-8">
          <Reveal className="mb-12">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#999] mb-3">DAY BY DAY</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] mb-4">Your week on Bonaire</h2>
            <p className="text-[16px] text-[#777] leading-relaxed">Tap any day to see what&apos;s planned. It&apos;s all mapped out — you just enjoy it.</p>
          </Reveal>
          <Reveal>
            <Accordion items={ITINERARY} defaultOpen={0} variant="timeline" />
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* CREW — coaches + moments carousels                          */}
      {/* ---------------------------------------------------------- */}
      <section id="crew" className="scroll-mt-16 py-20 sm:py-28 bg-[#f7f7f7]">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="mb-10">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#999] mb-3">YOUR COACHES</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em]">Learn from the best</h2>
          </Reveal>
          <Reveal className="mb-20">
            <Carousel label="Coaches">
              {COACHES.map((c) => (
                <article key={c.name} className="snap-start shrink-0 w-[300px] sm:w-[340px] bg-white rounded-3xl overflow-hidden border border-[#ebebeb]">
                  <div className="h-[260px] bg-cover bg-center" style={{ backgroundImage: `url('${c.image}')` }} />
                  <div className="p-6">
                    <h3 className="text-lg font-extrabold tracking-[-0.01em]">{c.name}</h3>
                    <p className="text-[11px] font-bold tracking-wide uppercase text-[#0aa3c7] mb-3">{c.role}</p>
                    <p className="text-[14px] text-[#666] leading-relaxed">{c.bio}</p>
                  </div>
                </article>
              ))}
            </Carousel>
          </Reveal>

          <Reveal className="mb-10">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#999] mb-3">THE CREW</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em]">Moments &amp; new friends</h2>
          </Reveal>
          <Reveal>
            <Carousel label="Guest moments">
              {MOMENTS.map((m, i) => (
                <article key={i} className="snap-start shrink-0 w-[300px] sm:w-[380px] relative rounded-3xl overflow-hidden h-[420px]">
                  <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${m.image}')` }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 p-7 text-white">
                    <span className="text-[#ffd24a] text-sm">★★★★★</span>
                    <p className="text-[17px] font-bold leading-snug mt-3 mb-4">&ldquo;{m.quote}&rdquo;</p>
                    <p className="text-[13px] text-white/70 font-semibold">{m.name} · {m.country}</p>
                  </div>
                </article>
              ))}
            </Carousel>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* GALLERY                                                     */}
      {/* ---------------------------------------------------------- */}
      <section id="gallery" className="scroll-mt-16 py-20 sm:py-28">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="mb-10 text-center">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#999] mb-3">GALLERY</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em]">A week in pictures</h2>
          </Reveal>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {GALLERY.map((src, i) => (
              <Reveal key={i} delay={(i % 4) * 80} className={i % 5 === 0 ? "col-span-2 row-span-2" : ""}>
                <div className={`bg-cover bg-center rounded-2xl ${i % 5 === 0 ? "aspect-square" : "aspect-square"} hover:opacity-90 transition-opacity cursor-pointer`} style={{ backgroundImage: `url('${src}')` }} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* FAQ                                                         */}
      {/* ---------------------------------------------------------- */}
      <section id="faq" className="scroll-mt-16 py-20 sm:py-28 bg-[#f7f7f7]">
        <div className="max-w-[760px] mx-auto px-6 sm:px-8">
          <Reveal className="mb-12 text-center">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#999] mb-3">GOOD TO KNOW</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em]">Questions, answered</h2>
          </Reveal>
          <Reveal>
            <Accordion items={FAQ} allowMultiple />
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/* FINAL CTA                                                   */}
      {/* ---------------------------------------------------------- */}
      <section className="py-24 sm:py-32 bg-[#111] text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(10,163,199,0.18)_0%,transparent_60%)]" />
        <div className="relative max-w-[640px] mx-auto px-6 sm:px-8 text-center">
          {EXPERIENCE.spotsLeft > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#5fd0e8] bg-[#0aa3c7]/15 border border-[#0aa3c7]/30 px-3 py-1 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5fd0e8] animate-pulse" />
              Only {EXPERIENCE.spotsLeft} spots left for {EXPERIENCE.dateLabel}
            </span>
          )}
          <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] mb-5 leading-[1.05]">Ready for your dream week?</h2>
          <p className="text-[17px] text-white/55 mb-9">Reserve your spot now, or tell us you&apos;re interested and we&apos;ll hold a place while you decide.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="#packages" className="px-8 py-4 rounded-full text-[14px] font-bold bg-[#0aa3c7] text-white shadow-[0_4px_20px_rgba(10,163,199,0.35)] hover:bg-[#0bb6dd] hover:-translate-y-0.5 transition-all">
              Reserve my spot
            </Link>
            <Link href="#" className="px-8 py-4 rounded-full text-[14px] font-bold text-white border-[1.5px] border-white/40 hover:bg-white/10 transition-all">
              I&apos;m interested
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-[#111] text-white/40 border-t border-white/[0.06] py-8">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 text-[11px]">
          © 2026 NP7 Experience · Prototype page (placeholder content)
        </div>
      </footer>

      {/* Sticky bottom booking bar */}
      <StickyCta
        title={EXPERIENCE.title}
        priceFrom={EXPERIENCE.priceFrom}
        spotsLeft={EXPERIENCE.spotsLeft}
        target="#packages"
      />
    </>
  );
}
