import Link from "next/link";
import { destinationWindFacts, type WindStats } from "@/lib/wind-stats";
import { WindStatsChart } from "@/components/spotguide/wind-stats-chart";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabase, createAdminClient } from "@/lib/supabase";
import { flags } from "@/lib/flags";
import { OceanHeader } from "@/components/experience/ocean-header";
import { NP7_EXPERIENCE_LOGO, SUN_TO_SEA } from "@/components/shared/brand";
import { Reveal } from "@/components/experience/reveal";
import { GalleryStrip } from "@/components/experience/gallery-strip";
import { ParallaxHero } from "@/components/experience/parallax-hero";
import { SectionNav, type NavSection } from "@/components/experience/section-nav";
import { CountUp } from "@/components/experience/count-up";
import { DestinationCta } from "@/components/experience/destination-cta";
import { WaveDivider } from "@/components/experience/wave-divider";

export const revalidate = 3600;

/** Minimal inline icon set for the conditions band, keyed by stat label. */
function StatIcon({ label, className = "w-5 h-5" }: { label: string; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (/probab/i.test(label)) return <svg {...common}><path d="M12 3v9l6 3" /><circle cx="12" cy="12" r="9" /></svg>;
  if (/season/i.test(label)) return <svg {...common}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>;
  if (/strength|speed|wind/i.test(label)) return <svg {...common}><path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h9a2.5 2.5 0 1 1-2.5 2.5" /></svg>;
  if (/condition/i.test(label)) return <svg {...common}><path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0" /></svg>;
  if (/level/i.test(label)) return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-8M22 20" /><path d="M22 20v-5" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /></svg>;
}

type Props = { params: Promise<{ slug: string }> };

type Destination = {
  id: string; name: string; slug: string | null; region: string | null; country: string | null;
  hero_image: string | null; tagline: string | null; intro: string | null;
  wind_probability: string | null; wind_season: string | null; wind_speed: string | null;
  best_season: string | null; conditions: string | null; skill_levels: string | null;
  gallery: string[] | null; partners: { name?: string; description?: string; url?: string; image?: string }[] | null;
};
type Trip = { id: string; title: string; slug: string; hero_image: string | null; location: string | null };
type Hotel = { id: string; name: string; image_url: string | null; images: string[] | null; description: string | null; website: string | null; location: string | null };

async function getDestination(slug: string): Promise<{ destination: Destination; trips: Trip[]; hotels: Hotel[] } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: destination } = await sb.from("destinations").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!destination) return null;
  const { data: trips } = await sb
    .from("exp_experiences")
    .select("id,title,slug,hero_image,location")
    .eq("destination_id", destination.id)
    .eq("status", "published");
  const tripList = (trips ?? []) as Trip[];

  // Hotels auto-pull: the hotels a destination's trips actually use — linked
  // either on a package (hotel_id) OR via the trips' room assignments
  // (exp_hotel_rooms.hotel → hotels.name). Reuses what the team already enters
  // in Admin → Hotels; only hotels with a photo surface (self-curating).
  let hotels: Hotel[] = [];
  try {
    const ids = tripList.map((t) => t.id);
    if (ids.length) {
      // exp_hotel_rooms / exp_packages are team-only (RLS), so read them with the
      // service-role client on the server — same pattern as availability counts.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = createAdminClient() as any;
      const [{ data: pkgs }, { data: rooms }] = await Promise.all([
        admin.from("exp_packages").select("hotel_id").in("experience_id", ids).not("hotel_id", "is", null),
        admin.from("exp_hotel_rooms").select("hotel").in("experience_id", ids),
      ]);
      const hotelIds = [...new Set((pkgs ?? []).map((p: { hotel_id: string | null }) => p.hotel_id).filter(Boolean))];
      const hotelNames = [...new Set((rooms ?? []).map((r: { hotel: string | null }) => r.hotel).filter(Boolean))];
      const cols = "id,name,image_url,images,description,website,location";
      const queries = [];
      if (hotelIds.length) queries.push(sb.from("hotels").select(cols).in("id", hotelIds));
      if (hotelNames.length) queries.push(sb.from("hotels").select(cols).in("name", hotelNames));
      const merged = new Map<string, Hotel>();
      for (const r of await Promise.all(queries)) for (const h of ((r.data ?? []) as Hotel[])) merged.set(h.id, h);
      hotels = [...merged.values()].filter((x) => x.image_url || (x.images && x.images.length));
    }
  } catch { /* hotels are optional — never block the page */ }

  return { destination, trips: tripList, hotels };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // The layout 404s this whole segment until SHOW_EXPERIENCE is on — but a layout
  // short-circuits AFTER metadata and the page body have already run, so every
  // crawler hit on a dead /destinations/… URL was paying a full render (measured:
  // 42 kB of Bonaire markup behind an HTTP 404). Bail before touching the DB.
  if (!flags.showExperience) return { title: "Destination — NP7" };
  const { slug } = await params;
  const res = await getDestination(slug).catch(() => null);
  if (!res) return { title: "Destination — NP7" };
  const d = res.destination;
  return { title: `${d.name} — NP7 Destinations`, description: d.tagline || d.intro || `Windsurf ${d.name}` };
}

