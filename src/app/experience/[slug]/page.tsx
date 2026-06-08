import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { OceanHeader, NP7_LOGO } from "@/components/experience/ocean-header";
import { Reveal } from "@/components/experience/reveal";
import { Accordion, type AccordionItem } from "@/components/experience/accordion";
import { StickyCta } from "@/components/experience/sticky-cta";
import { PackagePicker, type RealPackage } from "@/components/experience/package-picker";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

/* ------------------------------- helpers ------------------------------- */

function fmtRange(start?: string | null, end?: string | null) {
  if (!start) return "Dates coming soon";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const year = (e ?? s).getFullYear();
  return e ? `${day(s)} – ${day(e)} ${year}` : `${day(s)} ${year}`;
}

function money(n: number | null | undefined, currency: string | null) {
  if (n == null) return null;
  const symbol = currency === "EUR" || !currency ? "€" : `${currency} `;
  return `${symbol}${n.toLocaleString("en-US")}`;
}

/** "BON001 - Advanced – SOROBON Ocean Front" -> { level, accommodation } */
function parsePackageName(name: string) {
  const stripped = name.replace(/^[A-Za-z0-9]+\s*-\s*/, "").trim();
  const segs = stripped.split("–").map((x) => x.trim()).filter(Boolean);
  return {
    level: segs[0] || "Standard",
    accommodation: segs.slice(1).join(" – ") || "No hotel",
  };
}

const STANDARD_INCLUDED = [
  "6 days of pro coaching with the NP7 team",
  "Daily video analysis & personal focus points",
  "Pro windsurf gear rental included",
  "Breakfast every morning",
  "Airport transfers on location",
  "Group activities & sunset sessions",
];

const METHOD = [
  { n: "01", t: "On-water coaching", d: "Daily guided sessions grouped by level, so you're always pushed at the right pace." },
  { n: "02", t: "Video analysis", d: "We film you, then break it down on the big screen each evening — you see exactly what to change." },
  { n: "03", t: "Focus points", d: "Leave every day with clear things to work on. A year's worth of direction in one week." },
];

const FAQ: AccordionItem[] = [
  { title: "I'm travelling solo — will I fit in?", content: "Absolutely — most guests come alone. Small groups and shared meals mean you'll know everyone by day two." },
  { title: "What level do I need to be?", content: "Anything from total beginner to semi-pro. We group by level so you're always with the right people." },
  { title: "Is gear included?", content: "Yes — pro windsurf gear rental is included in every package. Bring your own harness if you like." },
  { title: "How do flights work?", content: "Flights aren't included so you can find the best route, but we guide you on timing and handle all transfers once you arrive." },
  { title: "What's the cancellation policy?", content: "Secure your spot with a deposit and benefit from a free cancellation window. Full terms are shared at booking." },
];

/* ------------------------------- metadata ------------------------------ */

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await supabase
    .from("exp_experiences")
    .select("title, description, location")
    .eq("slug", slug)
    .eq("status", "published")
    .single();
  if (!data) return { title: "Experience Not Found — NP7" };
  return {
    title: `${data.title} — NP7 Experience`,
    description: data.description || `NP7 Experience in ${data.location}`,
  };
}

/* --------------------------------- page -------------------------------- */

/** Live schema (exp_experiences → exp_editions / exp_packages). The generated
 *  types are stale, so we describe just what this page consumes and cast. */
type Edition = {
  date_start: string | null;
  date_end: string | null;
  max_spots: number | null;
  spots_taken: number | null;
  deposit: number | null;
  status: string | null;
};
type PackageRow = { id: string; name: string; price: number | null; status: string | null };
type Detail = {
  title: string;
  location: string | null;
  currency: string | null;
  price: number | null;
  description: string | null;
  hero_image: string | null;
  airport_code: string | null;
  exp_editions: Edition[] | null;
  exp_packages: PackageRow[] | null;
};

