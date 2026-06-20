import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { OceanHeader, NP7_LOGO } from "@/components/experience/ocean-header";
import { Reveal } from "@/components/experience/reveal";
import { GalleryStrip } from "@/components/experience/gallery-strip";

export const revalidate = 60;

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

  // Hotels auto-pull: a destination's trips → their packages → linked hotels.
  // Reuses the hotel data the team already enters for packages (no re-entry).
  let hotels: Hotel[] = [];
  try {
    const ids = tripList.map((t) => t.id);
    if (ids.length) {
      const { data: pkgs } = await sb.from("exp_packages").select("hotel_id").in("experience_id", ids).not("hotel_id", "is", null);
      const hotelIds = [...new Set((pkgs ?? []).map((p: { hotel_id: string | null }) => p.hotel_id).filter(Boolean))];
      if (hotelIds.length) {
        const { data: h } = await sb.from("hotels").select("id,name,image_url,images,description,website,location").in("id", hotelIds);
        hotels = ((h ?? []) as Hotel[]).filter((x) => x.image_url || (x.images && x.images.length));
      }
    }
  } catch { /* hotels are optional — never block the page */ }

  return { destination, trips: tripList, hotels };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const res = await getDestination(slug).catch(() => null);
  if (!res) return { title: "Destination — NP7" };
  const d = res.destination;
  return { title: `${d.name} — NP7 Destinations`, description: d.tagline || d.intro || `Windsurf ${d.name}` };
}

