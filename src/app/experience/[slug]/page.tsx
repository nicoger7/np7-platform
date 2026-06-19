import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { OceanHeader, NP7_LOGO } from "@/components/experience/ocean-header";
import { Reveal } from "@/components/experience/reveal";
import { Carousel } from "@/components/experience/carousel";
import { Accordion, type AccordionItem } from "@/components/experience/accordion";
import { StickyCta } from "@/components/experience/sticky-cta";
import { type RealPackage } from "@/components/experience/package-picker";
import { EditionBooking, type EditionLite } from "@/components/experience/edition-booking";
import { HeroVideo } from "@/components/experience/hero-video";
import { GalleryStrip } from "@/components/experience/gallery-strip";
import { Slideshow } from "@/components/experience/slideshow";
import { EpicWeekScroll } from "@/components/experience/epic-week-scroll";

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

/* The outcome stack — what you take home. Transformation, not features. */
const OUTCOMES = [
  { icon: "bolt", t: "Real confidence on the water", d: "Comfortable in more wind and chop than you arrived in — stance locked, fear gone." },
  { icon: "gauge", t: "Control & speed", d: "Effortless, controlled, faster riding — from straight-line speed to clean transitions." },
  { icon: "rotate", t: "Better jibes", d: "The move everyone wants, broken into steps that finally click." },
  { icon: "idea", t: "A year's worth of knowledge", d: "Maneuver know-how, equipment insights, and your personal roadmap for what to work on next." },
  { icon: "globe", t: "Friends from all over the world", d: "A small, hand-picked group of people who love this as much as you do." },
  { icon: "camera", t: "Your week on photo & video", d: "We shoot the whole week — you take the proof home." },
];

/* The NP7 Method — the unique mechanism (copy grounded in surfcenter-experience). */
const METHOD_INTRO =
  "Nico's proven coaching approach, developed teaching hundreds of thousands of windsurfers through YouTube and camps worldwide. Complex movements, broken into clear, actionable steps — tailored to you.";