export default async function ExperienceDetailPage({ params }: Props) {
  const { slug } = await params;

  const { data: raw } = await supabase
    .from("exp_experiences")
    .select(
      "title,location,currency,price,description,hero_image,airport_code,exp_editions(date_start,date_end,max_spots,spots_taken,deposit,status),exp_packages(id,name,price,status)"
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  const experience = raw as unknown as Detail | null;
  if (!experience) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const publishedEditions = (experience.exp_editions ?? [])
    .filter((e) => e.status === "published")
    .sort((a, b) => (a.date_start ?? "") < (b.date_start ?? "") ? -1 : 1);
  const edition =
    publishedEditions.find((e) => e.date_start && e.date_start >= today) ??
    publishedEditions[0];

  const rawPackages = (experience.exp_packages ?? []).filter((p) => p.status === "active");

  const spotsLeft =
    edition && edition.max_spots != null
      ? edition.max_spots - (edition.spots_taken ?? 0)
      : null;

  const packages: RealPackage[] = rawPackages
    .filter((p) => p.price != null)
    .map((p) => {
      const parsed = parsePackageName(p.name);
      return { id: p.id, level: parsed.level, accommodation: parsed.accommodation, price: p.price as number };
    });

  const fromPrice =
    packages.length > 0
      ? Math.min(...packages.map((p) => p.price))
      : experience.price;

  const heroImg = experience.hero_image as string | null;

  return (
    <>
      <OceanHeader bookHref="#packages" />

      {/* hero */}
      <section className="relative min-h-[78vh] flex items-end bg-[#00374a] overflow-hidden">
        {heroImg && (
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${heroImg}')` }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#00374a] via-black/35 to-black/30" />
        <div className="relative max-w-[1200px] mx-auto px-6 sm:px-8 pb-14 pt-32 w-full">
          <Reveal from="up">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="text-[12px] font-bold tracking-[0.2em] uppercase text-white/70">{experience.location}</span>
              {typeof spotsLeft === "number" && (
                <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1 rounded-full ${spotsLeft > 0 ? "text-[#5fd0e8] bg-[#00afdb]/15 border border-[#00afdb]/30" : "text-white bg-[#f47b20]"}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  {spotsLeft > 0 ? `Only ${spotsLeft} spots left` : "Fully booked"}
                </span>
              )}
            </div>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white leading-[0.98] tracking-[-0.035em] mb-4 max-w-[820px]">
              {experience.title}
            </h1>
            {edition && (
              <p className="text-[16px] text-white/70 mb-7">{fmtRange(edition.date_start, edition.date_end)}</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Link href="#packages" className="px-7 py-4 rounded-full text-[14px] font-bold text-[#00374a] bg-white hover:-translate-y-0.5 transition-all">
                {money(fromPrice, experience.currency) ? `See packages · from ${money(fromPrice, experience.currency)}` : "See packages"}
              </Link>
              <Link href="#about" className="px-7 py-4 rounded-full text-[14px] font-bold text-white border-[1.5px] border-white/40 hover:bg-white/10 transition-all">
                How it works
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* quick facts */}
      <section className="bg-[#00374a] text-white border-t border-white/10">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 py-7 grid grid-cols-2 sm:grid-cols-4 gap-y-5 gap-x-4">
          {[
            { label: "When", value: edition ? fmtRange(edition.date_start, edition.date_end).replace(/ \d{4}$/, "") : "TBD" },
            { label: "Where", value: experience.location ?? "—" },
            { label: "Group size", value: edition?.max_spots ? `Max ${edition.max_spots} riders` : "Small group" },
            { label: "Airport", value: experience.airport_code ?? "—" },
          ].map((f) => (
            <div key={f.label}>
              <span className="block text-[10px] font-bold tracking-[0.15em] uppercase text-white/40 mb-1">{f.label}</span>
              <span className="block text-[14px] font-bold">{f.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* about */}
      <section id="about" className="scroll-mt-20 bg-[#fff7ec] py-20 sm:py-28">
        <div className="max-w-[820px] mx-auto px-6 sm:px-8">
          <Reveal>
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">ABOUT THIS TRIP</p>
            <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mb-6">{experience.title}</h2>
            {experience.description && (
              <p className="text-[17px] text-[#4a5b62] leading-relaxed mb-10">{experience.description}</p>
            )}
          </Reveal>

          {/* NP7 method */}
          <div className="grid sm:grid-cols-3 gap-4 mb-12">
            {METHOD.map((m, i) => (
              <Reveal key={m.n} delay={i * 90}>
                <div className="h-full bg-white rounded-2xl p-6 border border-[#f0e6d6]">
                  <span className="text-[28px] font-black text-[#00afdb]/35">{m.n}</span>
                  <h3 className="text-[16px] font-extrabold text-[#00374a] mt-1 mb-2">{m.t}</h3>
                  <p className="text-[13.5px] text-[#6a7a80] leading-relaxed">{m.d}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <h3 className="text-lg font-extrabold text-[#00374a] mb-4">Every package includes</h3>
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              {STANDARD_INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] text-[#3a4b52]">
                  <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-[#00afdb]/10 text-[#00afdb] grid place-items-center">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* packages */}
      <section id="packages" className="scroll-mt-20 py-20 sm:py-28">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="text-center max-w-[600px] mx-auto mb-12">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">PACKAGES</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mb-4">Build your week</h2>
            <p className="text-[16px] text-[#6a7a80]">Pick your coaching level and accommodation — your price updates instantly.</p>
          </Reveal>
          {packages.length > 0 ? (
            <Reveal>
              <PackagePicker packages={packages} currency={experience.currency ?? undefined} deposit={edition?.deposit} />
            </Reveal>
          ) : (
            <div className="text-center">
              <p className="text-[#6a7a80] mb-6">Packages for this trip are being finalised.</p>
              <Link href={`mailto:experience@np-seven.com?subject=Enquiry: ${experience.title}`} className="inline-block px-8 py-4 rounded-full text-[14px] font-bold bg-[#00afdb] text-white">Enquire now</Link>
            </div>
          )}
        </div>
      </section>

      {/* faq */}
      <section className="bg-[#fff7ec] py-20 sm:py-28">
        <div className="max-w-[760px] mx-auto px-6 sm:px-8">
          <Reveal className="mb-10 text-center">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">GOOD TO KNOW</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a]">Questions, answered</h2>
          </Reveal>
          <Reveal><Accordion items={FAQ} allowMultiple /></Reveal>
        </div>
      </section>

      {/* final cta */}
      <section className="relative py-24 bg-[#00374a] text-white overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(0,175,219,0.2),transparent_60%)]" />
        <div className="relative max-w-[640px] mx-auto px-6 text-center">
          {typeof spotsLeft === "number" && spotsLeft > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#5fd0e8] bg-[#00afdb]/15 border border-[#00afdb]/30 px-3 py-1 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5fd0e8] animate-pulse" />
              Only {spotsLeft} spots left
            </span>
          )}
          <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] mb-5 leading-[1.05]">Ready for {experience.location?.split(",")[0]}?</h2>
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
            <Link href="/" aria-label="NP7 home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={NP7_LOGO} alt="NP7" className="h-5 w-auto invert opacity-70" />
            </Link>
            <span>© 2026 NP7 Experience</span>
          </div>
          <Link href="/experience" className="hover:text-white transition-colors">← All experiences</Link>
        </div>
      </footer>

      <StickyCta
        title={experience.title}
        priceFrom={fromPrice ?? 0}
        spotsLeft={spotsLeft}
        target="#packages"
      />
    </>
  );
}
