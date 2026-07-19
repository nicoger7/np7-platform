import { supabase, createAdminClient } from "@/lib/supabase";
import { SUN_TO_SEA } from "@/components/shared/brand";
import { GalleryStrip } from "@/components/experience/gallery-strip";

/**
 * The DESTINATION deep-dive shown INSIDE the trip page's overlay — the rich,
 * selling content of /destinations/[slug] (intro, conditions, gallery, local
 * partners) without ever leaving the booking flow. Deliberately rendered
 * WITHOUT the page's Reveal/ParallaxHero/CountUp wrappers: their viewport
 * observers don't fire reliably inside the overlay's scroll container.
 * The trips grid is skipped on purpose (you're already on the trip).
 */

type Destination = {
  id: string; name: string; slug: string | null; region: string | null; country: string | null;
  hero_image: string | null; tagline: string | null; intro: string | null;
  wind_probability: string | null; wind_season: string | null; wind_speed: string | null;
  best_season: string | null; conditions: string | null; skill_levels: string | null;
  gallery: string[] | null; partners: { name?: string; description?: string; url?: string; image?: string }[] | null;
};
type Hotel = { id: string; name: string; image_url: string | null; images: string[] | null; description: string | null; website: string | null; location: string | null };

async function getData(slug: string): Promise<{ d: Destination; hotels: Hotel[] } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: d } = await sb.from("destinations").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!d) return null;

  // Same hotel auto-pull as the destination page: the hotels this destination's
  // trips actually use (package links + room assignments). Optional — never blocks.
  let hotels: Hotel[] = [];
  try {
    const { data: trips } = await sb.from("exp_experiences").select("id").eq("destination_id", d.id).eq("status", "published");
    const ids = ((trips ?? []) as { id: string }[]).map((t) => t.id);
    if (ids.length) {
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
  } catch { /* optional */ }

  return { d, hotels };
}