const METHOD = [
  { n: "01", t: "Structured coaching scheme", d: "Every session builds on the last. Level groups, clear progression, no random tips — a system that compounds through the week." },
  { n: "02", t: "Daily focus points", d: "You always know the one thing to work on next session. Simple, personal, and it sticks." },
  { n: "03", t: "Video analysis", d: "We film you on the water and break it down frame-by-frame each evening. Seeing yourself is what makes it click — riders call it the single biggest unlock of the week.", gameChanger: true },
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
  { title: "What's not included?", content: "Flights, airport transfers and dinners. Book your own flights (we'll guide you on the best arrival times), we're happy to arrange your airport transfer for you, and dinners are out together as a group — everyone covers their own." },
  { title: "I'm travelling solo — will I fit in?", content: "Absolutely — most guests come alone. Small groups and shared meals mean you'll know everyone by day two." },
  { title: "What level do I need to be?", content: "Anything from total beginner to semi-pro. We group by level so you're always with the right people." },
  { title: "Is gear included?", content: "Yes — pro windsurf gear rental is included in every package. Bring your own harness if you like." },
  { title: "Can I arrive earlier or leave later?", content: "Yes — you can add extra hotel nights with us at any time after booking. Just tell us your flight dates and we'll arrange it." },
  { title: "How does booking work?", content: "Reserve your spot with a €300 deposit — just your name and contact details, nothing more. After payment we contact you personally to sort every detail, and the remaining balance is due later." },
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

function waHref(v: string): string {
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^wa\.me\//i.test(s)) return `https://${s}`;
  const digits = s.replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : s;
}

function FactIcon({ name }: { name: string }) {
  const c = "w-5 h-5";
  const p = { fill: "none" as const, stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "calendar": return <svg className={c} viewBox="0 0 24 24" {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>;
    case "pin": return <svg className={c} viewBox="0 0 24 24" {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>;
    case "users": return <svg className={c} viewBox="0 0 24 24" {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>;
    case "plane": return <svg className={c} viewBox="0 0 24 24" {...p}><path d="M17.8 19.2L16 11l3.5-3.5a2.1 2.1 0 00-3-3L13 8 4.8 6.2a.7.7 0 00-.7 1.1L9 11l-2 3-2-.5a.5.5 0 00-.5.8L7 17l1.8 2.5a.5.5 0 00.8-.5L9 17l3-2 3.6 4.9a.7.7 0 001.2-.7z" /></svg>;
    case "wind": return <svg className={c} viewBox="0 0 24 24" {...p}><path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h9a2.5 2.5 0 1 1-2.5 2.5" /></svg>;
    default: return null;
  }
}

/* live schema (generated types are stale) */
type Edition = { id: string; label: string | null; coaches: string | null; date_start: string | null; date_end: string | null; max_spots: number | null; spots_taken: number | null; deposit: number | null; status: string | null };
type PackageRow = { id: string; name: string; price: number | null; status: string | null; edition_id: string | null; includes: unknown };

/** Coerce the jsonb `exp_packages.includes` into a clean list of display strings. */
function parseIncludes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it) => (typeof it === "string" ? it : it && typeof it === "object" ? String((it as Record<string, unknown>).name ?? (it as Record<string, unknown>).label ?? (it as Record<string, unknown>).text ?? "") : ""))
    .map((s) => s.trim())
    .filter(Boolean);
}
type ProgramItem = { title: string; description: string };
type FaqRow = { q: string; a: string };
type ReviewRow = { name: string; country: string; quote: string; rating: number; image: string };
type ContentRow = {
  location_about: string | null; week_info: string | null;
  daily_program: ProgramItem[] | null; highlights: string[] | null; faq: FaqRow[] | null;
  hero_image: string | null; hero_video_url: string | null; gallery: string[] | null; reviews: ReviewRow[] | null;
  no_wind_program: string | null; wind_probability: string | null; wind_range: string | null;
};
type Detail = {
  id: string; title: string; location: string | null; currency: string | null; price: number | null;
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
    .select("id,title,location,currency,price,description,hero_image,gallery,airport_code,exp_editions(id,label,coaches,date_start,date_end,max_spots,spots_taken,deposit,status),exp_packages(id,name,price,status,edition_id,includes)")
    .eq("slug", slug).eq("status", "published").maybeSingle();

  const experience = raw as unknown as Detail | null;
  if (!experience) notFound();

  // Website content lives in a separate table not in the generated types yet.
  // Fetch it tolerantly via an untyped client — if the table isn't created yet
  // (or has no row), fall back to evergreen content.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  // Split the fetch so the newer media columns (added in migration 013) can't
  // break the existing text content if they haven't been applied yet.
  const [{ data: baseRaw }, { data: mediaRaw }] = await Promise.all([
    sb.from("exp_content").select("location_about,week_info,daily_program,highlights,faq").eq("experience_id", experience.id).maybeSingle(),
    sb.from("exp_content").select("hero_image,hero_video_url,gallery,reviews,no_wind_program,wind_probability,wind_range").eq("experience_id", experience.id).maybeSingle(),
  ]);
  const content = (baseRaw || mediaRaw ? { ...(baseRaw ?? {}), ...(mediaRaw ?? {}) } : null) as ContentRow | null;

  const today = new Date().toISOString().slice(0, 10);
  const allEditions = (experience.exp_editions ?? []).filter((e) => e.status === "published")
    .sort((a, b) => ((a.date_start ?? "") < (b.date_start ?? "") ? -1 : 1));
  const multi = allEditions.length > 1;
  // "primary" edition = soonest upcoming (drives hero defaults)
  const edition = allEditions.find((e) => e.date_start && e.date_start >= today) ?? allEditions[0];

  // group active packages by edition so each week only shows its own (no dupes)
  const activePackages = (experience.exp_packages ?? []).filter((p) => p.status === "active" && p.price != null);

  // Resolve each package's hotel for the booking step (name + preview photo).
  // Tolerant: hotels media columns + exp_packages.hotel_id arrive in migration 023,
  // so a missing column just yields no hotel preview (never breaks the page).
  type HotelLite = { id: string; name: string; image_url: string | null; images: string[] | null; description: string | null };
  let hotelsList: HotelLite[] = [];
  {
    const { data } = await sb.from("hotels").select("id,name,image_url,images,description");
    if (Array.isArray(data)) hotelsList = data as HotelLite[];
  }
  const pkgHotelId: Record<string, string> = {};
  if (activePackages.length) {
    const { data } = await sb.from("exp_packages").select("id,hotel_id").in("id", activePackages.map((p) => p.id));
    if (Array.isArray(data)) for (const r of data as { id: string; hotel_id: string | null }[]) if (r.hotel_id) pkgHotelId[r.id] = r.hotel_id;
  }
  const hotelById = new Map(hotelsList.map((h) => [h.id, h]));
  const resolveHotel = (pkgId: string, name: string, accommodation: string): HotelLite | null => {
    const linked = pkgHotelId[pkgId] ? hotelById.get(pkgHotelId[pkgId]) : null;
    if (linked) return linked;
    const hay = `${name} ${accommodation}`.toLowerCase();
    return hotelsList.find((h) => h.name && hay.includes(h.name.toLowerCase())) ?? null;
  };

  const packagesByEdition: Record<string, RealPackage[]> = {};
  for (const ed of allEditions) packagesByEdition[ed.id] = [];
  for (const p of activePackages) {
    const x = parsePackageName(p.name);
    const h = resolveHotel(p.id, p.name, x.accommodation);
    const rp: RealPackage = {
      id: p.id, level: x.level, accommodation: x.accommodation, price: p.price as number,
      hotelName: h?.name ?? null, hotelImage: h?.image_url ?? null, hotelImages: h?.images ?? null, hotelDescription: h?.description ?? null,
      includes: parseIncludes(p.includes),
    };
    if (p.edition_id && packagesByEdition[p.edition_id]) packagesByEdition[p.edition_id].push(rp);
    else allEditions.forEach((ed) => packagesByEdition[ed.id].push(rp)); // unscoped → all weeks
  }

  const editionsLite: EditionLite[] = allEditions.map((ed, i) => {
    const pks = packagesByEdition[ed.id] ?? [];
    return {
      id: ed.id,
      label: ed.label?.trim() || `Week ${i + 1}`,
      dateRange: fmtRange(ed.date_start, ed.date_end),
      shortRange: fmtShort(ed.date_start, ed.date_end),
      spotsLeft: ed.max_spots != null ? ed.max_spots - (ed.spots_taken ?? 0) : null,
      fromPrice: pks.length ? Math.min(...pks.map((p) => p.price)) : null,
      deposit: ed.deposit,
      coaches: ed.coaches,
    };
  });

  const allPrices = activePackages.map((p) => p.price as number);
  const fromPrice = allPrices.length ? Math.min(...allPrices) : experience.price;
  const spotsLeft = edition?.max_spots != null ? edition.max_spots - (edition.spots_taken ?? 0) : null;
  const totalSpotsLeft = editionsLite.reduce((s, e) => s + (e.spotsLeft ?? 0), 0);
  const spanStart = allEditions[0]?.date_start ?? edition?.date_start ?? null;
  const spanEnd = allEditions[allEditions.length - 1]?.date_end ?? edition?.date_end ?? null;
  const tileImg = experience.hero_image; // listing tile / fallback
  const heroVideoUrl = content?.hero_video_url?.trim() ?? "";
  // Segment timestamps fetched separately so a pre-migration-018 missing column
  // can never null out the media row (and the existing hero video).
  let heroVideoStart: number | null = null;
  let heroVideoEnd: number | null = null;
  if (heroVideoUrl) {
    const { data: seg } = await sb
      .from("exp_content")
      .select("hero_video_start,hero_video_end")
      .eq("experience_id", experience.id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    heroVideoStart = (seg as any)?.hero_video_start ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    heroVideoEnd = (seg as any)?.hero_video_end ?? null;
  }
  const heroMediaImage = content?.hero_image?.trim() || tileImg || BRAND_IMG.spot; // event-page hero image
  const galleryImgs = ((content?.gallery?.length ? content.gallery : experience.gallery) ?? []).filter(Boolean);
  // Image pool that drives the vibey sections (scroll story, etc). Prefer the
  // trip's own gallery; fall back to the hero + evergreen brand shots so the page
  // never feels empty even before photos are uploaded.
  const vibeImages = (galleryImgs.length
    ? galleryImgs
    : [heroMediaImage, BRAND_IMG.action, BRAND_IMG.group, BRAND_IMG.spot, BRAND_IMG.ease, BRAND_IMG.coach]
  ).filter(Boolean);
  const place = experience.location?.split(",")[0] ?? "the water";

  // editable website content (falls back to evergreen when empty)
  const locationAbout = content?.location_about?.trim() ?? "";
  const weekInfo = content?.week_info?.trim() ?? "";
  const windProbability = content?.wind_probability?.trim() ?? "";
  const windRange = content?.wind_range?.trim() ?? "";
  const noWindProgram = content?.no_wind_program?.trim() ?? "";
  const highlights = (content?.highlights ?? []).filter((h) => h && h.trim());
  const programItems: AccordionItem[] =
    (content?.daily_program ?? []).length > 0
      ? content!.daily_program!.map((p, i) => ({
          eyebrow: `Day ${i + 1}`,
          title: p.title?.trim() || `Day ${i + 1}`,
          content: <span className="whitespace-pre-line">{p.description}</span>,
        }))
      : ITINERARY;
  const faqItems: AccordionItem[] =
    (content?.faq ?? []).length > 0
      ? content!.faq!.map((f) => ({ title: f.q, content: <span className="whitespace-pre-line">{f.a}</span> }))
      : FAQ;
  // Data-driven guides for the primary edition (fallback to brand defaults).
  // Fetched separately so missing tables (pre-migration 019) can't break the page.
  let guideItems: { name: string; role: string; bio: string; image: string; whatsapp?: string | null }[] = COACHES;
  if (edition?.id) {
    // whatsapp_link arrives in migration 027 — try with it, fall back without.
    const sel = (wa: boolean) => `sort_order,name_override,role_override,bio_override,image_override,exp_coaches(name,role,bio,image_url${wa ? ",whatsapp_link" : ""})`;
    let { data: gc, error } = await sb.from("exp_edition_coaches").select(sel(true)).eq("edition_id", edition.id).order("sort_order");
    if (error) ({ data: gc } = await sb.from("exp_edition_coaches").select(sel(false)).eq("edition_id", edition.id).order("sort_order"));
    if (gc && gc.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      guideItems = gc
        .map((g: any) => ({
          name: g.name_override ?? g.exp_coaches?.name ?? "",
          role: g.role_override ?? g.exp_coaches?.role ?? "",
          bio: g.bio_override ?? g.exp_coaches?.bio ?? "",
          image: g.image_override ?? g.exp_coaches?.image_url ?? BRAND_IMG.group,
          whatsapp: g.exp_coaches?.whatsapp_link ?? null,
        }))
        .filter((c: { name: string }) => c.name);
    }
  }

  // Admin-curated participant reviews for this experience (fallback to legacy content.reviews).
  const { data: placementRows } = await sb
    .from("exp_review_placements")
    .select("sort_order, exp_reviews(author_name,author_country,rating,quote,photo_url,status,booking_id)")
    .eq("experience_id", experience.id)
    .order("sort_order");
  type PlacedReview = { author_name: string | null; author_country: string | null; rating: number | null; quote: string | null; photo_url: string | null; status: string; booking_id: string | null };
  const placedReviews = (placementRows ?? [])
    .map((p: { exp_reviews: PlacedReview | null }) => p.exp_reviews)
    .filter((r: PlacedReview | null): r is PlacedReview => !!r && r.status === "approved")
    .map((r: PlacedReview) => ({
      quote: r.quote ?? "", name: r.author_name ?? "", country: r.author_country ?? "",
      image: r.photo_url || BRAND_IMG.group, rating: Math.max(1, Math.min(5, r.rating || 5)),
      verified: !!r.booking_id,
    }));

  const reviewItems =
    placedReviews.length > 0
      ? placedReviews
      : (content?.reviews ?? []).length > 0
        ? content!.reviews!.map((r) => ({ quote: r.quote, name: r.name, country: r.country, image: r.image || BRAND_IMG.group, rating: Math.max(1, Math.min(5, r.rating || 5)), verified: false }))
        : MOMENTS.map((m) => ({ ...m, rating: 5, verified: false }));

  // Destination quick-module (migration 022; tolerant — hidden until applied + linked)
  let destination: { slug: string | null; name: string; region: string | null; country: string | null; tagline: string | null; hero_image: string | null } | null = null;
  {
    const { data: ed } = await sb.from("exp_experiences").select("destination_id").eq("id", experience.id).maybeSingle();
    if (ed?.destination_id) {
      const { data: dd } = await sb.from("destinations").select("slug,name,region,country,tagline,hero_image,status").eq("id", ed.destination_id).maybeSingle();
      if (dd && dd.status === "published" && dd.slug) destination = dd;
    }
  }

  return (
    <>
      <OceanHeader bookHref="#packages" />

      {/* HERO */}
      <section className="relative min-h-[88vh] flex items-end bg-[#00374a] overflow-hidden">
        {heroVideoUrl ? (
          <HeroVideo url={heroVideoUrl} start={heroVideoStart} end={heroVideoEnd} poster={heroMediaImage} />
        ) : (
          <div className="absolute inset-0 bg-cover bg-center scale-105" style={{ backgroundImage: `url('${heroMediaImage}')` }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#00374a] via-black/35 to-black/35" />
        <div className="relative w-full max-w-[1200px] mx-auto px-6 sm:px-8 pb-16 pt-32">
          <Reveal from="up">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="text-[12px] font-bold tracking-[0.2em] uppercase text-white/75">{experience.location}</span>
              {multi ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1 rounded-full text-[#5fd0e8] bg-[#00afdb]/15 border border-[#00afdb]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5fd0e8] animate-pulse" />
                  {allEditions.length} weeks{totalSpotsLeft > 0 ? ` · ${totalSpotsLeft} spots left` : ""}
                </span>
              ) : typeof spotsLeft === "number" ? (
                <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1 rounded-full ${spotsLeft > 0 ? "text-[#5fd0e8] bg-[#00afdb]/15 border border-[#00afdb]/30" : "text-white bg-[#f47b20]"}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  {spotsLeft > 0 ? `Only ${spotsLeft} spots left` : "Fully booked"}
                </span>
              ) : null}
            </div>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white leading-[0.98] tracking-[-0.035em] mb-4 max-w-[840px]">{experience.title}</h1>
            {(spanStart || edition) && (
              <p className="text-[16px] sm:text-[17px] text-white/70 mb-8">
                {multi ? `${fmtRange(spanStart, spanEnd)} · ${allEditions.length} weeks to choose from` : fmtRange(edition.date_start, edition.date_end)}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Link href="#packages" className="px-7 py-4 rounded-full text-[14px] font-bold text-[#00374a] bg-white hover:-translate-y-0.5 transition-all">
                {money(fromPrice, experience.currency) ? `Reserve your spot · from ${money(fromPrice, experience.currency)}` : "Reserve your spot"}
              </Link>
              <Link href="#method" className="px-7 py-4 rounded-full text-[14px] font-bold text-white border-[1.5px] border-white/40 hover:bg-white/10 transition-all">How it works</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* QUICK FACTS — a clean panel on the same dark, bridging hero → epic week */}
      <section className="bg-[#00374a]">
        <div className="max-w-[1080px] mx-auto px-6 sm:px-8 py-11 sm:py-14">
          <div className="rounded-2xl sm:rounded-[26px] bg-white shadow-[0_24px_55px_-22px_rgba(0,0,0,0.55)] px-5 sm:px-9 py-6 sm:py-7 grid grid-cols-2 sm:grid-cols-4 gap-y-6 gap-x-5">
            {([
              { icon: "calendar", label: multi ? `${allEditions.length} weeks to choose` : "When", value: multi
                  ? <span className="space-y-0.5">{editionsLite.map((e) => <span key={e.id} className="block">{e.label} · {e.shortRange}</span>)}</span>
                  : fmtShort(edition?.date_start, edition?.date_end) },
              { icon: "pin", label: "Where", value: experience.location ?? "—" },
              { icon: "wind", label: "Wind", value: windProbability || windRange || "Reliable, steady wind" },
              { icon: "plane", label: "Airport", value: experience.airport_code ?? "—" },
            ] as const).map((f) => (
              <div key={f.label} className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl bg-[#00afdb]/10 text-[#00afdb] grid place-items-center shrink-0"><FactIcon name={f.icon} /></span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-bold tracking-[0.15em] uppercase text-[#9aa6ac] mb-0.5">{f.label}</span>
                  <span className="block text-[13.5px] font-bold text-[#00374a] leading-snug">{f.value}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 1 · THE DREAM — your epic week (pinned scroll through the outcomes) */}
      <EpicWeekScroll
        outcomes={OUTCOMES}
        images={vibeImages}
        eyebrow="YOUR EPIC WEEK"
        title="The best week of your windsurf year"
        intro={experience.description || "One week, fully immersed in the sport you love — epic conditions, world-class coaching, and a crew that feels like old friends by day two."}
        weekInfo={weekInfo}
      />
      {highlights.length > 0 && (
        <section className="bg-[#00374a] py-10 sm:py-12">
          <div className="max-w-[1100px] mx-auto px-6 sm:px-8 flex flex-wrap justify-center gap-2">
            {highlights.map((h) => (
              <span key={h} className="text-[12.5px] font-semibold text-white/90 bg-white/10 px-3.5 py-1.5 rounded-full">{h}</span>
            ))}
          </div>
        </section>
      )}

      {/* 2 · THE NP7 TRAINING SYSTEM — the unique mechanism */}
      <section id="method" className="scroll-mt-16 py-16 sm:py-24 bg-[#00374a] text-white relative overflow-hidden">
        <Slideshow images={vibeImages} className="opacity-45" />
        {/* readable scrim — photo shows through more than before; warm glow keeps it fun, not clinical */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#00374a]/85 via-[#00374a]/65 to-[#013242]/85" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_15%,rgba(0,175,219,0.25),transparent_55%)]" />
        <div className="relative max-w-[1100px] mx-auto px-6 sm:px-8">
          <Reveal className="max-w-[660px] mb-12">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#8fe6f2] mb-3">THE NP7 TRAINING SYSTEM</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] mb-4">Coaching that actually changes your riding</h2>
            <p className="text-[16px] text-white/60 leading-relaxed">{METHOD_INTRO}</p>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5">
            {METHOD.map((s, i) => (
              <Reveal key={s.n} delay={i * 110} className="h-full">
                <div className={`h-full rounded-3xl p-7 border ${s.gameChanger ? "bg-[#00afdb]/15 border-[#00afdb]/50 shadow-[0_0_50px_rgba(0,175,219,0.15)]" : "bg-white/[0.04] border-white/10"}`}>
                  {s.gameChanger && (
                    <span className="inline-block text-[9px] font-extrabold tracking-[0.2em] uppercase px-2.5 py-1 rounded-full bg-[#00afdb] text-white mb-3">The game changer</span>
                  )}
                  <span className={`block text-[40px] font-black ${s.gameChanger ? "text-[#5fd0e8]" : "text-[#00afdb]/40"}`}>{s.n}</span>
                  <h3 className="text-xl font-extrabold mt-2 mb-3">{s.t}</h3>
                  <p className="text-[14.5px] text-white/65 leading-relaxed">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <p className="mt-10 text-[17px] sm:text-[19px] font-bold text-[#8fe6f2] max-w-[640px]">
              &ldquo;You leave with at least a year&apos;s worth of knowledge on what to work on next.&rdquo;
              <span className="block text-[13px] font-semibold text-white/45 mt-2">— the NP7 promise, week after week</span>
            </p>
          </Reveal>
        </div>
      </section>

      {/* 3 · CERTAINTY — you can count on it */}
      <section className="py-16 sm:py-24 bg-[#fff7ec]">
        <div className="max-w-[1100px] mx-auto px-6 sm:px-8">
          <Reveal className="text-center max-w-[640px] mx-auto mb-10">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">THE ODDS ARE IN YOUR FAVOUR</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a]">Set up for a great week</h2>
          </Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { big: windProbability || "Trade winds", small: windProbability ? "wind probability in season" : "steady & reliable", sub: windRange || null },
              { big: "★ 5.0", small: "guest rating", sub: "5-star reviews, week after week" },
              { big: "Small groups", small: "great crew", sub: "hand-picked, friendly vibe" },
              { big: "Plan B", small: "no-wind program", sub: "we make every day count" },
            ].map((s, i) => (
              <Reveal key={s.small} delay={i * 80}>
                <div className="h-full bg-white rounded-2xl border border-[#f0e6d6] p-6 text-center">
                  <div className="text-[26px] sm:text-[30px] font-black tracking-[-0.02em] text-[#00374a]">{s.big}</div>
                  <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#00afdb] mt-1">{s.small}</div>
                  {s.sub && <div className="text-[12.5px] text-[#8a9aa0] mt-2">{s.sub}</div>}
                </div>
              </Reveal>
            ))}
          </div>
          {noWindProgram && (
            <Reveal>
              <div className="mt-6 bg-white rounded-2xl border border-[#f0e6d6] p-6 sm:p-7 max-w-[820px] mx-auto">
                <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#00afdb] mb-2">And if the wind takes a day off?</p>
                <p className="text-[14.5px] text-[#4a5b62] leading-relaxed whitespace-pre-line">{noWindProgram}</p>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* 4 · THE SPOT — only when there's no linked destination (the destination module replaces it) */}
      {locationAbout && !destination && (
        <section className="py-16 sm:py-24">
          <div className="max-w-[1100px] mx-auto px-6 sm:px-8 grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-16 items-center">
            <Reveal from="left">
              <div className="aspect-[4/3] rounded-3xl bg-cover bg-center shadow-[0_20px_50px_rgba(0,55,74,0.12)]" style={{ backgroundImage: `url('${galleryImgs[1] ?? heroMediaImage}')` }} />
            </Reveal>
            <Reveal from="right">
              <div>
                <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">THE SPOT</p>
                <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mb-5">{place}</h2>
                <p className="text-[16px] text-[#5a6b72] leading-relaxed whitespace-pre-line">{locationAbout}</p>
                {(windRange || windProbability) && (
                  <div className="flex flex-wrap gap-2 mt-6">
                    {windRange && <span className="text-[12.5px] font-bold text-[#00374a] bg-[#00afdb]/10 px-3.5 py-1.5 rounded-full">{windRange}</span>}
                    {windProbability && <span className="text-[12.5px] font-bold text-[#00374a] bg-[#00afdb]/10 px-3.5 py-1.5 rounded-full">{windProbability} wind probability</span>}
                  </div>
                )}
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* 4b · DESTINATION quick-module → full destination page */}
      {destination && (
        <section className="py-12 sm:py-16">
          <div className="max-w-[1100px] mx-auto px-6 sm:px-8">
            <Reveal>
              <Link href={`/destinations/${destination.slug}`} className="group relative block rounded-3xl overflow-hidden min-h-[240px] flex items-end bg-[#00374a] shadow-[0_20px_50px_rgba(0,55,74,0.15)]">
                {destination.hero_image && <div className="absolute inset-0 bg-cover bg-center scale-105 group-hover:scale-110 transition-transform duration-700" style={{ backgroundImage: `url('${destination.hero_image}')` }} />}
                <div className="absolute inset-0 bg-gradient-to-t from-[#00374a] via-[#00374a]/40 to-transparent" />
                <div className="relative p-7 sm:p-9 text-white max-w-[640px]">
                  <p className="text-[11px] font-bold tracking-[0.25em] text-[#8fe6f2] mb-2">DISCOVER THE DESTINATION</p>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-[-0.02em]">{destination.name}</h2>
                  {destination.tagline && <p className="text-[14.5px] text-white/80 mt-1.5">{destination.tagline}</p>}
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-bold mt-4 group-hover:gap-2.5 transition-all">Explore {destination.name}
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </span>
                </div>
              </Link>
            </Reveal>
          </div>
        </section>
      )}

      {/* 5 · PACKAGES + BOOKING */}
      <section id="packages" className="scroll-mt-16 py-16 sm:py-24 bg-[#f7f7f7]">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="text-center max-w-[600px] mx-auto mb-12">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">PACKAGES</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mb-4">Build your week</h2>
            <p className="text-[16px] text-[#6a7a80]">{multi ? "Choose your week, then pick your coaching level and accommodation — your price updates instantly." : "Pick your coaching level and accommodation — your price updates instantly."}</p>
            <p className="text-[14px] font-semibold text-[#00374a] mt-3">Reserve with a <span className="text-[#00afdb] font-extrabold">€300 deposit</span> — the rest is due later.</p>
          </Reveal>
          {editionsLite.length > 0 ? (
            <Reveal>
              <EditionBooking
                editions={editionsLite}
                packagesByEdition={packagesByEdition}
                currency={experience.currency ?? undefined}
                experienceId={experience.id}
                experienceTitle={experience.title}
              />
            </Reveal>
          ) : (
            <div className="text-center">
              <p className="text-[#6a7a80] mb-6">Packages for this trip are being finalised.</p>
              <Link href={`mailto:experience@np-seven.com?subject=Enquiry: ${experience.title}`} className="inline-block px-8 py-4 rounded-full text-[14px] font-bold bg-[#00afdb] text-white">Enquire now</Link>
            </div>
          )}
        </div>
      </section>

      {/* 6 · YOUR PERFECT WEEK */}
      <section className="py-16 sm:py-24">
        <div className="max-w-[760px] mx-auto px-6 sm:px-8">
          <Reveal className="mb-10">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">DAY BY DAY</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mb-3">Your perfect week in {place}</h2>
            <p className="text-[14.5px] text-[#7a8a90] leading-relaxed italic">This is what the ideal week looks like — the exact day-to-day depends on the wind. We chase the best conditions and adapt as we go.</p>
          </Reveal>
          <Reveal><Accordion items={programItems} defaultOpen={0} variant="timeline" /></Reveal>
        </div>
      </section>

      {/* 7 · PROOF — coaches & reviews */}
      <section className="py-16 sm:py-24 bg-[#f7f7f7]">
        <div className="max-w-[1100px] mx-auto px-6 sm:px-8">
          <Reveal className="mb-8"><p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">YOUR TEAM</p><h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">Learn from the best</h2></Reveal>
          <Reveal className="mb-16">
            <Carousel label="Coaches">
              {guideItems.map((c) => (
                <article key={c.name} className="snap-start shrink-0 w-[280px] sm:w-[320px] bg-white rounded-3xl overflow-hidden border border-[#ebebeb]">
                  <div className="h-[240px] bg-cover bg-center" style={{ backgroundImage: `url('${c.image}')` }} />
                  <div className="p-5"><h3 className="text-lg font-extrabold text-[#00374a]">{c.name}</h3><p className="text-[11px] font-bold tracking-wide uppercase text-[#00afdb] mb-2.5">{c.role}</p><p className="text-[13.5px] text-[#6a7a80] leading-relaxed">{c.bio}</p>
                    {c.whatsapp && <a href={waHref(c.whatsapp)} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 mt-3 text-[13px] font-bold text-[#1aa851] hover:underline">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.205zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.074-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>
                      Chat on WhatsApp</a>}
                  </div>
                </article>
              ))}
            </Carousel>
          </Reveal>
          <Reveal className="mb-8"><p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">★ 5.0 — WHAT GUESTS SAY</p><h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">Moments &amp; new friends</h2></Reveal>
          <Reveal>
            <Carousel label="Guest reviews">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {reviewItems.map((m: any, i: number) => (
                <article key={i} className="snap-start shrink-0 w-[280px] sm:w-[360px] relative rounded-3xl overflow-hidden h-[400px]">
                  <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${m.image}')` }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                  {m.verified && (
                    <span className="absolute top-4 right-4 inline-flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase text-white bg-[#00afdb]/90 backdrop-blur px-2.5 py-1 rounded-full shadow-sm">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      Verified
                    </span>
                  )}
                  <div className="absolute bottom-0 p-7 text-white"><span className="text-[#ffd24a] text-sm">{"★".repeat(m.rating)}</span><p className="text-[16px] font-bold leading-snug mt-3 mb-4">&ldquo;{m.quote}&rdquo;</p><p className="text-[13px] text-white/70 font-semibold">{m.name}{m.country ? ` · ${m.country}` : ""}</p></div>
                </article>
              ))}
            </Carousel>
          </Reveal>
        </div>
      </section>

      {/* 8 · YOUR MEMORIES — filmstrip fly-by */}
      {galleryImgs.length > 0 && (
        <section className="py-16 sm:py-20 overflow-hidden">
          <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
            <Reveal className="mb-9 text-center">
              <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">YOUR MEMORIES IN THE MAKING</p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">You&apos;ll take these home</h2>
              <p className="text-[15px] text-[#6a7a80] mt-3">We shoot every week on photo &amp; video — tap any frame to dive in.</p>
            </Reveal>
          </div>
          <Reveal><GalleryStrip images={galleryImgs} /></Reveal>
        </section>
      )}

      {/* 9 · FAQ */}
      <section className="py-16 sm:py-24 bg-[#fff7ec]">
        <div className="max-w-[760px] mx-auto px-6 sm:px-8">
          <Reveal className="mb-10 text-center"><p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">GOOD TO KNOW</p><h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">Questions, answered</h2></Reveal>
          <Reveal><Accordion items={faqItems} allowMultiple /></Reveal>
        </div>
      </section>

      {/* 10 · FINAL CTA */}
      <section className="relative py-24 sm:py-32 bg-[#00374a] text-white overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(0,175,219,0.2),transparent_60%)]" />
        <div className="relative max-w-[640px] mx-auto px-6 text-center">
          {typeof spotsLeft === "number" && spotsLeft > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#5fd0e8] bg-[#00afdb]/15 border border-[#00afdb]/30 px-3 py-1 rounded-full mb-6"><span className="w-1.5 h-1.5 rounded-full bg-[#5fd0e8] animate-pulse" />Only {spotsLeft} spots left</span>
          )}
          <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] mb-5 leading-[1.05]">Your dream week is real.<br />Make it yours.</h2>
          <p className="text-[17px] text-white/55 mb-9">Reserve with a €300 deposit — just your name and contact details. After payment, we&apos;ll reach out personally to sort every detail.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="#packages" className="px-8 py-4 rounded-full text-[14px] font-bold text-[#00374a] bg-white hover:-translate-y-0.5 transition-all">Reserve my spot · €300</Link>
            <Link href={`mailto:experience@np-seven.com?subject=Question: ${experience.title}`} className="px-8 py-4 rounded-full text-[14px] font-bold text-white border-[1.5px] border-white/40 hover:bg-white/10 transition-all">Ask us anything</Link>
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

      <StickyCta title={experience.title} priceFrom={fromPrice ?? 0} spotsLeft={multi ? totalSpotsLeft : spotsLeft} target="#packages" />
    </>
  );
}
