import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { OceanHeader, NP7_LOGO } from "@/components/experience/ocean-header";
import { Reveal } from "@/components/experience/reveal";
import { Carousel } from "@/components/experience/carousel";
import { Accordion, type AccordionItem } from "@/components/experience/accordion";
import { SectionNav, type NavSection } from "@/components/experience/section-nav";
import { StickyCta } from "@/components/experience/sticky-cta";
import { PackagePicker, type RealPackage } from "@/components/experience/package-picker";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

/* -------- evergreen brand content (per-trip fields come from admin later) -------- */
const BRAND_IMG = {
  group: "https://surfcenter-experience.com/wp-content/uploads/2025/01/P1021717-Kopie-scaled-e1736503004873.jpg",
  action: "https://surfcenter-experience.com/wp-content/uploads/2025/11/Balz_Muller-5.jpg",
  ease: "https://surfcenter-experience.com/wp-content/uploads/2025/03/21-e1741705621400.jpg",
  spot: "https://surfcenter-experience.com/wp-content/uploads/2025/04/4-5-may-768x576.jpg",
  coach: "https://surfcenter-experience.com/wp-content/uploads/2025/11/Rossmeier-2.jpg",
};

const USPS = [
  { tag: "The crew", title: "You arrive solo. You leave with a crew.", body: "Small groups of like-minded riders, shared sunset sessions and beach dinners. Most guests come once and rebook with the friends they made.", image: BRAND_IMG.group },
  { tag: "The coaching", title: "Coached by one of the world's best.", body: "Nico Prien (GER-7), top-ranked pro and the biggest windsurf channel on YouTube. Daily video analysis and personal focus points — the NP7 Method.", image: BRAND_IMG.action },
  { tag: "The ease", title: "Everything handled. You just show up.", body: "Hotel, gear, breakfast, beach lunches, transfers and activities — all arranged. No logistics, no stress. Land, ride, repeat.", image: BRAND_IMG.ease },
];

const METHOD = [
  { n: "01", t: "On-water coaching", d: "Daily guided sessions, grouped by level so you're always pushed at the right pace." },
  { n: "02", t: "Video analysis", d: "We film you on the water, then break it down on the big screen each evening — you see exactly what to change." },
  { n: "03", t: "Focus points", d: "Leave every day with clear things to work on. A year's worth of direction in one week." },
];

const STANDARD_INCLUDED = [
  "6 days of pro coaching with the NP7 team",
  "Daily video analysis sessions",
  "Pro windsurf gear rental included",
  "Breakfast every morning",
  "Healthy beach lunch most days",
  "Airport transfers on location",
  "Group activities & sunset sessions",
  "A crew you'll want to come back for",
];

const ITINERARY: AccordionItem[] = [
  { eyebrow: "Day 1", title: "Arrival · Registration · Warm-up", content: "Land, transfer to your hotel and settle into the vibe. Collect your gear and ease into your first session — no pressure, just feel the spot." },
  { eyebrow: "Day 2", title: "First coaching block + baseline video", content: "Level groups are set. Morning on-water coaching, then your first video analysis so we know exactly where you're starting from." },
  { eyebrow: "Day 3", title: "Technique day + sunset session", content: "Focused drills on your personal goals, followed by an optional golden-hour freeride and a group dinner." },
  { eyebrow: "Day 4", title: "Activity morning + afternoon ride", content: "A break from the straps: explore the destination, then back on the water when the wind fills in." },
  { eyebrow: "Day 5", title: "Big progression day", content: "Everything comes together. Longer sessions, more video, and you'll feel the jump compared to day one." },
  { eyebrow: "Day 6", title: "Final session + farewell", content: "One last ride with your new crew, a wrap-up of your focus points to take home, and a farewell dinner." },
];

const COACHES = [
  { name: "Nico Prien", role: "Pro · GER-7 · Head coach", bio: "Top-ranked windsurfer and creator of the biggest windsurf channel on YouTube. Known for a clear, simple coaching style that makes fast progress feel effortless.", image: BRAND_IMG.action },
  { name: "NP7 Coach", role: "Freestyle & technique", bio: "Years of camp coaching. Specialises in getting riders confidently into footstraps, harness and their first jibes.", image: BRAND_IMG.coach },
  { name: "Beginner Coach", role: "First-timer specialist", bio: "Patient, encouraging and great with first-timers — from the basics to planing within the week.", image: BRAND_IMG.spot },
];