export async function DestinationDeepDive({ slug }: { slug: string }) {
  const res = await getData(slug).catch(() => null);
  if (!res) return null;
  const { d, hotels } = res;

  const place = [d.region, d.country].filter(Boolean).join(" · ");
  const hero = d.hero_image || (d.gallery?.[0] ?? "");
  const facts = [
    { label: "Wind probability", value: d.wind_probability },
    { label: "Wind season", value: d.wind_season },
    { label: "Wind strength", value: d.wind_speed },
    { label: "Best season", value: d.best_season },
    { label: "Conditions", value: d.conditions },
    { label: "Levels", value: d.skill_levels },
  ].filter((f): f is { label: string; value: string } => Boolean(f.value));
  const gallery = (d.gallery ?? []).filter(Boolean);
  const partners = (d.partners ?? []).filter((p) => p && p.name);

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

  const heroChips = [
    d.wind_probability && { label: "Wind", value: d.wind_probability },
    d.wind_speed && { label: "Strength", value: d.wind_speed },
    (d.wind_season || d.best_season) && { label: "Season", value: (d.wind_season || d.best_season) as string },
  ].filter(Boolean).slice(0, 3) as { label: string; value: string }[];

  return (
    <div>
      {/* HERO */}
      {hero && (
        <div className="relative h-64 sm:h-80 bg-cover bg-center">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${hero}')` }} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#001d27]/85 via-[#001d27]/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 px-6 sm:px-10 pb-6">
            {place && <p className="text-[11px] font-bold tracking-[0.22em] uppercase text-white/75 mb-1.5">{place}</p>}
            <h2 className="text-4xl sm:text-6xl font-black text-white leading-[0.98] tracking-[-0.04em] [text-shadow:0_2px_30px_rgba(0,0,0,0.3)]">{d.name}</h2>
            {d.tagline && <p className="text-[14.5px] sm:text-[16px] text-white/85 max-w-[560px] leading-relaxed mt-2">{d.tagline}</p>}
            {heroChips.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {heroChips.map((c) => (
                  <div key={c.label} className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 pl-3 pr-3.5 py-1.5">
                    <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-[#ffd66b]">{c.label}</span>
                    <span className="text-[12px] font-bold text-white">{c.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* INTRO — the editorial pitch */}
      {d.intro && (
        <div className="max-w-[760px] mx-auto px-6 sm:px-10 py-10 sm:py-14">
          <div className="flex items-center gap-3 mb-4">
            <span className="h-[3px] w-10 rounded-full" style={{ background: SUN_TO_SEA }} />
            <p className="text-[11px] font-bold tracking-[0.28em] text-[#f47b20]">THE DESTINATION</p>
          </div>
          <p className="text-[17px] sm:text-[20px] leading-[1.62] text-[#3a4a50] font-medium whitespace-pre-line [text-wrap:pretty]">{d.intro}</p>
        </div>
      )}

      {/* CONDITIONS — deep-ocean stats band */}
      {facts.length > 0 && (
        <div className="relative bg-[#00374a] text-white py-12 sm:py-16 overflow-hidden">
          {(gallery[1] || hero) && <div className="absolute inset-0 bg-cover bg-center opacity-[0.16]" style={{ backgroundImage: `url('${gallery[1] || hero}')` }} aria-hidden />}
          <div className="absolute inset-0 bg-gradient-to-b from-[#00374a]/85 via-[#00374a]/82 to-[#00374a]" aria-hidden />
          <div className="relative max-w-[900px] mx-auto px-6 sm:px-10">
            <div className="text-center mb-8">
              <p className="text-[11px] font-bold tracking-[0.28em] text-[#ffc42e] mb-2">WHAT TO EXPECT</p>
              <h3 className="text-2xl sm:text-4xl font-black tracking-[-0.03em]">The conditions</h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {facts.map((f) => (
                <div key={f.label} className="rounded-2xl bg-white/[0.06] border border-white/10 p-4 sm:p-5">
                  <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-white/50">{f.label}</p>
                  <p className="text-[17px] sm:text-[22px] font-black text-white mt-1 leading-tight">{f.value}</p>
                </div>
              ))}
            </div>
            <p className="mt-7 text-center text-[12.5px] text-white/60 max-w-[560px] mx-auto leading-relaxed">
              Wind is nature, not a promise — but {d.name} stacks the odds in your favour, and we plan every day around the forecast to chase the best of it together.
            </p>
          </div>
        </div>
      )}

      {/* GALLERY — the drifting filmstrip (pure CSS, overlay-safe) */}
      {gallery.length > 0 && (
        <div className="py-10 sm:py-12 overflow-hidden">
          <div className="text-center mb-7 px-6">
            <p className="text-[11px] font-bold tracking-[0.28em] text-[#00afdb] mb-2">THE VIBE</p>
            <h3 className="text-2xl sm:text-3xl font-black tracking-[-0.03em] text-[#00374a]">{d.name} in pictures</h3>
          </div>
          <GalleryStrip images={gallery} />
        </div>
      )}

      {/* LOCAL PARTNERS — where you stay + the spots on the ground */}
      {places.length > 0 && (
        <div className="px-6 sm:px-10 py-10 sm:py-12">
          <div className="text-center mb-8 max-w-[560px] mx-auto">
            <p className="text-[11px] font-bold tracking-[0.28em] text-[#f47b20] mb-2">ON THE GROUND</p>
            <h3 className="text-2xl sm:text-3xl font-black tracking-[-0.03em] text-[#00374a]">Local partners</h3>
            <p className="text-[14px] text-[#6a7a80] mt-2 leading-relaxed">Where you stay, where you ride, where you refuel.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {places.map((p) => (
              <div key={p.key} className="bg-white rounded-3xl overflow-hidden border border-[#f0e6d6]">
                <div className="relative h-[170px] overflow-hidden bg-[#00374a]">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-white font-black text-5xl" style={{ background: SUN_TO_SEA }} aria-hidden>{p.name?.trim()?.[0]?.toUpperCase() ?? "•"}</div>
                  )}
                  {p.tag && <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.08em] uppercase text-white shadow-sm" style={{ background: "#f47b20" }}>{p.tag}</span>}
                </div>
                <div className="p-4">
                  <h4 className="text-[16px] font-extrabold text-[#00374a] leading-tight">{p.name}</h4>
                  {p.sub && <p className="text-[11px] font-semibold tracking-wide uppercase text-[#8a9aa0] mt-0.5">{p.sub}</p>}
                  {p.description && <p className="text-[13px] text-[#6a7a80] leading-relaxed mt-1.5 line-clamp-3">{p.description}</p>}
                  {p.href && <a href={p.href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[12.5px] font-bold text-[#00afdb] hover:underline mt-2.5">{p.hrefLabel}</a>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* the full page stays reachable — in a NEW TAB, so the trip stays open */}
      {d.slug && (
        <p className="px-6 sm:px-10 pt-2 text-center text-[12.5px] text-[#9a8a6a]">
          Want the full destination page?{" "}
          <a href={`/destinations/${d.slug}`} target="_blank" rel="noopener" className="font-bold text-[#0a7f9e] hover:underline">Open it in a new tab ↗</a>
        </p>
      )}
    </div>
  );
}
