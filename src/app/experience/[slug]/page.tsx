import Link from "next/link";
import { flags } from "@/lib/flags";
import { WindMiniChart } from "@/components/experience/wind-mini-chart";
import { DEFAULT_WEEK_INFO } from "@/lib/experience-defaults";
import { notFound } from "next/navigation";
import { includeLine } from "@/lib/include-line";
import { REVIEW_CATEGORIES } from "@/lib/review-categories";
import { statsAreBlind } from "@/lib/wind-stats";
import { firstNameInitial, publicProfileFor } from "@/lib/member-profile";
import { createAdminClient } from "@/lib/supabase";
import { GuestReviews } from "@/components/experience/guest-reviews";
import { packageLevelLabel } from "@/lib/package-levels";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { getTeamMember, getPortalUser } from "@/lib/auth";
import { getEventForSlug, getEventRuns, type EventInfo } from "@/lib/events";
import { ClinicTicketBox } from "@/components/experience/clinic-ticket-box";
import { ClinicEditions, type ClinicRun } from "@/components/experience/clinic-editions";
import { SelectedEditionProvider } from "@/components/experience/selected-edition";
import { CrewCarousel, type Guide } from "@/components/experience/crew-carousel";
import { ProgramForWeek, type ProgramDay } from "@/components/experience/program-for-week";
import { OceanHeader, NP7_LOGO } from "@/components/experience/ocean-header";
import { Reveal } from "@/components/experience/reveal";
import { Accordion, type AccordionItem } from "@/components/experience/accordion";
import { StickyCta } from "@/components/experience/sticky-cta";
import { type RealPackage } from "@/components/experience/package-picker";
import { activeLaunch } from "@/lib/launch-price";
import { resolveTierPct, bestAdvantage, type TierPerkRule, type PriceAdvantage } from "@/lib/tier-perks";
import { getMemberTier } from "@/lib/member-tier";
import { FOCUS_CLASS, FOCUS_CSS, focusVars, parseFocus } from "@/lib/placement";
import { EditionBooking, type EditionLite } from "@/components/experience/edition-booking";
import { HeroVideo } from "@/components/experience/hero-video";
import { availabilityFor } from "@/lib/availability";
import { GalleryStrip } from "@/components/experience/gallery-strip";
import { Slideshow } from "@/components/experience/slideshow";
import { EpicWeekScroll } from "@/components/experience/epic-week-scroll";
import { SectionNav, type NavSection } from "@/components/experience/section-nav";
import { MethodModal } from "@/components/experience/method-modal";
import { ExplainerVideo } from "@/components/experience/explainer-video";
import { TripOverlay } from "@/components/experience/trip-overlay";
import { DestinationDeepDive } from "@/components/experience/destination-deep-dive";

export const revalidate = 3600;

/** `edition` arrives only from /experience/<series>/<edition>, which renders
 *  this very component so one clinic looks exactly like its series. */
type Props = { params: Promise<{ slug: string; edition?: string }>; searchParams?: Promise<{ paid?: string; b?: string }> };

/* -------- evergreen brand content (per-trip fields come from admin later) -------- */
// Our own shots on our own CDN (R2) — no third-party hosting.
const BRAND_IMG = {
  group: "https://media.np-seven.com/experiences/np7-alacati/people/alacati-group-photo.jpg",
  action: "https://media.np-seven.com/experiences/np7-alacati/action/nico-action-alacati.jpg",
  ease: "https://media.np-seven.com/experiences/np7-bonaire/learning/beginner-lesson-bonaire.jpg",
  spot: "https://media.np-seven.com/experiences/np7-bonaire/place/bonaire-spot-overview-drone-shot.jpg",
  coach: "https://media.np-seven.com/experiences/np7-alacati/learning/nico-one-on-one-explanation-to-participant-alacati.jpg",
};

/* The outcome stack — what you take home. Transformation, not features. */
const OUTCOMES = [
  { icon: "bolt", t: "Real confidence on the water", d: "Comfortable in more wind and chop than you arrived in — stance locked, fear gone." },
  { icon: "gauge", t: "Control & speed", d: "Effortless, controlled, faster riding — from straight-line speed to clean transitions." },
  { icon: "rotate", t: "Better jibes", d: "The move everyone wants, broken into steps that finally click." },
  { icon: "idea", t: "A year's worth of knowledge", d: "Maneuver know-how, equipment insights, and your personal roadmap for what to work on next." },
  { icon: "globe", t: "Friends from all over the world", d: "A hand-picked crew of people who love this as much as you do." },
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
  { title: "I'm travelling solo — will I fit in?", content: "Absolutely — most guests come alone. Shared meals and a friendly crew mean you'll know everyone by day two." },
  { title: "What level do I need to be?", content: "Anything from total beginner to semi-pro. We group by level so you're always with the right people." },
  { title: "Is gear included?", content: "Yes — pro windsurf gear rental is included in every package. Bring your own harness if you like." },
  { title: "Can I arrive earlier or leave later?", content: "Yes — you can add extra hotel nights with us at any time after booking. Just tell us your flight dates and we'll arrange it." },
  { title: "How does booking work?", content: "Reserve your spot in seconds — just your name and contact details, nothing more. We then contact you personally to sort every detail, and you pay by invoice: a down-payment to secure your place, with the balance due before the trip." },
];

/* ------------------------------- helpers ------------------------------- */
function fmtRange(start?: string | null, end?: string | null) {
  if (!start) return "Dates coming soon";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  return e ? `${day(s)} – ${day(e)} ${(e ?? s).getFullYear()}` : `${day(s)} ${s.getFullYear()}`;
}
/**
 * Short date range. The year is usually noise — every week on the page belongs
 * to the same season — but it is the ONLY thing separating "17 Aug – 23 Aug"
 * from "16 Aug – 22 Aug" when an experience runs the same August week in two
 * different years. Pass `withYear` then. A range straddling New Year always
 * carries both years, since that one is ambiguous on its own.
 */
function fmtShort(start?: string | null, end?: string | null, withYear = false) {
  if (!start) return "TBD";
  const s = new Date(start), e = end ? new Date(end) : null;
  const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (!e) return withYear ? `${day(s)} ${s.getFullYear()}` : day(s);
  if (s.getFullYear() !== e.getFullYear()) return `${day(s)} ${s.getFullYear()} – ${day(e)} ${e.getFullYear()}`;
  return withYear ? `${day(s)} – ${day(e)} ${e.getFullYear()}` : `${day(s)} – ${day(e)}`;
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

function CertaintyIcon({ name }: { name: string }) {
  const c = "w-6 h-6";
  const p = { fill: "none" as const, stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "wind": return <svg className={c} viewBox="0 0 24 24" {...p}><path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h9a2.5 2.5 0 1 1-2.5 2.5" /></svg>;
    case "star": return <svg className={c} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 18.6 6.1 21.3l1.2-6.6L2.5 9.5l6.6-.9z" /></svg>;
    case "crew": return <svg className={c} viewBox="0 0 24 24" {...p}><circle cx="8" cy="8" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M2 20c0-3 2.7-5 6-5s6 2 6 5" /><path d="M16 15c2.6 0 4 1.7 4 4" /></svg>;
    case "sun": return <svg className={c} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
    default: return null;
  }
}

/* live schema (generated types are stale) */
type Edition = { id: string; label: string | null; coaches: string | null; date_start: string | null; date_end: string | null; max_spots: number | null; spots_taken: number | null; deposit: number | null; status: string | null };
type PackageRow = { id: string; name: string; price: number | null; status: string | null; edition_id: string | null; category: string | null; includes: unknown; exp_package_components?: { show_on_website: boolean | null; quantity?: number | null; exp_components: { name: string | null; description: string | null; category?: string | null } | null }[] | null };

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
  week_title: string | null; week_outcomes: { icon?: string; t?: string; d?: string }[] | null;
  week_outcomes_by_level?: Record<string, { title?: string; cards?: { icon?: string; t?: string; d?: string }[] }> | null;
  method_intro: string | null; method_steps: { t?: string; d?: string; gameChanger?: boolean }[] | null;
  daily_program: ProgramItem[] | null; highlights: string[] | null; faq: FaqRow[] | null;
  hero_image: string | null; hero_focus: string | null; hero_focus_shapes: Record<string, string> | null;
  hero_video_url: string | null; explainer_video_url: string | null; gallery: string[] | null; reviews: ReviewRow[] | null;
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
  if (!data) return { title: { absolute: "Experience not found — NP7" } };
  return { title: { absolute: `${data.title} — NP7 Experience` }, description: data.description || `NP7 Experience in ${data.location}` };
}