const MOMENTS = [
  { quote: "I arrived not knowing anyone and left with a group I'm already booking next year with.", name: "Christian S.", country: "Norway", image: BRAND_IMG.group },
  { quote: "The video analysis changed everything. I finally understood what I was doing wrong.", name: "Marie L.", country: "Germany", image: BRAND_IMG.action },
  { quote: "Everything was organised. I just had to show up and ride. Best holiday I've taken.", name: "Tom B.", country: "Netherlands", image: BRAND_IMG.spot },
];

const FAQ: AccordionItem[] = [
  { title: "I'm travelling solo — will I fit in?", content: "Absolutely — most guests come alone. Small groups and shared meals mean you'll know everyone by day two." },
  { title: "What level do I need to be?", content: "Anything from total beginner to semi-pro. We group by level so you're always with the right people." },
  { title: "Is gear included?", content: "Yes — pro windsurf gear rental is included in every package. Bring your own harness if you like." },
  { title: "How do flights work?", content: "Flights aren't included so you can find the best route, but we guide you on timing and handle all transfers once you arrive." },
  { title: "What's the cancellation policy?", content: "Secure your spot with a deposit and benefit from a free cancellation window. Full terms are shared at booking." },
];

/* ------------------------------- helpers ------------------------------- */
function fmtRange(start?: string | null, end?: string | null) {
  if (!start) return "Dates coming soon";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  return e ? `${day(s)} – ${day(e)} ${(e ?? s).getFullYear()}` : `${day(s)} ${s.getFullYear()}`;
}
function fmtShort(start?: string | null, end?: string | null) {
  if (!start) return "TBD";
  const s = new Date(start), e = end ? new Date(end) : null;
  const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return e ? `${day(s)} – ${day(e)}` : day(s);
}
function money(n: number | null | undefined, currency: string | null) {
  if (n == null) return null;
  const symbol = currency === "EUR" || !currency ? "€" : `${currency} `;
  return `${symbol}${n.toLocaleString("en-US")}`;
}
function parsePackageName(name: string) {
  const stripped = name.replace(/^[A-Za-z0-9]+\s*-\s*/, "").trim();
  const segs = stripped.split("–").map((x) => x.trim()).filter(Boolean);
  return { level: segs[0] || "Standard", accommodation: segs.slice(1).join(" – ") || "No hotel" };
}