export default async function DestinationPage({ params }: Props) {
  const { slug } = await params;
  const res = await getDestination(slug).catch(() => null);
  if (!res) notFound();
  const { destination: d, trips, hotels } = res;

  const place = [d.region, d.country].filter(Boolean).join(" · ");
  const hero = d.hero_image || (d.gallery?.[0] ?? "");
  const facts = [
    { label: "Wind probability", value: d.wind_probability },
    { label: "Wind season", value: d.wind_season },
    { label: "Wind strength", value: d.wind_speed },
    { label: "Best season", value: d.best_season },
    { label: "Conditions", value: d.conditions },
    { label: "Levels", value: d.skill_levels },
  ].filter((f) => f.value);
  const gallery = (d.gallery ?? []).filter(Boolean);
  const partners = (d.partners ?? []).filter((p) => p && p.name);

  return (
    <>
      <OceanHeader bookHref="#trips" />

      {/* HERO */}
      <section className="relative min-h-[70vh] flex items-end bg-[#00374a] overflow-hidden">
        {hero && <div className="absolute inset-0 bg-cover bg-center scale-105" style={{ backgroundImage: `url('${hero}')` }} />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#00374a] via-black/35 to-black/35" />
        <div className="relative w-full max-w-[1200px] mx-auto px-6 sm:px-8 pb-16 pt-32">
          <Reveal from="up">
            {place && <p className="text-[12px] font-bold tracking-[0.2em] uppercase text-white/75 mb-3">{place}</p>}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white leading-[0.98] tracking-[-0.035em] mb-4 max-w-[840px]">{d.name}</h1>
            {d.tagline && <p className="text-[17px] sm:text-[19px] text-white/80 max-w-[640px]">{d.tagline}</p>}
          </Reveal>
        </div>
      </section>

      {/* INTRO + FACTS */}
      {(d.intro || facts.length > 0) && (
        <section className="py-16 sm:py-24">
          <div className="max-w-[1100px] mx-auto px-6 sm:px-8 grid lg:grid-cols-[1.2fr_1fr] gap-10 lg:gap-16 items-start">
            {d.intro && (
              <Reveal from="left">
                <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">THE DESTINATION</p>
                <p className="text-[16px] sm:text-[17px] text-[#5a6b72] leading-relaxed whitespace-pre-line">{d.intro}</p>
              </Reveal>
            )}
            {facts.length > 0 && (
              <Reveal from="right">
                <div className="grid grid-cols-2 gap-3">
                  {facts.map((f) => (
                    <div key={f.label} className="bg-white rounded-2xl border border-[#ebeef0] p-4">
                      <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#00afdb]">{f.label}</p>
                      <p className="text-[14.5px] font-bold text-[#00374a] mt-1 leading-snug">{f.value}</p>
                    </div>
                  ))}
                </div>
              </Reveal>
            )}
          </div>
        </section>
      )}

      {/* GALLERY */}
      {gallery.length > 0 && (
        <section className="py-12 sm:py-16 overflow-hidden bg-[#f7f7f7]">
          <Reveal className="max-w-[1200px] mx-auto px-6 sm:px-8 mb-8 text-center">
            <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-[#00374a]">{d.name} in pictures</h2>
          </Reveal>
          <Reveal><GalleryStrip images={gallery} /></Reveal>
        </section>
      )}

      {/* TRIPS HERE */}
      <section id="trips" className="scroll-mt-16 py-16 sm:py-24">
        <div className="max-w-[1100px] mx-auto px-6 sm:px-8">
          <Reveal className="mb-10 text-center max-w-[600px] mx-auto">
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">CAMPS HERE</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a]">Trips to {d.name}</h2>
          </Reveal>
          {trips.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {trips.map((t) => (
                <Reveal key={t.id}>
                  <Link href={`/experience/${t.slug}`} className="group block rounded-3xl overflow-hidden border border-[#ebebeb] bg-white hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(0,55,74,0.1)] transition-all">
                    <div className="h-[180px] bg-cover bg-center bg-[#00374a]" style={{ backgroundImage: t.hero_image ? `url('${t.hero_image}')` : undefined }} />
                    <div className="p-5">
                      <h3 className="text-lg font-extrabold text-[#00374a] group-hover:text-[#00afdb] transition-colors">{t.title}</h3>
                      {t.location && <p className="text-[13px] text-[#8a9aa0] mt-1">{t.location}</p>}
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#00afdb] mt-3 group-hover:gap-2.5 transition-all">View the camp
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </span>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          ) : (
            <p className="text-center text-[#6a7a80]">New camps for {d.name} are coming soon.</p>
          )}
        </div>
      </section>

      {/* WHERE YOU STAY — auto-pulled from the hotels linked to this destination's trips */}
      {hotels.length > 0 && (
        <section className="py-16 sm:py-20 bg-[#f7f7f7]">
          <div className="max-w-[1100px] mx-auto px-6 sm:px-8">
            <Reveal className="mb-10 text-center max-w-[600px] mx-auto">
              <p className="text-[11px] font-bold tracking-[0.25em] text-[#00afdb] mb-3">YOUR BASE</p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a]">Where you stay</h2>
            </Reveal>
            <div className={`grid gap-5 ${hotels.length === 1 ? "sm:grid-cols-1 max-w-[680px] mx-auto" : "sm:grid-cols-2"}`}>
              {hotels.map((h) => {
                const img = h.image_url || h.images?.[0] || "";
                return (
                  <Reveal key={h.id}>
                    <div className="bg-white rounded-3xl overflow-hidden border border-[#ebebeb] h-full">
                      {img && <div className="h-[220px] bg-cover bg-center bg-[#00374a]" style={{ backgroundImage: `url('${img}')` }} />}
                      <div className="p-5">
                        <h3 className="text-lg font-extrabold text-[#00374a]">{h.name}</h3>
                        {h.location && <p className="text-[12px] font-semibold tracking-wide uppercase text-[#8a9aa0] mt-0.5">{h.location}</p>}
                        {h.description && <p className="text-[13.5px] text-[#6a7a80] leading-relaxed mt-2">{h.description}</p>}
                        {h.website && <a href={h.website} target="_blank" rel="noopener" className="inline-block text-[13px] font-bold text-[#00afdb] hover:underline mt-3">Visit hotel ↗</a>}
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* PARTNERS */}
      {partners.length > 0 && (
        <section className="py-16 sm:py-20 bg-[#fff7ec]">
          <div className="max-w-[1000px] mx-auto px-6 sm:px-8">
            <Reveal className="mb-8 text-center"><h2 className="text-2xl sm:text-3xl font-black tracking-[-0.03em] text-[#00374a]">Local partners</h2></Reveal>
            <div className="grid sm:grid-cols-2 gap-4">
              {partners.map((p, i) => (
                <Reveal key={i}>
                  <div className="bg-white rounded-2xl border border-[#f0e6d6] p-5 flex items-start gap-4">
                    {p.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt={p.name} className="w-16 h-16 rounded-xl object-cover shrink-0 border border-[#f0e6d6]" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold text-[#00374a]">{p.name}</p>
                      {p.description && <p className="text-[13.5px] text-[#6a7a80] leading-relaxed mt-1">{p.description}</p>}
                      {p.url && <a href={p.url} target="_blank" rel="noopener" className="inline-block text-[13px] font-semibold text-[#00afdb] hover:underline mt-2">Visit ↗</a>}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="bg-[#00374a] text-white/40 border-t border-white/[0.06] py-8">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 flex items-center justify-between gap-4 text-[12px]">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="NP7 home">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={NP7_LOGO} alt="NP7" className="h-5 w-auto invert opacity-70" /></Link>
            <span>© 2026 NP7 Experience</span>
          </div>
          <Link href="/experience" className="hover:text-white transition-colors">All experiences →</Link>
        </div>
      </footer>
    </>
  );
}