export default async function DestinationPage({ params }: Props) {
  // Same guard as generateMetadata above — 404 before any query or render work.
  if (!flags.showExperience) notFound();
  const { slug } = await params;
  const res = await getDestination(slug).catch(() => null);
  if (!res) notFound();
  const { destination: d, trips, hotels } = res;

  const place = [d.region, d.country].filter(Boolean).join(" · ");
  const hero = d.hero_image || (d.gallery?.[0] ?? "");
  // Measured wind beats asserted wind: where ERA5 climatology exists the
  // headline facts are DERIVED (peak months, mean 4+Bft share, avg speed) —
  // hand-typed strings are how Bonaire read "12–25 knots" on one page and
  // "10–20" on another. Manual fields stay as the fallback for the seven
  // destinations that still have no coordinates.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const windStats = ((d as any).wind_stats ?? null) as WindStats | null;
  const derived = destinationWindFacts(windStats);
  const seasonManual = d.wind_season || d.best_season;
  const facts = [
    { label: "Wind probability", value: derived ? `${derived.probability} at 4+ Bft` : d.wind_probability },
    { label: "Wind season", value: derived?.season ?? seasonManual },
    { label: "Wind strength", value: derived ? derived.speed : d.wind_speed },
    // two cards, one fact: only show a separate "best season" when it actually
    // differs from the wind season (hand-typed rows often duplicated it)
    { label: "Best season", value: derived ? null : (d.best_season && d.best_season !== d.wind_season ? d.best_season : null) },
    { label: "Conditions", value: d.conditions },
    { label: "Levels", value: d.skill_levels },
  ].filter((f): f is { label: string; value: string } => Boolean(f.value));
  const gallery = (d.gallery ?? []).filter(Boolean);
  const partners = (d.partners ?? []).filter((p) => p && p.name);
  // a faint photographic backdrop behind the deep-ocean conditions band
  const condBg = gallery[1] || gallery[0] || hero;

  // "Local partners" = where you stay (hotels, auto-pulled) + the other local
  // spots (surf station, restaurant…), shown together as one richer grid.
  type Place = { key: string; image: string; name: string; sub?: string; description?: string; href?: string; hrefLabel?: string; tag?: string };
  const places: Place[] = [
    ...hotels.map((h): Place => ({
      key: `h-${h.id}`, image: h.image_url || h.images?.[0] || "", name: h.name,
      sub: h.location ?? undefined, description: h.description ?? undefined,
      href: h.website ?? undefined, hrefLabel: "Visit hotel ↗", tag: "Where you stay",
    })),
    ...partners.map((p, i): Place => ({
      key: `p-${i}`, image: p.image ?? "", name: p.name!,
      description: p.description, href: p.url, hrefLabel: "Visit ↗",
    })),
  ];

  // Three concise quick-stats floated over the hero
  const heroChips = [
    (derived?.probability && { label: "Wind", value: `${derived.probability} 4+ Bft` }) || (d.wind_probability && { label: "Wind", value: d.wind_probability }),
    (derived?.speed && { label: "Strength", value: derived.speed }) || (d.wind_speed && { label: "Strength", value: d.wind_speed }),
    (derived?.season && { label: "Season", value: derived.season }) || ((d.wind_season || d.best_season) && { label: "Season", value: (d.wind_season || d.best_season) as string }),
  ].filter(Boolean).slice(0, 3) as { label: string; value: string }[];

  const navSections = [
    d.intro && { id: "overview", label: "Overview" },
    facts.length > 0 && { id: "conditions", label: "Conditions" },
    gallery.length > 0 && { id: "gallery", label: "Gallery" },
    { id: "trips", label: "Trips" },
    places.length > 0 && { id: "partners", label: "Local partners" },
  ].filter(Boolean) as NavSection[];

  return (
    <>
      <OceanHeader bookHref="#trips" />

      {/* HERO — cinematic parallax photo with Ken Burns + quick-stats */}
      <ParallaxHero image={hero}>
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 pb-20 sm:pb-24">
          <Reveal from="up">
            {place && <p className="text-[12px] font-bold tracking-[0.22em] uppercase text-white/75 mb-3">{place}</p>}
            <h1 className="text-5xl sm:text-7xl lg:text-[5.5rem] font-black text-white leading-[0.95] tracking-[-0.04em] mb-4 max-w-[900px] [text-shadow:0_2px_30px_rgba(0,0,0,0.3)]">{d.name}</h1>
            {d.tagline && <p className="text-[17px] sm:text-[20px] text-white/85 max-w-[640px] leading-relaxed">{d.tagline}</p>}
          </Reveal>
          {heroChips.length > 0 && (
            <Reveal from="up" delay={160} className="mt-7 flex flex-wrap gap-2.5">
              {heroChips.map((c) => (
                <div key={c.label} className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 pl-3.5 pr-4 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#ffd66b]">{c.label}</span>
                  <span className="text-[13px] font-bold text-white">{c.value}</span>
                </div>
              ))}
            </Reveal>
          )}
        </div>
      </ParallaxHero>

      <SectionNav sections={navSections} topClass="top-16" action={{ label: "See the trips", href: "#trips" }} />

      {/* OVERVIEW — editorial intro */}
      {d.intro && (
        <section id="overview" className="scroll-mt-[120px] py-20 sm:py-28">
          <div className="max-w-[820px] mx-auto px-6 sm:px-8">
            <Reveal>
              <div className="flex items-center gap-3 mb-5">
                <span className="h-[3px] w-10 rounded-full" style={{ background: SUN_TO_SEA }} />
                <p className="text-[11px] font-bold tracking-[0.28em] text-[#f47b20]">THE DESTINATION</p>
              </div>
              <p className="text-[19px] sm:text-[23px] leading-[1.62] text-[#3a4a50] font-medium whitespace-pre-line [text-wrap:pretty]">{d.intro}</p>
            </Reveal>
          </div>
        </section>
      )}

      {/* CONDITIONS — animated count-up band on deep ocean */}
      {facts.length > 0 && (
        <>
          <section id="conditions" className="scroll-mt-[120px] relative bg-[#00374a] text-white py-20 sm:py-28 overflow-hidden">
            {condBg && <div className="absolute inset-0 bg-cover bg-center opacity-[0.18]" style={{ backgroundImage: `url('${condBg}')` }} aria-hidden />}
            <div className="absolute inset-0 bg-gradient-to-b from-[#00374a]/85 via-[#00374a]/82 to-[#00374a]" aria-hidden />
            <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full opacity-25 blur-[120px]" style={{ background: "radial-gradient(circle,#f47b20,transparent 70%)" }} aria-hidden />
            <div className="relative max-w-[1100px] mx-auto px-6 sm:px-8">
              <Reveal className="text-center mb-12 max-w-[620px] mx-auto">
                <p className="text-[11px] font-bold tracking-[0.28em] text-[#ffc42e] mb-3">WHAT TO EXPECT</p>
                <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em]">The conditions</h2>
                <div className="h-[3px] w-14 rounded-full mx-auto mt-5" style={{ background: SUN_TO_SEA }} />
              </Reveal>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {facts.map((f, i) => (
                  <Reveal key={f.label} delay={i * 60}>
                    <div className="h-full rounded-2xl bg-white/[0.06] border border-white/10 p-5 sm:p-6 hover:bg-white/[0.1] hover:-translate-y-0.5 transition-all">
                      <div className="w-10 h-10 rounded-xl bg-[#f47b20]/20 text-[#ffb766] grid place-items-center mb-4"><StatIcon label={f.label} /></div>
                      <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-white/50">{f.label}</p>
                      <p className="text-[20px] sm:text-[26px] font-black text-white mt-1.5 leading-tight"><CountUp value={f.value} /></p>
                    </div>
                  </Reveal>
                ))}
              </div>
              {windStats && (
                <Reveal className="mt-10">
                  {/* the month-by-month climatology behind the headline numbers —
                      same measured chart the spotguide shows, general overview
                      here rather than a trip's three-month frame */}
                  <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-5 sm:p-6 overflow-x-auto">
                    <WindStatsChart stats={windStats} accent="#ffc42e" />
                  </div>
                </Reveal>
              )}
              <Reveal className="mt-9 text-center">
                <p className="inline-flex items-start gap-2 text-[13.5px] text-white/60 max-w-[600px] mx-auto leading-relaxed">
                  <svg className="w-4 h-4 mt-0.5 shrink-0 text-[#ffc42e]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
                  <span>Wind is nature, not a promise — we can&apos;t guarantee it. But {d.name} stacks the odds in your favour, and we plan every day around the forecast to chase the best of it together.</span>
                </p>
              </Reveal>
            </div>
          </section>
          <WaveDivider topColor="#00374a" flip />
        </>
      )}

      {/* GALLERY */}
      {gallery.length > 0 && (
        <section id="gallery" className="scroll-mt-[120px] py-16 sm:py-20 overflow-hidden bg-[#f7f7f7]">
          <Reveal className="max-w-[1200px] mx-auto px-6 sm:px-8 mb-10 text-center">
            <p className="text-[11px] font-bold tracking-[0.28em] text-[#00afdb] mb-3">THE VIBE</p>
            <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">{d.name} in pictures</h2>
          </Reveal>
          <Reveal><GalleryStrip images={gallery} /></Reveal>
        </section>
      )}

      {/* TRIPS */}
      <section id="trips" className="scroll-mt-[120px] py-20 sm:py-28">
        <div className="max-w-[1180px] mx-auto px-6 sm:px-8">
          <Reveal className="mb-12 text-center max-w-[620px] mx-auto">
            <p className="text-[11px] font-bold tracking-[0.28em] text-[#f47b20] mb-3">TRIPS HERE</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a]">Trips to {d.name}</h2>
            <div className="h-[3px] w-14 rounded-full mx-auto mt-5" style={{ background: SUN_TO_SEA }} />
          </Reveal>
          {trips.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {trips.map((t, i) => (
                <Reveal key={t.id} delay={i * 70}>
                  <Link href={`/experience/${t.slug}`} className="group relative block rounded-3xl overflow-hidden aspect-[4/5] bg-[#00374a] shadow-[0_10px_30px_rgba(0,55,74,0.08)] hover:shadow-[0_22px_50px_rgba(0,55,74,0.18)] transition-shadow">
                    <div className="absolute inset-0 bg-cover bg-center transition-transform duration-[1.1s] ease-out group-hover:scale-110" style={{ backgroundImage: t.hero_image ? `url('${t.hero_image}')` : undefined }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-6">
                      <h3 className="text-[22px] font-extrabold text-white leading-tight [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]">{t.title}</h3>
                      {t.location && <p className="text-[13px] text-white/75 mt-1">{t.location}</p>}
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#5fd0e8] mt-3 group-hover:gap-2.5 transition-all">View the trip
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </span>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          ) : (
            <p className="text-center text-[#6a7a80]">New trips for {d.name} are coming soon.</p>
          )}
        </div>
      </section>

      {/* LOCAL PARTNERS — where you stay (hotels, auto-pulled) + the other local spots, together */}
      {places.length > 0 && (
        <section id="partners" className="scroll-mt-[120px] py-20 sm:py-24 bg-[#fff7ec]">
          <div className="max-w-[1180px] mx-auto px-6 sm:px-8">
            <Reveal className="mb-12 text-center max-w-[640px] mx-auto">
              <p className="text-[11px] font-bold tracking-[0.28em] text-[#f47b20] mb-3">ON THE GROUND</p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">Local partners</h2>
              <p className="text-[15px] text-[#6a7a80] mt-3 leading-relaxed">The spots you&apos;ll actually be at — where you stay, where you ride, where you refuel.</p>
              <div className="h-[3px] w-14 rounded-full mx-auto mt-5" style={{ background: SUN_TO_SEA }} />
            </Reveal>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {places.map((place, i) => (
                <Reveal key={place.key} delay={i * 70}>
                  <div className="group bg-white rounded-3xl overflow-hidden border border-[#f0e6d6] h-full hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(244,123,32,0.16)] transition-all">
                    <div className="relative h-[200px] overflow-hidden bg-[#00374a]">
                      {place.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={place.image} alt={place.name} className="w-full h-full object-cover transition-transform duration-[1.1s] ease-out group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-white font-black text-5xl" style={{ background: SUN_TO_SEA }} aria-hidden>{place.name?.trim()?.[0]?.toUpperCase() ?? "•"}</div>
                      )}
                      {place.tag && <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.08em] uppercase text-white shadow-sm" style={{ background: "#f47b20" }}>{place.tag}</span>}
                    </div>
                    <div className="p-5">
                      <h3 className="text-[17px] font-extrabold text-[#00374a] leading-tight">{place.name}</h3>
                      {place.sub && <p className="text-[12px] font-semibold tracking-wide uppercase text-[#8a9aa0] mt-0.5">{place.sub}</p>}
                      {place.description && <p className="text-[13.5px] text-[#6a7a80] leading-relaxed mt-1.5">{place.description}</p>}
                      {place.href && <a href={place.href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[13px] font-bold text-[#00afdb] hover:underline mt-3">{place.hrefLabel}</a>}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <WaveDivider topColor="#00374a" />
      <footer className="bg-[#00374a] text-white/40 py-10">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 flex items-center justify-between gap-4 text-[12px]">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="NP7 Experience home">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={NP7_EXPERIENCE_LOGO} alt="NP7 Experience" className="h-7 w-auto opacity-90" /></Link>
            <span>© 2026 NP7 Experience</span>
          </div>
          <Link href="/experience" className="hover:text-white transition-colors">All experiences →</Link>
        </div>
      </footer>

      <DestinationCta name={d.name} tripCount={trips.length} />
    </>
  );
}