function FactIcon({ name }: { name: string }) {
  const c = "w-5 h-5";
  const p = { fill: "none" as const, stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "calendar": return <svg className={c} viewBox="0 0 24 24" {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
    case "pin": return <svg className={c} viewBox="0 0 24 24" {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>;
    case "users": return <svg className={c} viewBox="0 0 24 24" {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>;
    case "plane": return <svg className={c} viewBox="0 0 24 24" {...p}><path d="M17.8 19.2L16 11l3.5-3.5a2.1 2.1 0 00-3-3L13 8 4.8 6.2a.7.7 0 00-.7 1.1L9 11l-2 3-2-.5a.5.5 0 00-.5.8L7 17l1.8 2.5a.5.5 0 00.8-.5L9 17l3-2 3.6 4.9a.7.7 0 001.2-.7z" /></svg>;
    default: return null;
  }
}

/* live schema (generated types are stale) */
type Edition = { date_start: string | null; date_end: string | null; max_spots: number | null; spots_taken: number | null; deposit: number | null; status: string | null };
type PackageRow = { id: string; name: string; price: number | null; status: string | null };
type Detail = {
  title: string; location: string | null; currency: string | null; price: number | null;
  description: string | null; hero_image: string | null; gallery: string[] | null; airport_code: string | null;
  exp_editions: Edition[] | null; exp_packages: PackageRow[] | null;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await supabase
    .from("exp_experiences").select("title, description, location")
    .eq("slug", slug).eq("status", "published").maybeSingle();
  if (!data) return { title: "Experience Not Found — NP7" };
  return { title: `${data.title} — NP7 Experience`, description: data.description || `NP7 Experience in ${data.location}` };
}

export default async function ExperienceDetailPage({ params }: Props) {
  const { slug } = await params;
  const { data: raw } = await supabase
    .from("exp_experiences")
    .select("title,location,currency,price,description,hero_image,gallery,airport_code,exp_editions(date_start,date_end,max_spots,spots_taken,deposit,status),exp_packages(id,name,price,status)")
    .eq("slug", slug).eq("status", "published").maybeSingle();

  const experience = raw as unknown as Detail | null;
  if (!experience) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const editions = (experience.exp_editions ?? []).filter((e) => e.status === "published")
    .sort((a, b) => ((a.date_start ?? "") < (b.date_start ?? "") ? -1 : 1));
  const edition = editions.find((e) => e.date_start && e.date_start >= today) ?? editions[0];
  const spotsLeft = edition?.max_spots != null ? edition.max_spots - (edition.spots_taken ?? 0) : null;

  const packages: RealPackage[] = (experience.exp_packages ?? [])
    .filter((p) => p.status === "active" && p.price != null)
    .map((p) => { const x = parsePackageName(p.name); return { id: p.id, level: x.level, accommodation: x.accommodation, price: p.price as number }; });

  const fromPrice = packages.length ? Math.min(...packages.map((p) => p.price)) : experience.price;
  const heroImg = experience.hero_image;
  const gallery = (experience.gallery ?? []).filter(Boolean);
  const place = experience.location?.split(",")[0] ?? "the water";

  const navSections: NavSection[] = [
    { id: "overview", label: "Overview" },
    { id: "coaching", label: "Coaching" },
    { id: "included", label: "Included" },
    { id: "packages", label: "Packages" },
    { id: "itinerary", label: "Day by day" },
    { id: "crew", label: "The crew" },
    ...(gallery.length ? [{ id: "gallery", label: "Gallery" }] : []),
    { id: "faq", label: "FAQ" },
  ];

  return (
    <>
      <OceanHeader bookHref="#packages" />

      {/* HERO */}
      <section className="relative min-h-[88vh] flex items-end bg-[#00374a] overflow-hidden">
        {heroImg && <div className="absolute inset-0 bg-cover bg-center scale-105" style={{ backgroundImage: `url('${heroImg}')` }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#00374a] via-black/35 to-black/35" />
        <div className="relative w-full max-w-[1200px] mx-auto px-6 sm:px-8 pb-16 pt-32">
          <Reveal from="up">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="text-[12px] font-bold tracking-[0.2em] uppercase text-white/75">{experience.location}</span>
              {typeof spotsLeft === "number" && (
                <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1 rounded-full ${spotsLeft > 0 ? "text-[#5fd0e8] bg-[#00afdb]/15 border border-[#00afdb]/30" : "text-white bg-[#f47b20]"}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  {spotsLeft > 0 ? `Only ${spotsLeft} spots left` : "Fully booked"}
                </span>
              )}
            </div>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white leading-[0.98] tracking-[-0.035em] mb-4 max-w-[840px]">{experience.title}</h1>
            {edition && <p className="text-[16px] sm:text-[17px] text-white/70 mb-8">{fmtRange(edition.date_start, edition.date_end)}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Link href="#packages" className="px-7 py-4 rounded-full text-[14px] font-bold text-[#00374a] bg-white hover:-translate-y-0.5 transition-all">
                {money(fromPrice, experience.currency) ? `See packages · from ${money(fromPrice, experience.currency)}` : "See packages"}
              </Link>
              <Link href="#overview" className="px-7 py-4 rounded-full text-[14px] font-bold text-white border-[1.5px] border-white/40 hover:bg-white/10 transition-all">How it works</Link>
            </div>
          </Reveal>
        </div>
      </section>

      <SectionNav sections={navSections} />

      {/* QUICK FACTS */}
      <section className="bg-[#00374a] text-white">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 py-7 grid grid-cols-2 sm:grid-cols-4 gap-y-6 gap-x-4">
          {[
            { icon: "calendar", label: "When", value: fmtShort(edition?.date_start, edition?.date_end) },
            { icon: "pin", label: "Where", value: experience.location ?? "—" },
            { icon: "users", label: "Group size", value: edition?.max_spots ? `Max ${edition.max_spots}` : "Small group" },
            { icon: "plane", label: "Airport", value: experience.airport_code ?? "—" },
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-3">
              <span className="text-[#00afdb]"><FactIcon name={f.icon} /></span>
              <span><span className="block text-[10px] font-bold tracking-[0.15em] uppercase text-white/40">{f.label}</span><span className="block text-[13.5px] font-bold">{f.value}</span></span>
            </div>
          ))}
        </div>
      </section>

      {/* OVERVIEW — USPs */}
      <section id="overview" className="scroll-mt-16 py-20 sm:py-28">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="text-center max-w-[640px] mx-auto mb-16">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">WHY THIS TRIP</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mb-4">More than a windsurf trip</h2>
            {experience.description && <p className="text-[16px] text-[#6a7a80] leading-relaxed">{experience.description}</p>}
          </Reveal>
          <div className="space-y-16 sm:space-y-24">
            {USPS.map((u, i) => (
              <div key={u.tag} className={`grid lg:grid-cols-2 gap-8 lg:gap-16 items-center ${i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}>
                <Reveal from={i % 2 === 1 ? "right" : "left"}>
                  <div className="aspect-[4/3] rounded-3xl bg-cover bg-center shadow-[0_20px_50px_rgba(0,55,74,0.12)]" style={{ backgroundImage: `url('${u.image}')` }} />
                </Reveal>
                <Reveal from={i % 2 === 1 ? "left" : "right"} delay={100}>
                  <div>
                    <span className="inline-block text-[10px] font-extrabold tracking-[0.2em] uppercase px-3 py-1.5 rounded-full bg-[#00afdb]/10 text-[#00afdb] mb-5">{u.tag}</span>
                    <h3 className="text-2xl sm:text-3xl font-black tracking-[-0.02em] text-[#00374a] mb-4 leading-[1.1]">{u.title}</h3>
                    <p className="text-[16px] text-[#5a6b72] leading-relaxed">{u.body}</p>
                  </div>
                </Reveal>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COACHING — NP7 Method */}
      <section id="coaching" className="scroll-mt-16 py-20 sm:py-28 bg-[#00374a] text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)", backgroundSize: "60px 60px" }} />
        <div className="relative max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="max-w-[640px] mb-14">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#8fe6f2] mb-3">THE NP7 METHOD</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] mb-4">A full year of progress in one week</h2>
            <p className="text-[16px] text-white/55 leading-relaxed">Simple, structured and tailored to you. Three things repeat every day — and they&apos;re why riders leave transformed.</p>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5">
            {METHOD.map((s, i) => (
              <Reveal key={s.n} delay={i * 110} className="h-full">
                <div className="h-full rounded-3xl bg-white/[0.04] border border-white/10 p-7">
                  <span className="text-[40px] font-black text-[#00afdb]/40">{s.n}</span>
                  <h3 className="text-xl font-extrabold mt-2 mb-3">{s.t}</h3>
                  <p className="text-[14.5px] text-white/60 leading-relaxed">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* INCLUDED */}
      <section id="included" className="scroll-mt-16 py-20 sm:py-28">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 grid lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-20 items-center">
          <Reveal from="left">
            <div className="aspect-[4/5] rounded-3xl bg-cover bg-center shadow-[0_20px_50px_rgba(0,55,74,0.12)]" style={{ backgroundImage: `url('${heroImg ?? BRAND_IMG.spot}')` }} />
          </Reveal>
          <Reveal from="right">
            <div>
              <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">ALL ARRANGED</p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mb-4">You just show up</h2>
              <p className="text-[16px] text-[#6a7a80] leading-relaxed mb-8">No logistics, no planning, no stress. Every package includes everything you need for the week:</p>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3.5">
                {STANDARD_INCLUDED.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[15px] text-[#3a4b52]">
                    <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-[#00afdb]/10 text-[#00afdb] grid place-items-center"><svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* PACKAGES */}
      <section id="packages" className="scroll-mt-16 py-20 sm:py-28 bg-[#f7f7f7]">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="text-center max-w-[600px] mx-auto mb-12">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">PACKAGES</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mb-4">Build your week</h2>
            <p className="text-[16px] text-[#6a7a80]">Pick your coaching level and accommodation — your price updates instantly.</p>
          </Reveal>
          {packages.length ? (
            <Reveal><PackagePicker packages={packages} currency={experience.currency ?? undefined} deposit={edition?.deposit} /></Reveal>
          ) : (
            <div className="text-center">
              <p className="text-[#6a7a80] mb-6">Packages for this trip are being finalised.</p>
              <Link href={`mailto:experience@np-seven.com?subject=Enquiry: ${experience.title}`} className="inline-block px-8 py-4 rounded-full text-[14px] font-bold bg-[#00afdb] text-white">Enquire now</Link>
            </div>
          )}
        </div>
      </section>

      {/* ITINERARY */}
      <section id="itinerary" className="scroll-mt-16 py-20 sm:py-28">
        <div className="max-w-[760px] mx-auto px-6 sm:px-8">
          <Reveal className="mb-12">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">DAY BY DAY</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mb-4">Your week in {place}</h2>
            <p className="text-[16px] text-[#6a7a80] leading-relaxed">Tap any day to see what&apos;s planned. It&apos;s all mapped out — you just enjoy it.</p>
          </Reveal>
          <Reveal><Accordion items={ITINERARY} defaultOpen={0} variant="timeline" /></Reveal>
        </div>
      </section>

      {/* CREW */}
      <section id="crew" className="scroll-mt-16 py-20 sm:py-28 bg-[#f7f7f7]">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="mb-10"><p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">YOUR COACHES</p><h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a]">Learn from the best</h2></Reveal>
          <Reveal className="mb-20">
            <Carousel label="Coaches">
              {COACHES.map((c) => (
                <article key={c.name} className="snap-start shrink-0 w-[300px] sm:w-[340px] bg-white rounded-3xl overflow-hidden border border-[#ebebeb]">
                  <div className="h-[260px] bg-cover bg-center" style={{ backgroundImage: `url('${c.image}')` }} />
                  <div className="p-6"><h3 className="text-lg font-extrabold text-[#00374a]">{c.name}</h3><p className="text-[11px] font-bold tracking-wide uppercase text-[#00afdb] mb-3">{c.role}</p><p className="text-[14px] text-[#6a7a80] leading-relaxed">{c.bio}</p></div>
                </article>
              ))}
            </Carousel>
          </Reveal>
          <Reveal className="mb-10"><p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">THE CREW</p><h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a]">Moments &amp; new friends</h2></Reveal>
          <Reveal>
            <Carousel label="Guest moments">
              {MOMENTS.map((m, i) => (
                <article key={i} className="snap-start shrink-0 w-[300px] sm:w-[380px] relative rounded-3xl overflow-hidden h-[420px]">
                  <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${m.image}')` }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 p-7 text-white"><span className="text-[#ffd24a] text-sm">★★★★★</span><p className="text-[17px] font-bold leading-snug mt-3 mb-4">&ldquo;{m.quote}&rdquo;</p><p className="text-[13px] text-white/70 font-semibold">{m.name} · {m.country}</p></div>
                </article>
              ))}
            </Carousel>
          </Reveal>
        </div>
      </section>

      {/* GALLERY (only if the trip has photos) */}
      {gallery.length > 0 && (
        <section id="gallery" className="scroll-mt-16 py-20 sm:py-28">
          <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
            <Reveal className="mb-10 text-center"><p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">GALLERY</p><h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a]">A week in pictures</h2></Reveal>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {gallery.map((src, i) => (
                <Reveal key={i} delay={(i % 4) * 80} className={i % 5 === 0 ? "col-span-2 row-span-2" : ""}>
                  <div className="aspect-square bg-cover bg-center rounded-2xl hover:opacity-90 transition-opacity" style={{ backgroundImage: `url('${src}')` }} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      <section id="faq" className="scroll-mt-16 py-20 sm:py-28 bg-[#f7f7f7]">
        <div className="max-w-[760px] mx-auto px-6 sm:px-8">
          <Reveal className="mb-12 text-center"><p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">GOOD TO KNOW</p><h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a]">Questions, answered</h2></Reveal>
          <Reveal><Accordion items={FAQ} allowMultiple /></Reveal>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative py-24 sm:py-32 bg-[#00374a] text-white overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(0,175,219,0.2),transparent_60%)]" />
        <div className="relative max-w-[640px] mx-auto px-6 text-center">
          {typeof spotsLeft === "number" && spotsLeft > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#5fd0e8] bg-[#00afdb]/15 border border-[#00afdb]/30 px-3 py-1 rounded-full mb-6"><span className="w-1.5 h-1.5 rounded-full bg-[#5fd0e8] animate-pulse" />Only {spotsLeft} spots left</span>
          )}
          <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] mb-5 leading-[1.05]">Ready for {place}?</h2>
          <p className="text-[17px] text-white/55 mb-9">Reserve your spot now, or tell us you&apos;re interested and we&apos;ll hold a place while you decide.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="#packages" className="px-8 py-4 rounded-full text-[14px] font-bold text-[#00374a] bg-white hover:-translate-y-0.5 transition-all">Reserve my spot</Link>
            <Link href={`mailto:experience@np-seven.com?subject=Interested: ${experience.title}`} className="px-8 py-4 rounded-full text-[14px] font-bold text-white border-[1.5px] border-white/40 hover:bg-white/10 transition-all">I&apos;m interested</Link>
          </div>
        </div>
      </section>

      <footer className="bg-[#00374a] text-white/40 border-t border-white/[0.06] py-8">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 flex items-center justify-between gap-4 text-[12px]">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="NP7 home">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={NP7_LOGO} alt="NP7" className="h-5 w-auto invert opacity-70" /></Link>
            <span>© 2026 NP7 Experience</span>
          </div>
          <Link href="/experience" className="hover:text-white transition-colors">← All experiences</Link>
        </div>
      </footer>

      <StickyCta title={experience.title} priceFrom={fromPrice ?? 0} spotsLeft={spotsLeft} target="#packages" />
    </>
  );
}