export default async function ExperienceDetailPage({ params, searchParams }: Props) {
  const { slug, edition: pickedEdition } = await params;
  const { paid, b: paidBookingId } = (await searchParams) ?? {};
  // Team members can preview drafts + off-website experiences (the admin
  // "Preview page" button); the public only ever sees published ones.
  const team = await getTeamMember().catch(() => null);

  // EVENT experiences (page_template='event') get the slim ticket-first layout,
  // not the full trip page. Resolved by the event lib (service-role read of the
  // candidate dates); non-events return null and fall through.
  /*
   * A CLINIC is the trip page with the trip-sized parts taken out — not a
   * second page.
   *
   * It used to be its own slim template, and that template quietly became the
   * poor relation: a flat hero, one thin column and a dark method card doing
   * all the work. Everything that makes an NP7 page feel like NP7 — the hero
   * treatment, the quick facts, the spot, the crew, the gallery — lived only in
   * the trip page and had to be rebuilt badly to appear here at all.
   *
   * So a clinic renders the SAME page and switches off what a one- or two-day
   * format has no business showing: the pinned epic-week story, the certainty
   * band built around a months-long payment plan, the package picker, and the
   * day-by-day. The ticket box takes the packages' place.
   */
  const clinic = await getEventForSlug(slug, { preview: !!team, editionSlug: pickedEdition }).catch(() => null);
  if (clinic && !team && (clinic.status !== "published" || !clinic.websiteVisible)) notFound();
  /* A second path segment only means something for a clinic series. Anything
     else — /experience/np7-bonaire/typo — has to 404 rather than quietly serve
     the trip page under a URL that does not exist. */
  if (pickedEdition && clinic?.editionSlug !== pickedEdition) notFound();
  /* ALL upcoming runs, because the series is one page with a selector in it —
     the visitor compares Hatteras against the Gorge without leaving. */
  const runs: EventInfo[] = clinic ? await getEventRuns(slug, { preview: !!team }) : [];
  const clinicMember = clinic ? await getPortalUser().catch(() => null) : null;
  /*
   * Team preview needs a reader that can SEE a draft.
   *
   * The module-level `supabase` client carries no session, so row-level
   * security shows it published experiences only — which made the line below
   * ("if not team, restrict to published") a promise the client could not keep.
   * The old event page hid this by reading through the service role; routing
   * clinics into this page exposed it as a 404 on every draft.
   *
   * Service role ONLY when a verified team member is asking. The public path is
   * unchanged and still reads exactly what the public may read.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readDb: any = team ? createAdminClient() : supabase;

  let query = readDb
    .from("exp_experiences")
    .select("id,title,location,currency,price,description,hero_image,gallery,airport_code,exp_editions(id,label,coaches,date_start,date_end,max_spots,spots_taken,deposit,status,launch_discount_pct,launch_price_until,public_from,video_analysis,photoshoot),exp_packages(id,name,price,status,archived_at,edition_id,category,gear_baseline,includes,exp_package_components(show_on_website,quantity,exp_components(name,description,category)))")
    .eq("slug", slug);
  if (!team) query = query.eq("status", "published");
  const { data: rows } = await query.order("status", { ascending: false }).limit(1);
  const raw = rows?.[0] ?? null;

  const experience = raw as unknown as Detail | null;
  if (!experience) notFound();

  // Website content lives in a separate table not in the generated types yet.
  // Fetch it tolerantly via an untyped client — if the table isn't created yet
  // (or has no row), fall back to evergreen content.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = readDb;
  // Active-but-off-website (invite-only) experiences aren't publicly reachable.
  // Tolerant: the website_visible column errors pre-migration → treated as visible.
  const { data: visRow } = await sb.from("exp_experiences").select("website_visible").eq("id", experience.id).maybeSingle();
  if (visRow?.website_visible === false && !team) notFound();
  // Split the fetch so the newer media columns (added in migration 013) can't
  // break the existing text content if they haven't been applied yet.
  const [{ data: baseRaw }, { data: mediaRaw }] = await Promise.all([
    sb.from("exp_content").select("location_about,week_info,daily_program,highlights,faq,week_title,week_outcomes,week_outcomes_by_level,method_intro,method_steps,method_template_id,outcomes_template_id,week_images").eq("experience_id", experience.id).maybeSingle(),
    sb.from("exp_content").select("hero_image,hero_focus,hero_focus_shapes,hero_video_url,explainer_video_url,gallery,reviews,no_wind_program,wind_probability,wind_range").eq("experience_id", experience.id).maybeSingle(),
  ]);
  const content = (baseRaw || mediaRaw ? { ...(baseRaw ?? {}), ...(mediaRaw ?? {}) } : null) as ContentRow | null;

  const today = new Date().toISOString().slice(0, 10);
  // Only published AND not-yet-over editions are bookable. A past edition must
  // never drive the page (it would read "fully booked" with stale dates/price);
  // when only past/draft editions remain, the page falls through to a clean
  // "dates coming soon" state.
  // Team preview renders the page as it WILL look live: draft weeks count too.
  // The public only ever sees published editions.
  const editionVisible = (s: string | null) => (team ? s === "published" || s === "draft" : s === "published");
  // Early access (loyalty perk, migration 170): a published week with a future
  // `public_from` is visible only to Crew/Legend members (and the team) until
  // that date — "book before everyone else".
  const viewer = await getPortalUser().catch(() => null);
  const viewerTier = viewer?.contactId ? await getMemberTier(viewer.contactId).catch(() => null) : null;
  const earlyAccess = !!team || viewerTier?.key === "crew" || viewerTier?.key === "legend";
  const allEditions = (experience.exp_editions ?? [])
    .filter((e) => editionVisible(e.status)
      // Off the front end the day it STARTS, not the day it ends — a week that
      // is already on the water sold "3 left" to the public for its whole run.
      // Undated editions stay ("dates coming soon").
      && (!e.date_start || e.date_start > today)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      && (earlyAccess || !(e as any).public_from || (e as any).public_from <= today))
    .sort((a, b) => ((a.date_start ?? "") < (b.date_start ?? "") ? -1 : 1));
  const multi = allEditions.length > 1;
  const datesTBD = allEditions.length === 0; // published experience, no upcoming week yet
  // "primary" edition = soonest upcoming (drives hero defaults)
  /* Except on a clinic series, where the visitor has PICKED a run — and the
     crew, the dates and the price below the picker must all describe that one,
     not whichever happens to be next. */
  const clinicEdition = clinic?.editionId ? allEditions.find((e) => e.id === clinic.editionId) : null;
  const edition = clinicEdition ?? allEditions.find((e) => e.date_start && e.date_start >= today) ?? allEditions[0];
  /**
   * Availability, per week AND per package.
   *
   * A week is limited by two things — its own cap and the beds behind each
   * package's room type — so "spots left" is a per-package answer. It used to be
   * one number per week, which meant a full hotel closed the whole week and took
   * "Experience Only" (which has no beds to lose) down with it.
   */
  const availability = await availabilityFor(allEditions.map((e) => e.id));
  const securedByEd: Record<string, number> = {};
  for (const [edId, a] of availability) securedByEd[edId] = a.used;
  // Launch price per week — computed server-side once; the picker only displays it.
  const launchByEdition: Record<string, { pct: number; until: string } | null> = {};
  for (const e of allEditions) launchByEdition[e.id] = activeLaunch(e as never);
  // Tier perks (migration 169): the signed-in member's ladder discount vs the
  // launch price — the single best advantage wins, they never stack.
  let perkRules: TierPerkRule[] = [];
  if (viewerTier) {
    const { data: perkRows } = await sb.from("exp_tier_perks")
      .select("tier,kind,value,edition_id,package_id")
      .eq("experience_id", experience.id).eq("active", true);
    perkRules = (Array.isArray(perkRows) ? perkRows : []) as TierPerkRule[];
  }
  const advantageByEdition: Record<string, PriceAdvantage> = {};
  for (const e of allEditions) {
    advantageByEdition[e.id] = bestAdvantage(
      launchByEdition[e.id],
      viewerTier ? resolveTierPct(perkRules, { tier: viewerTier.key, editionId: e.id, packageId: null }) : 0,
      viewerTier?.label ?? null,
    );
  }

  // Securing payment: deposit is explicit 0 across the board for now (no Stripe yet)
  // → there's no upfront deposit; the spot is reserved free and confirmed by the
  // down-payment invoice. Show the deposit only when one is actually set.
  const depositAmt = edition?.deposit ?? null;
  const hasDeposit = depositAmt != null && depositAmt > 0;
  const depositPretty = hasDeposit
    ? `${(experience.currency ?? "EUR") === "EUR" ? "€" : (experience.currency ?? "") + " "}${Number(depositAmt).toLocaleString("en-US")}`
    : null;

  // group active packages by edition so each week only shows its own (no dupes)
  // archived_at is the soft-delete truth; status alone let archived rows keep
  // selling (they stayed status='active' — exactly the double gear offer bug).
  const activePackages = (experience.exp_packages ?? []).filter((p) => !(p as { archived_at?: string | null }).archived_at && (team ? p.status === "active" || p.status === "draft" : p.status === "active") && p.price != null);

  // Resolve each package's hotel for the booking step (name + preview photo).
  // Tolerant: hotels media columns + exp_packages.hotel_id arrive in migration 023,
  // so a missing column just yields no hotel preview (never breaks the page).
  type HotelLite = { id: string; name: string; image_url: string | null; images: string[] | null; description: string | null };
  let hotelsList: HotelLite[] = [];
  {
    const { data } = await sb.from("hotels").select("id,name,image_url,images,description");
    if (Array.isArray(data)) hotelsList = data as HotelLite[];
  }
  // Private packages (sold off-website) are excluded from the public listing.
  // Tolerant: the website_visible column arrives in migration 044, so if it's not
  // there yet the query just falls back to showing everything.
  const pkgHotelId: Record<string, string> = {};
  const privatePkgIds = new Set<string>();
  if (activePackages.length) {
    const ids = activePackages.map((p) => p.id);
    let { data } = await sb.from("exp_packages").select("id,hotel_id,website_visible").in("id", ids);
    if (!data) ({ data } = await sb.from("exp_packages").select("id,hotel_id").in("id", ids)); // pre-migration fallback
    if (Array.isArray(data)) for (const r of data as { id: string; hotel_id: string | null; website_visible?: boolean }[]) {
      if (r.hotel_id) pkgHotelId[r.id] = r.hotel_id;
      if (r.website_visible === false) privatePkgIds.add(r.id);
    }
  }
  const hotelById = new Map(hotelsList.map((h) => [h.id, h]));
  const resolveHotel = (pkgId: string, name: string, accommodation: string): HotelLite | null => {
    const linked = pkgHotelId[pkgId] ? hotelById.get(pkgHotelId[pkgId]) : null;
    if (linked) return linked;
    const hay = `${name} ${accommodation}`.toLowerCase();
    // Full-name containment first; then any distinctive word of the hotel name
    // ("Wanapa" in "Boutique Hotel Wanapa" still matches "WANAPA Double Deluxe"
    // after a hotel rename — generic words never match on their own).
    const generic = new Set(["hotel", "beach", "resort", "boutique", "house", "club", "room", "rooms", "surf", "the"]);
    return (
      hotelsList.find((h) => h.name && hay.includes(h.name.toLowerCase())) ??
      hotelsList.find((h) => h.name?.toLowerCase().split(/\s+/).some((w) => w.length >= 5 && !generic.has(w) && hay.includes(w))) ??
      null
    );
  };

  // Packages per edition. A package WITHOUT an edition is SHARED — it applies
  // to every week. A week that needs to differ gets its own edition-scoped
  // package with the same level+room name, which OVERRIDES the shared one for
  // that week only (two passes: scoped first, then shared fills the gaps).
  // Booking-time extras (rental, storage …): components flagged offer_at_booking.
  // Experience-scoped or global; priced by sell_price; archived never offered.
  const bookingExtras = await (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createAdminClient() as any;
      const { data } = await db
        .from("exp_components")
        .select("id,name,description,sell_price,offer_at_booking,is_global,experience_id,archived_at")
        .eq("offer_at_booking", true)
        .is("archived_at", null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[])
        .filter((c) => Number(c.sell_price) > 0 && (c.is_global || c.experience_id === experience.id))
        .map((c) => ({ id: String(c.id), name: String(c.name), description: (c.description as string | null) ?? null, price: Number(c.sell_price) }));
    } catch { return []; }
  })();

  const packagesByEdition: Record<string, RealPackage[]> = {};
  const claimedByEdition: Record<string, Set<string>> = {};
  for (const ed of allEditions) { packagesByEdition[ed.id] = []; claimedByEdition[ed.id] = new Set(); }
  const toReal = (p: PackageRow): RealPackage => {
    const x = parsePackageName(p.name);
    // Level: the package's Category field is the source of truth; the name-parse
    // ("… - Advanced – …") stays as fallback for legacy names.
    const level = p.category ? p.category[0].toUpperCase() + p.category.slice(1) : x.level;
    // Accommodation label: with a Category set, names no longer need the
    // "Level –" segment — if the name's first segment ISN'T the level word, the
    // whole (code-stripped) name is the room label. Legacy "… - Advanced – Room"
    // names keep working unchanged.
    const stripped = p.name.replace(/^[A-Za-z0-9]+\s*-\s*/, "").trim();
    const firstSeg = stripped.split("–")[0]?.trim().toLowerCase() ?? "";
    const accommodation = p.category && firstSeg !== p.category.toLowerCase() && stripped
      ? stripped
      : x.accommodation;
    const h = resolveHotel(p.id, p.name, accommodation);
    return {
      id: p.id, level, accommodation, price: p.price as number,
      gear_baseline: ((p as { gear_baseline?: string | null }).gear_baseline ?? "rental") as string,
      hotelName: h?.name ?? null, hotelImage: h?.image_url ?? null, hotelImages: h?.images ?? null, hotelDescription: h?.description ?? null,
      // Manual list (exp_packages.includes) wins when filled; otherwise the list is
      // the components ✓-checked for the website, each shown with its Website text
      // (exp_components.description, name as fallback).
      includes: (() => {
        const manual = parseIncludes(p.includes);
        // Fixed order, not database order. The rows come back in whatever order
        // the join produces, so two weeks holding the SAME components listed
        // them differently and the copies looked like different products.
        // Coaching first (it is the trip), then where you sleep, then the rest.
        const RANK: Record<string, number> = { coaching: 0, accommodation: 1, gear: 2, meals: 3, transport: 4, other: 5 };
        const rank = (c?: string | null) => RANK[(c ?? "").toLowerCase()] ?? 6;
        const base = manual.length ? manual : (p.exp_package_components ?? [])
          .filter((l) => l?.show_on_website)
          .slice()
          .sort((a, b) => {
            const d = rank(a?.exp_components?.category) - rank(b?.exp_components?.category);
            return d !== 0 ? d : (a?.exp_components?.name ?? "").localeCompare(b?.exp_components?.name ?? "");
          })
          .map((l) => includeLine({ ...l?.exp_components, quantity: l?.quantity }))
          .filter(Boolean);
        // The member-area benefit rides on every package — what it PROMISES
        // (photos, video clips) follows the week's own flags, so the overview
        // never sells media a week doesn't shoot. Hand-written mentions win.
        if (base.some((t) => /member area/i.test(t))) return base;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ped: any = allEditions.find((e) => e.id === p.edition_id) ?? edition;
        const video = ped?.video_analysis !== false;
        const photo = ped?.photoshoot !== false;
        const media = video && photo ? "all your week's photos & videos, " : photo ? "all your week's photos, " : video ? "your video-analysis clips, " : "";
        return [...base, `NP7 member area — ${media}trip documents & progress tracker`];
      })(),
    };
  };
  const pkgKey = (rp: RealPackage) => `${rp.level}::${rp.accommodation}`.toLowerCase();
  const visible = activePackages.filter((p) => !privatePkgIds.has(p.id)); // off-website = sold privately only
  // A shared package sells different weeks with different hotels behind them,
  // so availability is stamped per (package, week) — never on the package alone.
  const withLeft = (rp: RealPackage, editionId: string): RealPackage => ({
    ...rp,
    spotsLeft: availability.get(editionId)?.packages.get(rp.id)?.spotsLeft ?? null,
  });
  for (const p of visible.filter((p) => p.edition_id)) {
    if (!packagesByEdition[p.edition_id!]) continue;
    const rp = toReal(p);
    packagesByEdition[p.edition_id!].push(withLeft(rp, p.edition_id!));
    claimedByEdition[p.edition_id!].add(pkgKey(rp));
  }
  for (const p of visible.filter((p) => !p.edition_id)) {
    const rp = toReal(p);
    for (const ed of allEditions) {
      if (!claimedByEdition[ed.id].has(pkgKey(rp))) packagesByEdition[ed.id].push(withLeft(rp, ed.id));
    }
  }

  // An experience that runs the same week in consecutive years (Alaçatı: 17–23
  // Aug 2026 and 16–22 Aug 2027) renders two near-identical date ranges. Show
  // the year on every week then — and don't call them "Week 1 / Week 2", which
  // reads as two weeks of one season rather than two seasons.
  const editionYears = new Set(allEditions.map((ed) => ed.date_start?.slice(0, 4)).filter(Boolean));
  const multiYear = editionYears.size > 1;

  const editionsLite: EditionLite[] = allEditions.map((ed, i) => {
    const pks = packagesByEdition[ed.id] ?? [];
    return {
      id: ed.id,
      label: ed.label?.trim() || (multiYear && ed.date_start ? ed.date_start.slice(0, 4) : `Week ${i + 1}`),
      dateRange: fmtRange(ed.date_start, ed.date_end),
      shortRange: fmtShort(ed.date_start, ed.date_end, multiYear),
      // The week is bookable while ANY package still has room.
      spotsLeft: availability.get(ed.id)?.bestSpotsLeft ?? null,
      fromPrice: pks.length ? Math.min(...pks.map((p) => p.price)) : null,
      deposit: ed.deposit,
      coaches: ed.coaches,
      dateStart: ed.date_start,
      going: securedByEd[ed.id] ?? 0,
    };
  });

  // "from" price = cheapest package that's actually bookable now: packages on
  // an upcoming edition + shared (edition-less) packages. NOT past-edition
  // packages, and NOT the legacy static exp.price (that's what showed a stale
  // price from a finished trip).
  const editionPrices = editionsLite.map((e) => e.fromPrice).filter((n): n is number => n != null);
  const sharedPrices = visible.filter((p) => !p.edition_id).map((p) => p.price as number);
  const priceCandidates = [...editionPrices, ...sharedPrices];
  const fromPrice = priceCandidates.length ? Math.min(...priceCandidates) : null;
  const spotsLeft = edition ? (availability.get(edition.id)?.bestSpotsLeft ?? null) : null;
  const totalSpotsLeft = editionsLite.reduce((s, e) => s + (e.spotsLeft ?? 0), 0);
  /**
   * Scarcity is only scarcity when the number is small.
   *
   * The reserve modal already knew this and shows a count only at 3 or fewer.
   * The hero and the sticky bar didn't, so on a six-week trip they added the
   * weeks together and announced "38 spots left" — which is not a nudge, it's
   * an inventory report, and it made a week that was actually nearly full read
   * as wide open. Show the TIGHTEST week rather than the sum, and only when it
   * is genuinely tight.
   */
  const SCARCE_AT = 3;
  const tightestWeek = editionsLite
    .map((e) => e.spotsLeft)
    .filter((n): n is number => typeof n === "number" && n > 0)
    .sort((a, b) => a - b)[0] ?? null;
  const scarceLeft = tightestWeek != null && tightestWeek <= SCARCE_AT ? tightestWeek : null;
  // Sold out = every week that HAS a cap is full (uncapped weeks never count as
  // sold out — spotsLeft is null for those, not 0).
  const soldOut = multi
    ? editionsLite.length > 0 && editionsLite.every((e) => e.spotsLeft === 0)
    : spotsLeft === 0;
  const spanStart = allEditions[0]?.date_start ?? edition?.date_start ?? null;
  const spanEnd = allEditions[allEditions.length - 1]?.date_end ?? edition?.date_end ?? null;
  /*
   * A TRIP runs the same week over and over, so "12 Sep – 24 Oct · 4 weeks to
   * choose from" reads as a season and is true.
   *
   * A CLINIC SERIES does not. Its runs are scattered — Hatteras in October,
   * the Gorge eleven months later — and joining the first start to the last end
   * produced "10 October – 11 September 2027", a range that spans a year of
   * nothing and reads backwards. So a series names its runs instead of
   * pretending to be one long season.
   */
  const clinicRuns = runs.map((r) => ({
    location: r.location,
    start: r.dates[0]?.date_start ?? null,
    end: r.dates[0]?.date_end ?? null,
  }));
  const shortPlace = (l: string | null | undefined) => l?.split(",")[0]?.trim() || null;
  const monthYear = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : null;
  const clinicPlaces = [...new Set(clinicRuns.map((r) => shortPlace(r.location)).filter(Boolean))] as string[];
  /** More than one place means the picker is a real choice, and the top of the
   *  page must stop claiming any single spot as THE spot. */
  const travellingClinic = clinicPlaces.length > 1;
  // Two runs named in full, the rest counted — a hero line has no room for six.
  const clinicRunLine = clinicRuns.length
    ? [
        ...clinicRuns.slice(0, 2).map((r) => [shortPlace(r.location), monthYear(r.start)].filter(Boolean).join(", ")),
        ...(clinicRuns.length > 2 ? [`+${clinicRuns.length - 2} more`] : []),
      ].filter(Boolean).join(" · ")
    : "";
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
  /* A trip has one home. A clinic SERIES does not — "NP7 Coaching Clinics USA"
     lives at Hatteras in October and Hood River next September, so the place
     has to come off the chosen run or the page says the wrong coast. */
  const place = (clinic?.location || experience.location)?.split(",")[0] ?? "the water";

  // editable website content (falls back to evergreen when empty)
  const locationAbout = content?.location_about?.trim() ?? "";
  // Falls back to the standard promise — the section used to vanish silently.
  const weekInfo = content?.week_info?.trim() || DEFAULT_WEEK_INFO;
  // editable week cards + coaching method — DB wins, built-ins are the fallback
  // Shared templates (migration 153): the words live ONCE in content_templates;
  // a per-experience field, when set, is a deliberate override. Resolution is
  // override → template → built-in default, so nothing here can render blank.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = content;
  const tplIds = [c?.method_template_id, c?.outcomes_template_id].filter(Boolean) as string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tplById = new Map<string, any>();
  if (tplIds.length) {
    try {
      const { data: tpls } = await sb.from("content_templates").select("id,body").in("id", tplIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tplById = new Map(((tpls ?? []) as any[]).map((t) => [t.id, t.body ?? {}]));
    } catch { /* pre-migration → defaults carry it */ }
  }
  const methodTpl = c?.method_template_id ? tplById.get(c.method_template_id) : null;
  const outcomesTpl = c?.outcomes_template_id ? tplById.get(c.outcomes_template_id) : null;

  const weekTitle = content?.week_title?.trim() || (outcomesTpl?.title as string | undefined)?.trim() || "The best week of your windsurf year";
  type OutcomeCard = { icon?: string; t?: string; d?: string };
  const customOutcomes = (((Array.isArray(content?.week_outcomes) && content!.week_outcomes!.length ? content!.week_outcomes! : null) ?? (Array.isArray(outcomesTpl?.cards) ? outcomesTpl.cards : [])) as OutcomeCard[])
    .filter((o) => (o?.t ?? "").trim())
    .map((o) => ({ icon: o.icon || "bolt", t: o.t!, d: o.d ?? "" }));
  // "What you take home" must only promise what the weeks deliver: when EVERY
  // visible week explicitly switched a media promise off, its card comes down.
  // One week with it on (or undecided) keeps the promise up — the card speaks
  // for the experience, and the per-week truth lives on the packages.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyVideo = allEditions.length === 0 || allEditions.some((e: any) => e.video_analysis !== false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyPhoto = allEditions.length === 0 || allEditions.some((e: any) => e.photoshoot !== false);
  const mediaOutcomeOff = (o: { icon?: string; t: string }) => {
    const hay = `${o.icon ?? ""} ${o.t}`.toLowerCase();
    const isVideoCard = /video/.test(hay);
    const isPhotoCard = /photo|camera/.test(hay);
    if (isVideoCard && isPhotoCard) return !anyVideo && !anyPhoto; // the combined default card
    if (isVideoCard) return !anyVideo;
    if (isPhotoCard) return !anyPhoto;
    return false;
  };
  const outcomeItems = (customOutcomes.length ? customOutcomes : OUTCOMES).filter((o) => !mediaOutcomeOff(o));
  // Per-level versions of this section. Which levels appear is decided by what
  // the experience actually SELLS — the distinct coaching level across every
  // package on show — so a one-level trip renders exactly as before and a level
  // added later brings its chip along without anyone touching content.
  //
  // The copy is a separate question: a level with nothing written for it falls
  // back to the shared title and cards, so switching this on is invisible until
  // the team writes the beginner version.
  const levelVariants = (() => {
    const byLevel = content?.week_outcomes_by_level ?? null;
    const seen = new Map<string, number>();
    for (const list of Object.values(packagesByEdition)) {
      for (const rp of list) {
        const key = (rp.level ?? "").trim().toLowerCase();
        if (!key || key === "mixed") continue;          // "mixed" is not a choice a rider makes
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    if (seen.size < 2) return undefined;
    // Most-sold level first, so the busiest audience lands on its own copy.
    const keys = [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const weekImgs = Array.isArray(c?.week_images) ? (c!.week_images as (string | null)[]) : [];
    return keys.map((key) => {
      const own = byLevel?.[key];
      const cards = (Array.isArray(own?.cards) ? own!.cards! : [])
        .filter((o) => (o?.t ?? "").trim())
        .map((o) => ({ icon: o.icon || "bolt", t: o.t!, d: o.d ?? "" }));
      const items = (cards.length ? cards : outcomeItems).filter((o) => !mediaOutcomeOff(o));
      // The beginner skills card ("From first glide …") shows the SAME shot on
      // every experience — a shallow-water lesson, not whatever action photo
      // the index happens to land on (a slalom racer sold the wrong story).
      const BEGINNER_SKILLS_IMG = "https://media.np-seven.com/experiences/np7-bonaire/learning/beginner-lesson-bonaire.jpg";
      const skillsIdx = items.findIndex((o) => o.icon === "bolt");
      return {
        key,
        label: packageLevelLabel(key),
        title: (own?.title ?? "").trim() || weekTitle,
        outcomes: items,
        images: items.map((_, i) =>
          key === "beginner" && i === skillsIdx
            ? BEGINNER_SKILLS_IMG
            : weekImgs[i] || vibeImages[i % Math.max(1, vibeImages.length)]
        ).filter(Boolean) as string[],
      };
    });
  })();

  const methodIntro = content?.method_intro?.trim() || (methodTpl?.intro as string | undefined)?.trim() || METHOD_INTRO;
  type MethodStepRow = { t?: string; d?: string; gameChanger?: boolean };
  const customSteps = (((Array.isArray(content?.method_steps) && content!.method_steps!.length ? content!.method_steps! : null) ?? (Array.isArray(methodTpl?.steps) ? methodTpl.steps : [])) as MethodStepRow[])
    .filter((m) => (m?.t ?? "").trim())
    .map((m, i) => ({ n: String(i + 1).padStart(2, "0"), t: m.t!, d: m.d ?? "", gameChanger: !!m.gameChanger }));
  const methodSteps = customSteps.length ? customSteps : METHOD;
  const windProbability = content?.wind_probability?.trim() ?? "";
  const windRange = content?.wind_range?.trim() ?? "";
  const noWindProgram = content?.no_wind_program?.trim() ?? "";
  const highlights = (content?.highlights ?? []).filter((h) => h && h.trim());
  // Deliberately NO per-day photos — cycled gallery shots never matched the day
  // text and looked unprofessional (Nico, 2026-07-08). Text-only timeline.
  // The experience-level program is the default every week inherits…
  const programFallback: ProgramDay[] =
    (content?.daily_program ?? []).length > 0
      ? content!.daily_program!.map((p, i) => ({ title: p.title?.trim() || `Day ${i + 1}`, description: p.description ?? "" }))
      : ITINERARY.map((it, i) => ({ title: it.title || `Day ${i + 1}`, description: typeof it.content === "string" ? it.content : "" }));
  // …and a single week can override it (exp_editions.daily_program, migration 112).
  const programByEdition: Record<string, ProgramDay[]> = {};
  if (allEditions.length) {
    const { data: edProg } = await sb.from("exp_editions").select("id,daily_program").in("id", allEditions.map((e) => e.id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of ((edProg ?? []) as any[])) {
      if (Array.isArray(r.daily_program) && r.daily_program.length) {
        programByEdition[r.id] = r.daily_program.map((p: { title?: string; description?: string }, i: number) => ({
          title: p.title?.trim() || `Day ${i + 1}`, description: p.description ?? "",
        }));
      }
    }
  }
  const faqItems: AccordionItem[] =
    (content?.faq ?? []).length > 0
      ? content!.faq!.map((f) => ({ title: f.q, content: <span className="whitespace-pre-line">{f.a}</span> }))
      : FAQ;
  // Data-driven guides for the primary edition (fallback to brand defaults).
  // Fetched separately so missing tables (pre-migration 019) can't break the page.
  // Teams differ per WEEK, so fetch every edition's crew and let the page follow
  // whichever week the visitor picks (SelectedEditionProvider → CrewCarousel).
  let guideItems: Guide[] = COACHES;
  const coachesByEdition: Record<string, Guide[]> = {};
  // include recent PAST published editions: between seasons (no upcoming week
  // yet) the page should show the last real team, not the brand placeholders
  const pastPublished = (experience.exp_editions ?? [])
    .filter((e) => e.status === "published" && e.date_end && e.date_end < today)
    .sort((a, b) => ((a.date_end ?? "") > (b.date_end ?? "") ? -1 : 1));
  const coachEdIds = [...allEditions.map((e) => e.id), ...pastPublished.map((e) => e.id)];
  if (coachEdIds.length) {
    // whatsapp_link arrives in migration 027 — try with it, fall back without.
    const sel = (wa: boolean) => `edition_id,sort_order,name_override,role_override,bio_override,image_override,exp_coaches(name,role,bio,image_url${wa ? ",whatsapp_link" : ""})`;
    let { data: gc, error } = await sb.from("exp_edition_coaches").select(sel(true)).in("edition_id", coachEdIds).order("sort_order");
    if (error) ({ data: gc } = await sb.from("exp_edition_coaches").select(sel(false)).in("edition_id", coachEdIds).order("sort_order"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const g of ((gc ?? []) as any[])) {
      const item: Guide = {
        name: g.name_override ?? g.exp_coaches?.name ?? "",
        role: g.role_override ?? g.exp_coaches?.role ?? "",
        bio: g.bio_override ?? g.exp_coaches?.bio ?? "",
        image: g.image_override ?? g.exp_coaches?.image_url ?? BRAND_IMG.group,
        whatsapp: g.exp_coaches?.whatsapp_link ?? null,
      };
      if (item.name) (coachesByEdition[g.edition_id] ??= []).push(item);
    }
    // the default week's crew is the fallback (and what non-JS/first paint shows)
    if (edition?.id && coachesByEdition[edition.id]?.length) guideItems = coachesByEdition[edition.id];
    else {
      const lastReal = pastPublished.find((e) => coachesByEdition[e.id]?.length);
      if (lastReal) guideItems = coachesByEdition[lastReal.id];
    }
  }

  // Admin-curated participant reviews for this experience (fallback to legacy content.reviews).
  const { data: placementRows } = await sb
    .from("exp_review_placements")
    .select("sort_order, exp_reviews(author_name,author_country,rating,quote,photo_url,status,booking_id,category_ratings,reply)")
    .eq("experience_id", experience.id)
    .order("sort_order");
  // The PERSON behind a verified review — but only when they opted their
  // community profile into the "reviews" surface (profile settings → "On
  // reviews I write", off by default). publicProfileFor is the single privacy
  // gate: a null there means "not visible", and the card stays name-only.
  const avatarByBooking = new Map<string, string>();
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bids = ((placementRows ?? []) as any[]).map((pr) => pr.exp_reviews?.booking_id).filter(Boolean);
    if (bids.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adminDb = createAdminClient() as any;
      const { data: bs } = await adminDb.from("exp_bookings").select("id, contact_id").in("id", bids);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cids = [...new Set(((bs ?? []) as any[]).map((b) => b.contact_id).filter(Boolean))];
      if (cids.length) {
        const { data: cs } = await adminDb
          .from("contacts")
          .select("id,name,username,avatar_url,country,display_city,self_level,level,level_status,date_of_birth,profile_visibility")
          .in("id", cids);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const profByContact = new Map(((cs ?? []) as any[]).map((c) => [c.id, publicProfileFor(c, "reviews")]));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const b of ((bs ?? []) as any[])) {
          const prof = profByContact.get(b.contact_id);
          if (prof?.avatarUrl) avatarByBooking.set(b.id, prof.avatarUrl);
        }
      }
    }
  }

  type PlacedReview = { author_name: string | null; author_country: string | null; rating: number | null; quote: string | null; photo_url: string | null; status: string; booking_id: string | null; category_ratings?: Record<string, number> | null; reply?: string | null };
  const placedReviews = (placementRows ?? [])
    .map((p: { exp_reviews: PlacedReview | null }) => p.exp_reviews)
    .filter((r: PlacedReview | null): r is PlacedReview => !!r && r.status === "approved")
    .map((r: PlacedReview) => ({
      quote: r.quote ?? "",
      // Public pages shorten to "Thomas J." — same privacy convention as the
      // member area. The form PREFILLS the full contact name and most guests
      // submit it untouched, so "they typed it themselves" would be generous.
      // Curated legacy quotes (content.reviews) keep their hand-written names.
      name: firstNameInitial(r.author_name),
      country: r.author_country ?? "",
      image: r.photo_url || BRAND_IMG.group, rating: Math.max(1, Math.min(5, r.rating || 5)),
      verified: !!r.booking_id,
      // Absent for every review written before categories existed — the card
      // then renders exactly as it always has.
      cats: r.category_ratings ?? null,
      // The reviewer's community-profile photo — only with their opt-in.
      avatarUrl: r.booking_id ? avatarByBooking.get(r.booking_id) ?? null : null,
      reply: (r.reply ?? "").trim() || null,
    }));

  // Per-category averages across the placed reviews that actually rated them.
  // Empty until the first categorised review is approved — the row simply
  // doesn't render, so the section looks untouched for older content.
  const catAverages = (() => {
    const sums = new Map<string, { s: number; n: number }>();
    for (const r of placedReviews) {
      for (const [k, v] of Object.entries(r.cats ?? {})) {
        const num = Number(v);
        if (!(num >= 1 && num <= 5)) continue;
        const e = sums.get(k) ?? { s: 0, n: 0 };
        e.s += num; e.n += 1; sums.set(k, e);
      }
    }
    return REVIEW_CATEGORIES
      .map((c) => ({ key: c.key, label: c.label, ...(sums.get(c.key) ?? { s: 0, n: 0 }) }))
      .filter((e) => e.n > 0)
      .map((e) => ({ key: e.key, label: e.label, avg: Math.round((e.s / e.n) * 10) / 10 }));
  })();

  // Hero review pill: overall average + count across the placed REAL reviews.
  // Zero reviews → the pill yields to the old "How it works" button; a pill
  // with no proof behind it would be an anti-testimonial.
  const reviewCount = placedReviews.length;
  const reviewAvg = reviewCount
    ? Math.round((placedReviews.reduce((a: number, r: { rating: number }) => a + r.rating, 0) / reviewCount) * 10) / 10
    : null;

  const reviewItems =
    placedReviews.length > 0
      ? placedReviews
      : (content?.reviews ?? []).length > 0
        ? content!.reviews!.map((r) => ({ quote: r.quote, name: r.name, country: r.country, image: r.image || BRAND_IMG.group, rating: Math.max(1, Math.min(5, r.rating || 5)), verified: false }))
        : MOMENTS.map((m) => ({ ...m, rating: 5, verified: false }));

  // Destination quick-module (migration 022; tolerant — hidden until applied + linked)
  let destination: { slug: string | null; name: string; region: string | null; country: string | null; tagline: string | null; intro: string | null; hero_image: string | null } | null = null;
  {
    const { data: ed } = await sb.from("exp_experiences").select("destination_id").eq("id", experience.id).maybeSingle();
    if (ed?.destination_id) {
      const { data: dd } = await sb.from("destinations").select("slug,name,region,country,tagline,intro,hero_image,status,wind_stats").eq("id", ed.destination_id).maybeSingle();
      if (dd && dd.status === "published" && dd.slug) destination = dd;
    }
  }
  // "Explore {spot}" never navigates the booking visitor away — the rich
  // DESTINATION deep-dive opens ON the trip instead (DestinationDeepDive).

  // ONE preset for every experience: "The spot" always renders the same section —
  // the editor's location_about wins, otherwise the linked destination's own
  // intro/tagline fills it. No per-experience layout divergence (Nico's rule);
  // only when there's no text anywhere does the compact banner stand in.
  const spotAbout = locationAbout || destination?.intro?.trim() || destination?.tagline?.trim() || "";

  // Measured wind, not asserted wind: the destination's ERA5 climatology
  // (accelerated read — see wind-stats.ts) gives the share of sailing-wind days
  // for the trip's month. Where it exists it REPLACES the hand-typed
  // wind_probability everywhere on the page; the manual field stays only as a
  // fallback for destinations without coordinates.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const windStats = ((destination as any)?.wind_stats ?? null) as import("@/lib/wind-stats").WindStats | null;
  const tripMonth = edition?.date_start ? new Date(edition.date_start + "T00:00:00Z").getUTCMonth() + 1 : null;
  // Every calendar month a week touches — a week running 28 Aug – 3 Sep covers
  // two, and the wind graph should light up both rather than only its first.
  const monthsSpanned = (start?: string | null, end?: string | null): number[] => {
    if (!start) return [];
    const s0 = new Date(start + "T00:00:00Z");
    const e0 = end ? new Date(end + "T00:00:00Z") : s0;
    const out: number[] = [];
    const cur = new Date(Date.UTC(s0.getUTCFullYear(), s0.getUTCMonth(), 1));
    while (cur <= e0 && out.length < 12) { out.push(cur.getUTCMonth() + 1); cur.setUTCMonth(cur.getUTCMonth() + 1); }
    return out.length ? out : [s0.getUTCMonth() + 1];
  };
  const monthsByEdition: Record<string, number[]> = {};
  for (const e of allEditions) monthsByEdition[e.id] = monthsSpanned(e.date_start, e.date_end);
  const defaultTripMonths = edition ? monthsSpanned(edition.date_start, edition.date_end) : [];
  const measuredPct = windStats && tripMonth && !statsAreBlind(windStats)
    ? (() => {
        const m = windStats.months?.find((x) => x.m === tripMonth);
        // day-window metric first (see wind-stats.ts), hours-share fallback
        const v = m?.dayPct ?? Number((m?.pct as Record<string, number> | undefined)?.["4"] ?? 0);
        return Math.round(Number(v)) || null;
      })()
    : null;
  const windDisplay = measuredPct != null ? `${measuredPct}%` : windProbability;

  return (
    <SelectedEditionProvider initialId={edition?.id ?? null}>
      <OceanHeader bookHref="#packages"  showAbout={flags.showExperience} showHardware={flags.showHardware} />

      {/* HERO */}
      <section className="relative min-h-[74vh] flex items-end bg-[#00374a] overflow-hidden">
        {heroVideoUrl ? (
          <HeroVideo url={heroVideoUrl} start={heroVideoStart} end={heroVideoEnd} poster={heroMediaImage} />
        ) : (
          <>
            {/* framing per screen shape — the media queries pick, so ISR keeps
                serving one html and nothing re-crops after paint */}
            <style>{FOCUS_CSS}</style>
            <div className={`absolute inset-0 bg-cover scale-105 ${FOCUS_CLASS}`}
              style={{ backgroundImage: `url('${heroMediaImage}')`, ...focusVars(parseFocus(content?.hero_focus, content?.hero_focus_shapes)) }} />
          </>
        )}
        {/* darken toward the bottom for the title/CTA, fade to clear at the top so the photo reads */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#00374a] via-[#00374a]/55 to-transparent" />
        {/* soft top scrim, only for the floating header's legibility over a bright sky */}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/30 to-transparent" aria-hidden />
        {/* warm sun glow — the brand's "sun to sea" warmth, now clearly in frame */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_58%_50%_at_80%_8%,rgba(244,123,32,0.34),transparent_56%)]" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-[radial-gradient(ellipse_70%_100%_at_50%_100%,rgba(255,150,60,0.14),transparent_70%)]" aria-hidden />
        <div className="relative w-full max-w-[1200px] mx-auto px-6 sm:px-8 pb-9 pt-28">
          <Reveal from="up">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {/* A travelling series has no one location to stamp above the
                  title, and its runs are clinics rather than weeks. */}
              <span className="text-[12px] font-bold tracking-[0.2em] uppercase text-white/75">
                {travellingClinic ? clinicPlaces.join(" · ") : (clinic?.location ?? experience.location)}
              </span>
              {clinicRuns.length > 1 ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1 rounded-full text-[#5fd0e8] bg-[#00afdb]/15 border border-[#00afdb]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5fd0e8] animate-pulse" />
                  {clinicRuns.length} clinics
                </span>
              ) : multi ? (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1 rounded-full text-[#5fd0e8] bg-[#00afdb]/15 border border-[#00afdb]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5fd0e8] animate-pulse" />
                  {allEditions.length} weeks{scarceLeft != null ? ` · one week down to ${scarceLeft}` : ""}
                </span>
              ) : typeof spotsLeft === "number" ? (
                <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1 rounded-full ${spotsLeft > 0 ? "text-[#5fd0e8] bg-[#00afdb]/15 border border-[#00afdb]/30" : "text-white bg-[#f47b20]"}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                  {spotsLeft === 0 ? "Fully booked" : spotsLeft <= SCARCE_AT ? `Only ${spotsLeft} spots left` : "Spots available"}
                </span>
              ) : null}
            </div>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white leading-[0.98] tracking-[-0.035em] mb-4 max-w-[840px]">{experience.title}</h1>
            {datesTBD ? (
              <p className="text-[16px] sm:text-[17px] text-white/70 mb-6">Dates coming soon — new weeks are announced regularly.</p>
            ) : (spanStart || edition) ? (
              <p className="text-[16px] sm:text-[17px] text-white/70 mb-6">
                {clinicRuns.length > 1
                  ? `${clinicRuns.length} clinics · ${clinicRunLine}`
                  : clinic
                    ? fmtRange(clinicRuns[0]?.start, clinicRuns[0]?.end)
                    : multi
                      ? `${fmtRange(spanStart, spanEnd)} · ${allEditions.length} weeks to choose from`
                      : fmtRange(edition.date_start, edition.date_end)}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              {datesTBD ? (
                <Link href={`mailto:experience@np-seven.com?subject=Interested: ${experience.title}`} className="px-7 py-4 rounded-full text-[14px] font-bold text-[#00374a] bg-white hover:-translate-y-0.5 transition-all">
                  Register your interest
                </Link>
              ) : soldOut ? (
                <Link href={`mailto:experience@np-seven.com?subject=Waitlist: ${experience.title}`} className="px-7 py-4 rounded-full text-[14px] font-bold text-[#00374a] bg-white hover:-translate-y-0.5 transition-all">
                  Fully booked · join the waitlist
                </Link>
              ) : (
                <Link href="#packages" data-track="reserve_cta" data-track-label="hero" className="px-7 py-4 rounded-full text-[14px] font-bold text-[#00374a] bg-white hover:-translate-y-0.5 transition-all">
                  {money(fromPrice, experience.currency) ? `Reserve your spot · from ${money(fromPrice, experience.currency)}` : "Reserve your spot"}
                </Link>
              )}
              {reviewAvg != null ? (
                <Link href="#reviews" className="inline-flex items-center gap-2 px-7 py-4 rounded-full text-[14px] font-bold text-white border-[1.5px] border-white/40 hover:bg-white/10 transition-all">
                  <span className="text-[#ffd24a]">★</span> {reviewAvg.toFixed(1)} · {reviewCount} review{reviewCount === 1 ? "" : "s"}
                </Link>
              ) : (
                <Link href="#method" className="px-7 py-4 rounded-full text-[14px] font-bold text-white border-[1.5px] border-white/40 hover:bg-white/10 transition-all">How it works</Link>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* QUICK FACTS — blue, integrated into the dark hero zone. The light "your
          epic week" below now provides the clear break, so this can stay seamless. */}
      <section className="bg-[#00374a] text-white">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8"><div className="border-t border-white/10 py-6 grid grid-cols-2 sm:grid-cols-4 gap-y-6 gap-x-4">
          {/* A travelling series has no single "where" and no single airport, so
              those facts describe the SET of runs; the chosen run states its own
              below the selector. A dash is not a fact — empties are dropped. */}
          {([
            clinicRuns.length > 1
              ? { icon: "calendar", label: `${clinicRuns.length} clinics`, value: clinicRuns.map((r) => monthYear(r.start)).filter(Boolean).join(" · ") }
              : { icon: "calendar", label: multi ? `${allEditions.length} weeks to choose` : "When", value: clinic
                  ? fmtShort(clinicRuns[0]?.start, clinicRuns[0]?.end)
                  : multi
                    ? fmtShort(spanStart, spanEnd)
                    : fmtShort(edition?.date_start, edition?.date_end) },
            { icon: "pin", label: travellingClinic ? "Locations" : "Where",
              value: travellingClinic
                ? (clinicPlaces.length > 2 ? `${clinicPlaces.length} spots in ${experience.location ?? "the US"}` : clinicPlaces.join(" & "))
                : (clinic?.location ?? experience.location ?? "") },
            { icon: "wind", label: "Typical wind", value: travellingClinic ? "" : (windRange || (windDisplay ? `Sailing wind ${windDisplay} of days` : "Steady in season")) },
            { icon: "plane", label: "Airport", value: travellingClinic ? "" : (experience.airport_code ?? "") },
          ] as { icon: string; label: string; value: string }[]).filter((f) => f.value).map((f) => (
            <div key={f.label} className="flex items-start gap-3">
              <span className="text-[#00afdb] mt-0.5"><FactIcon name={f.icon} /></span>
              <span><span className="block text-[10px] font-bold tracking-[0.15em] uppercase text-white/40">{f.label}</span><span className="block text-[13.5px] font-bold">{f.value}</span></span>
            </div>
          ))}
        </div></div>
      </section>

      {/* sticky sub-nav — same component as the destination pages, so the two
          long-form templates feel like one family. "Reserve" = persistent
          shortcut to the conversion module. */}
      <SectionNav
        // A clinic switches off the week story, the packages and the day-by-day,
        // so their tabs have to go with them — a nav link that scrolls nowhere
        // is worse than a shorter nav.
        sections={([
          !clinic && { id: "week", label: "Your week" },
          { id: "method", label: "Coaching" },
          spotAbout && !clinic && { id: "spot", label: "The spot" },
          // The clinic selector IS the booking block, and it sits above the crew
          // so the crew shown is the one you just picked — the nav has to agree
          // with that order or it teaches people not to trust it.
          clinic && runs.length > 0 && { id: "packages", label: runs.length > 1 ? "Dates" : "Book" },
          !clinic && { id: "packages", label: "Packages" },
          !clinic && { id: "program", label: "Day by day" },
          { id: "crew", label: "Crew" },
          { id: "faq", label: "FAQ" },
        ].filter(Boolean)) as NavSection[]}
        topClass="top-16"
        action={{ label: clinic ? "Get your spot" : soldOut ? "Waitlist" : "Reserve", href: "#packages" }}
      />

      {/* 1 · THE DREAM — your epic week (pinned scroll through the outcomes).
          A clinic has no week to narrate; skipped rather than shown thin. */}
      {!clinic && (
      <div id="week" className="scroll-mt-28">
      <EpicWeekScroll
        outcomes={outcomeItems}
        images={(() => {
          // explicit per-card image wins; empty slot falls back to gallery
          // position N — the old behaviour, so re-ordering the Media tab can
          // no longer silently reshuffle a card someone pinned a photo to
          const wk = Array.isArray(c?.week_images) ? (c.week_images as (string | null)[]) : [];
          return outcomeItems.map((_, i) => wk[i] || vibeImages[i % Math.max(1, vibeImages.length)]).filter(Boolean) as string[];
        })()}
        eyebrow="YOUR EPIC WEEK"
        levels={levelVariants}
        title={weekTitle}
        intro={experience.description || "One week, fully immersed in the sport you love — epic conditions, world-class coaching, and a crew that feels like old friends by day two."}
        weekInfo={weekInfo}
      />
      </div>
      )}
      {/* Explainer video — Nico walks through the trip (hidden if no link) */}
      <ExplainerVideo url={content?.explainer_video_url} title={`Nico walks you through ${experience.title.replace(/^NP7 (Experience )?/i, "")}`} />
      {/* 2 · THE NP7 TRAINING SYSTEM — the unique mechanism */}
      <section id="method" className="scroll-mt-28 py-16 sm:py-24 bg-[#00374a] text-white relative overflow-hidden">
        <Slideshow images={vibeImages} className="opacity-45" />
        {/* readable scrim — photo shows through more than before; warm glow keeps it fun, not clinical */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#00374a]/85 via-[#00374a]/65 to-[#013242]/85" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_15%,rgba(0,175,219,0.25),transparent_55%)]" />
        <div className="relative max-w-[1100px] mx-auto px-6 sm:px-8">
          <Reveal className="max-w-[660px] mb-12">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#8fe6f2] mb-3">THE NP7 TRAINING SYSTEM</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] mb-4">Coaching that actually changes your riding</h2>
            <p className="text-[16px] text-white/60 leading-relaxed">{methodIntro}</p>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-5">
            {methodSteps.map((s, i) => (
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
          {/* the full method opens as an overlay ON the trip — never navigate away */}
          <Reveal className="mt-8">
            <MethodModal />
          </Reveal>
        </div>
      </section>

      {/* 3 · CERTAINTY — you can count on it — a promise about a months-long payment plan, which a
          clinic paid in one go does not make. */}
      {!clinic && (
      <section className="relative py-16 sm:py-24 bg-[#fff7ec] overflow-hidden">
        {/* wind drifting across the water — a bit of life behind the facts */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {[
            { top: "16%", w: 220, dur: 9, delay: 0, c: "0,175,219" },
            { top: "34%", w: 150, dur: 12, delay: 3.5, c: "244,123,32" },
            { top: "58%", w: 260, dur: 8, delay: 1.5, c: "0,175,219" },
            { top: "72%", w: 130, dur: 13, delay: 5, c: "0,175,219" },
            { top: "88%", w: 190, dur: 10.5, delay: 2.4, c: "244,123,32" },
          ].map((s, i) => (
            <span key={i} className="cw-streak" style={{ top: s.top, width: s.w, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s`, background: `linear-gradient(90deg, transparent, rgba(${s.c},0.5), transparent)` }} />
          ))}
        </div>
        <div className="relative max-w-[1100px] mx-auto px-6 sm:px-8">
          <Reveal className="text-center max-w-[640px] mx-auto mb-10">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">THE ODDS ARE IN YOUR FAVOUR</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a]">Set up for a great week</h2>
          </Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              // fallback is wind-system-neutral — "Trade winds" was wrong for Garda's thermal Ora
              { icon: "wind", big: windDisplay || "Reliable wind", small: measuredPct != null ? "days with sailing wind — measured" : windProbability ? "wind probability in season" : "planned around the forecast", sub: windRange || null },
              { icon: "star", big: "5.0", small: "guest rating", sub: "5-star reviews, week after week" },
              { icon: "crew", big: "Good people", small: "great crew", sub: "hand-picked, friendly vibe" },
              { icon: "sun", big: "Plan B", small: "no-wind program", sub: "we make every day count" },
            ].map((s, i) => (
              <Reveal key={s.small} delay={i * 80}>
                <div className="group h-full bg-white rounded-2xl border border-[#f0e6d6] p-6 text-center shadow-[0_8px_24px_rgba(0,55,74,0.05)] hover:shadow-[0_18px_40px_rgba(0,55,74,0.12)] hover:-translate-y-1.5 transition-all duration-300">
                  <span className="mx-auto mb-3 grid place-items-center w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00afdb]/12 to-[#f47b20]/10 text-[#00afdb] group-hover:scale-110 transition-transform"><CertaintyIcon name={s.icon} /></span>
                  <div className="text-[26px] sm:text-[30px] font-black tracking-[-0.02em] text-[#00374a]">{s.big}</div>
                  <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#00afdb] mt-1">{s.small}</div>
                  {s.sub && <div className="text-[12.5px] text-[#8a9aa0] mt-2">{s.sub}</div>}
                </div>
              </Reveal>
            ))}
          </div>
          <style>{`
            .cw-streak { position: absolute; left: -280px; height: 2px; border-radius: 9999px; animation-name: cwDrift; animation-timing-function: linear; animation-iteration-count: infinite; }
            @keyframes cwDrift { from { transform: translateX(0); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } to { transform: translateX(calc(100vw + 320px)); opacity: 0; } }
            @media (prefers-reduced-motion: reduce) { .cw-streak { animation: none; opacity: 0; } }
          `}</style>
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
      )}

      {/* 4 · THE SPOT — the destination link lives INSIDE it (no separate banner).
          A clinic series has no single spot; each run states its own inside the
          selector panel below. */}
      {spotAbout && !clinic && (
        <section id="spot" className="scroll-mt-28 py-16 sm:py-24">
          {/* two columns already from md — stacked full-width only on phones, where
              a 16:9 crop keeps the image from eating the whole viewport */}
          <div className="max-w-[1100px] mx-auto px-6 sm:px-8 grid md:grid-cols-[1.1fr_1fr] gap-8 md:gap-10 lg:gap-16 items-center">
            <Reveal from="left">
              {(() => {
                const spotImg = destination?.hero_image ?? galleryImgs[1] ?? heroMediaImage;
                return <div className="aspect-[16/9] md:aspect-[4/3] rounded-3xl bg-cover bg-center shadow-[0_20px_50px_rgba(0,55,74,0.12)]" style={{ backgroundImage: `url('${spotImg}')` }} />;
              })()}
            </Reveal>
            <Reveal from="right">
              <div>
                <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">THE SPOT</p>
                <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mb-5">{place}</h2>
                <p className="text-[16px] text-[#5a6b72] leading-relaxed whitespace-pre-line">{spotAbout}</p>
                {(windRange || windDisplay) && (
                  <div className="flex flex-wrap gap-2 mt-6">
                    {windRange && <span className="text-[12.5px] font-bold text-[#00374a] bg-[#00afdb]/10 px-3.5 py-1.5 rounded-full">{windRange}</span>}
                    {windDisplay && <span className="text-[12.5px] font-bold text-[#00374a] bg-[#00afdb]/10 px-3.5 py-1.5 rounded-full">{measuredPct != null ? `${windDisplay} sailing-wind days` : `${windDisplay} wind probability`}</span>}
                  </div>
                )}
                {windStats && tripMonth && <WindMiniChart stats={windStats} centerMonth={defaultTripMonths.length ? defaultTripMonths : tripMonth} monthsByEdition={monthsByEdition} />}
                {destination?.slug && (
                  /* opens the rich DESTINATION deep-dive ON the trip — zero navigation, zero funnel leak */
                  <div className="mt-7">
                    <TripOverlay
                      label={`${destination.name} · The destination`}
                      triggerClassName="group inline-flex items-center gap-2 px-6 py-3 rounded-full text-[13.5px] font-bold text-white bg-[#00afdb] shadow-[0_4px_18px_rgba(0,175,219,0.3)] hover:bg-[#15c0ec] hover:-translate-y-0.5 transition-all"
                      trigger={<>
                        Explore {destination.name}
                        <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </>}>
                      <DestinationDeepDive slug={destination.slug} />
                    </TripOverlay>
                  </div>
                )}
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* 4b · DESTINATION banner — fallback only when there's no spot text to host the link */}
      {destination && !spotAbout && (
        <section className="py-12 sm:py-16">
          <div className="max-w-[1100px] mx-auto px-6 sm:px-8">
            <Reveal>
              {(() => {
                const banner = <>
                  {destination.hero_image && <div className="absolute inset-0 bg-cover bg-center scale-105 group-hover:scale-110 transition-transform duration-700" style={{ backgroundImage: `url('${destination.hero_image}')` }} />}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#00374a] via-[#00374a]/40 to-transparent" />
                  <div className="relative p-7 sm:p-9 text-white max-w-[640px] text-left">
                    <p className="text-[11px] font-bold tracking-[0.25em] text-[#8fe6f2] mb-2">DISCOVER THE DESTINATION</p>
                    <h2 className="text-2xl sm:text-3xl font-black tracking-[-0.02em]">{destination.name}</h2>
                    {destination.tagline && <p className="text-[14.5px] text-white/80 mt-1.5">{destination.tagline}</p>}
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-bold mt-4 group-hover:gap-2.5 transition-all">Explore {destination.name}
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </span>
                  </div>
                </>;
                const cls = "group relative block w-full rounded-3xl overflow-hidden min-h-[240px] flex items-end bg-[#00374a] shadow-[0_20px_50px_rgba(0,55,74,0.15)]";
                return destination.slug
                  ? <TripOverlay label={`${destination.name} · The destination`} triggerClassName={cls} trigger={banner}><DestinationDeepDive slug={destination.slug} /></TripOverlay>
                  : <div className={cls}>{banner}</div>;
              })()}
            </Reveal>
          </div>
        </section>
      )}

      {/* 5 · BOOKING — packages for a trip, one ticket for a clinic.
          A clinic has no level to pick and no room to choose: it is one seat at
          one price, so the picker would be a form with a single option. */}
      {!clinic && (
      <section id="packages" className="scroll-mt-28 py-16 sm:py-24 bg-[#f7f7f7]">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="text-center max-w-[600px] mx-auto mb-12">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">PACKAGES</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mb-4">Build your week</h2>
            <p className="text-[16px] text-[#6a7a80]">{multi ? "Choose your week, then pick your coaching level and accommodation — your price updates instantly." : "Pick your coaching level and accommodation — your price updates instantly."}</p>
            {hasDeposit ? (
              <p className="text-[14px] font-semibold text-[#00374a] mt-3">Reserve with a <span className="text-[#00afdb] font-extrabold">{depositPretty} deposit</span> — the rest is due later.</p>
            ) : (
              <p className="text-[14px] font-semibold text-[#00374a] mt-3">Reserve your spot now — <span className="text-[#00afdb] font-extrabold">no payment yet</span>. We&apos;ll send your down-payment invoice to confirm it.</p>
            )}
          </Reveal>
          {editionsLite.length > 0 ? (
            <Reveal>
              <EditionBooking
                editions={editionsLite}
                packagesByEdition={packagesByEdition}
                extras={bookingExtras}
                launchByEdition={advantageByEdition}
                currency={experience.currency ?? undefined}
                experienceId={experience.id}
                experienceTitle={experience.title}
                heroImage={heroMediaImage}
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
      )}

      {/* 6 · YOUR PERFECT WEEK — a day-by-day belongs to a week. */}
      {!clinic && (
      <section id="program" className="scroll-mt-28 py-16 sm:py-24">
        <div className="max-w-[760px] mx-auto px-6 sm:px-8">
          {highlights.length > 0 && (
            <Reveal className="flex flex-wrap gap-2 mb-8">
              {highlights.map((h) => (
                <span key={h} className="text-[12.5px] font-semibold text-[#00374a] bg-[#00afdb]/10 px-3.5 py-1.5 rounded-full">{h}</span>
              ))}
            </Reveal>
          )}
          <Reveal className="mb-10">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">DAY BY DAY</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mb-3">Your perfect week in {place}</h2>
            <p className="text-[14.5px] text-[#7a8a90] leading-relaxed italic">This is what the ideal week looks like — the exact day-to-day depends on the wind. We chase the best conditions and adapt as we go.</p>
          </Reveal>
          {/* follows the week picked in the booking block — a week can run its own plan */}
          <Reveal>
            <ProgramForWeek
              programByEdition={programByEdition}
              fallback={programFallback}
              weekLabels={Object.fromEntries(editionsLite.map((e) => [e.id, e.label]))}
            />
          </Reveal>
        </div>
      </section>
      )}

      {/* 6½ · THE SELECTOR — where the series page stops describing the format
          and starts describing ONE run. Everything above is series-level; the
          panel below, and the crew that follows it, belong to the chosen clinic. */}
      {clinic && runs.length > 0 && (
        <section id="packages" className="scroll-mt-28 py-16 sm:py-24 bg-[#f7f7f7]">
          <div className="max-w-[1000px] mx-auto px-6 sm:px-8">
            <ClinicEditions
              initialSlug={pickedEdition ?? null}
              runs={runs.map((r): ClinicRun => ({
                editionId: r.editionId,
                place: shortPlace(r.location),
                dateLabel: fmtShort(r.dates[0]?.date_start, r.dates[0]?.date_end, true) || "Dates to come",
                slug: r.editionSlug ?? null,
              }))}
              panels={runs.map((r) => (
                <div key={r.editionId ?? r.editionSlug} className="grid lg:grid-cols-[1.15fr_1fr] gap-9 lg:gap-14 items-start">
                  <div>
                    <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">
                      {[shortPlace(r.location), fmtShort(r.dates[0]?.date_start, r.dates[0]?.date_end, true)].filter(Boolean).join(" · ").toUpperCase()}
                    </p>
                    <h3 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a] mb-4">
                      {r.location || experience.title}
                    </h3>
                    {r.description && (
                      <p className="text-[16px] text-[#5a6b72] leading-relaxed whitespace-pre-line">{r.description}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">YOUR SPOT</p>
                    <ClinicTicketBox event={r} isMember={!!clinicMember?.contactId} paid={paid === "1"} paidBookingId={paidBookingId ?? null} />
                    <p className="text-[13px] text-[#6a7a80] mt-4 leading-relaxed">
                      One seat, one price — accommodation and gear you arrange yourself, so you only pay for the coaching.
                    </p>
                  </div>
                </div>
              ))}
            />
          </div>
        </section>
      )}

      {/* 7 · PROOF — coaches & reviews (crew = your coaches + the riders you'll share the week with) */}
      <section id="crew" className="scroll-mt-28 py-16 sm:py-24 bg-[#f7f7f7]">
        <div className="max-w-[1100px] mx-auto px-6 sm:px-8">
          <Reveal className="mb-8"><p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">YOUR TEAM</p><h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">Learn from the best</h2></Reveal>
          <Reveal className="mb-16">
            {/* follows the week picked in the booking block — teams differ per week */}
            <CrewCarousel
              coachesByEdition={coachesByEdition}
              fallback={guideItems}
              weekLabels={Object.fromEntries(editionsLite.map((e) => [e.id, e.label]))}
              unit={clinic ? "clinic" : "week"}
            />
          </Reveal>
          {/* anchor for the hero's review pill — Reveal doesn't take an id */}
          <span id="reviews" className="block scroll-mt-28" aria-hidden />
          <Reveal className="mb-8">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">{reviewAvg != null ? `★ ${reviewAvg.toFixed(1)} — WHAT GUESTS SAY` : "★ 5.0 — WHAT GUESTS SAY"}</p>
            <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">Moments &amp; new friends</h2>
            {catAverages.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {catAverages.map((c) => (
                  <span key={c.key} className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#e8e2d5] px-3 py-1.5 text-[12.5px] font-semibold text-[#5a6b72]">
                    {c.label} <span className="font-black text-[#00374a]">{c.avg.toFixed(1)}</span><span className="text-[#f5a623] -ml-0.5">★</span>
                  </span>
                ))}
              </div>
            )}
          </Reveal>
          <Reveal>
            <GuestReviews items={reviewItems} />
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
      <section id="faq" className="scroll-mt-28 py-16 sm:py-24 bg-[#fff7ec]">
        <div className="max-w-[760px] mx-auto px-6 sm:px-8">
          <Reveal className="mb-10 text-center"><p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">GOOD TO KNOW</p><h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">Questions, answered</h2></Reveal>
          <Reveal><Accordion items={faqItems} allowMultiple /></Reveal>
        </div>
      </section>

      {/* 10 · FINAL CTA */}
      <section className="relative py-24 sm:py-32 bg-[#00374a] text-white overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(0,175,219,0.2),transparent_60%)]" />
        <div className="relative max-w-[640px] mx-auto px-6 text-center">
          {soldOut ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#f47b20] px-3 py-1 rounded-full mb-6">Fully booked</span>
              <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] mb-5 leading-[1.05]">This trip is fully booked.<br />Want in next time?</h2>
              <p className="text-[17px] text-white/55 mb-9">Every spot is taken — but plans change and new weeks open up. Join the waitlist and we&apos;ll reach out the moment a place frees up.</p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link href={`mailto:experience@np-seven.com?subject=Waitlist: ${experience.title}`} className="px-8 py-4 rounded-full text-[14px] font-bold text-[#00374a] bg-white hover:-translate-y-0.5 transition-all">Join the waitlist</Link>
                <Link href={`mailto:experience@np-seven.com?subject=Question: ${experience.title}`} className="px-8 py-4 rounded-full text-[14px] font-bold text-white border-[1.5px] border-white/40 hover:bg-white/10 transition-all">Ask us anything</Link>
              </div>
            </>
          ) : (
            <>
              {typeof spotsLeft === "number" && spotsLeft > 0 && spotsLeft <= SCARCE_AT && (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#5fd0e8] bg-[#00afdb]/15 border border-[#00afdb]/30 px-3 py-1 rounded-full mb-6"><span className="w-1.5 h-1.5 rounded-full bg-[#5fd0e8] animate-pulse" />Only {spotsLeft} spots left</span>
              )}
              {/* A clinic is not a week away, and it has no deposit plan to
                  promise — it sells one seat. */}
              <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] mb-5 leading-[1.05]">
                {clinic ? <>Coaching that sticks.<br />Take your seat.</> : <>Your dream week is real.<br />Make it yours.</>}
              </h2>
              <p className="text-[17px] text-white/55 mb-9">{clinic ? "Pick the clinic that suits you, grab your seat, and we'll be in touch with everything you need before you fly." : hasDeposit ? `Reserve with a ${depositPretty} deposit — just your name and contact details. After payment, we'll reach out personally to sort every detail.` : "Reserve your spot in seconds — just your name and contact details, no payment yet. We'll then reach out personally to sort every detail."}</p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link href="#packages" data-track="reserve_cta" data-track-label="final" className="px-8 py-4 rounded-full text-[14px] font-bold text-[#00374a] bg-white hover:-translate-y-0.5 transition-all">{clinic ? "Get your spot" : hasDeposit ? `Reserve my spot · ${depositPretty}` : "Reserve my spot"}</Link>
                <Link href={`mailto:experience@np-seven.com?subject=Question: ${experience.title}`} className="px-8 py-4 rounded-full text-[14px] font-bold text-white border-[1.5px] border-white/40 hover:bg-white/10 transition-all">Ask us anything</Link>
              </div>
            </>
          )}
        </div>
      </section>

      <footer className="bg-[#00374a] text-white/40 border-t border-white/[0.06] py-8">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 flex items-center justify-between gap-4 text-[12px]">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="NP7 home">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={NP7_LOGO} alt="NP7" className="h-5 w-auto invert opacity-70" /></Link>
            <span className="whitespace-nowrap">© 2026 NP7 Experience</span>
          </div>
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-x-5 gap-y-2">
            <Link href="/widerruf" className="text-white/70 underline underline-offset-2 hover:text-white transition-colors">Withdraw from contract</Link>
            <Link href="/experience" className="hover:text-white transition-colors">← All experiences</Link>
          </div>
        </div>
      </footer>

      {team && (
        <div className="fixed bottom-4 left-4 z-[60] rounded-full bg-[#00374a] text-white/90 text-[11.5px] font-bold px-3.5 py-2 shadow-lg border border-white/15">
          Team preview — drafts included, the public may see less
        </div>
      )}
      <StickyCta title={experience.title} priceFrom={fromPrice ?? 0} spotsLeft={multi ? scarceLeft : (typeof spotsLeft === "number" && spotsLeft > 0 && spotsLeft <= SCARCE_AT ? spotsLeft : null)} target="#packages" soldOut={soldOut} />
    </SelectedEditionProvider>
  );
}
