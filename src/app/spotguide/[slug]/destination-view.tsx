import Link from "next/link";
import { notFound } from "next/navigation";
import { getSpotguideDestination } from "@/lib/spotguide-data";
import { satImage } from "@/lib/satellite";
import { levelRangeLabel, DESTINATION_CRITERIA } from "@/lib/spotguide";
import { resolveSection, SECTION_CHROME } from "@/lib/blog-section";
import { SectionHeader } from "@/components/shared/section-header";
import { BlogFooter } from "@/components/blog/blog-footer";
import { RatingHeadline, RatingBreakdown } from "@/components/spotguide/rating-panel";
import { SpotsList } from "@/components/spotguide/spots-list";
import { SpotguideProvider } from "@/components/spotguide/spotguide-provider";
import { DestinationRater } from "@/components/spotguide/raters";
import { MeteredContent } from "@/components/spotguide/metered-content";
import { AddSpot } from "@/components/spotguide/add-spot";
import { VerifySpots } from "@/components/spotguide/verify-spots";
import { VerifyEdits } from "@/components/spotguide/verify-edits";
import { VerifyDestination } from "@/components/spotguide/verify-destination";
import { SpotMap } from "@/components/spotguide/spot-map";
import { HeroVideo } from "@/components/experience/hero-video";
import { flags } from "@/lib/flags";

/**
 * The destination page's whole render, shared by the two routes that reach it:
 *
 *   /spotguide/[slug]           published areas — prerendered + CDN-cached,
 *                               so it renders with NO idea who is reading
 *   /spotguide/proposed/[slug]  rider-proposed DRAFT areas — members-only, and
 *                               force-dynamic because it resolves the viewer
 *
 * Splitting them is not cosmetic: a route with generateStaticParams renders an
 * unlisted param through the STATIC path, where touching cookies() is a hard
 * runtime error ("Page changed from static to dynamic"). Drafts therefore need a
 * route that was never static to begin with.
 */
export async function DestinationView({
  slug, viewerId, isTeam, from, sectionCookie,
}: {
  slug: string;
  /** null on the cached route — it cannot know, and must not try */
  viewerId: string | null;
  isTeam: boolean;
  from?: string;
  sectionCookie?: string;
}) {
  const d = await getSpotguideDestination(slug, viewerId, isTeam);
  if (!d) notFound();

  // Only ever true on the dynamic draft branch; on a cached page the client
  // provider resolves the real state on mount (it already overwrote this).
  const loggedIn = !!viewerId;
  // `?from=` and the section cookie are request APIs — read them only when
  // Hardware is live and there are actually two worlds to switch between,
  // exactly as /spotguide and /blog do.
  // Resolve the world the SAME way the index + magazine do: only follow the
  // hardware cookie when Hardware is live, and let an explicit ?from= (carried by
  // the nav + the back link) win, so the spotguide never flips worlds mid-browse.
  const section = flags.showHardware ? resolveSection(from ?? sectionCookie) : "experience";
  const chrome = SECTION_CHROME[section];
  const lvl = levelRangeLabel(d.level_min, d.level_max);

  // There's ALWAYS a hero image — as the video's poster (slow/failed load) and
  // as the hero itself when there's no video. Fall back through the destination
  // image → any spot's image/photo → a real SATELLITE view of the area (beats a
  // generic poster for a place with no photos yet) → a high-quality default, so
  // the header never renders bare. (Nico: a fallback image, always — and no more
  // low-res video screenshot.)
  const heroPoster =
    d.hero_image ||
    d.spots.map((s) => s.hero_image).find(Boolean) ||
    d.spots.flatMap((s) => s.photos ?? []).map((p) => p.url).find(Boolean) ||
    (d.lat != null && d.lng != null ? satImage(d.lat, d.lng) : null) ||
    "https://media.np-seven.com/experiences/np7-bonaire/place/bonaire-spot-overview-drone-shot.jpg";

  // Paywall structured data — tells Google the gated section is intentionally
  // members-only (NOT cloaking), so the in-DOM content still indexes.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${d.name} windsurf spotguide`,
    ...(d.tagline ? { description: d.tagline } : {}),
    isAccessibleForFree: loggedIn,
    ...(loggedIn ? {} : { hasPart: { "@type": "WebPageElement", isAccessibleForFree: false, cssSelector: ".sg-gated" } }),
  };

  return (
    <>
      <SectionHeader section={section} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="bg-[#fff7ec] min-h-[100svh]">
        {/* hero */}
        <header className="relative overflow-hidden flex flex-col min-h-[360px] sm:min-h-[460px]" style={{ background: chrome.heroBackground }}>
          <div className="h-1 relative z-20" style={{ background: chrome.stripe }} />
          {/* The fallback image ALWAYS renders underneath (slow connection / no
              video / video fails); a YouTube segment (migration 073) layers over
              it when set. A brand colour-fade — darker toward the bottom — keeps
              the header text readable while letting the photo/video show. */}
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${heroPoster}')` }} />
          {d.hero_video_url && (
            <div className="absolute inset-0">
              <HeroVideo url={d.hero_video_url} start={d.hero_video_start} end={d.hero_video_end} poster={heroPoster} />
            </div>
          )}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,36,48,0.42) 0%, rgba(0,36,48,0.18) 45%, rgba(0,36,48,0.80) 100%)" }} />
          {heroPoster.includes("/api/sat") && <span className="absolute bottom-1 right-2 z-20 text-[9px] font-medium text-white/55">Imagery © Esri</span>}
          <div className="relative z-10 mt-auto w-full max-w-[1000px] mx-auto px-6 sm:px-8 pt-12 pb-11 sm:pt-16 sm:pb-14">
            <Link href={`/spotguide?from=${section}`} className="text-[12px] font-bold text-white/70 hover:text-white transition-colors">← Spotguide</Link>
            {d.status === "draft" && (
              <span className="block mt-3"><span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0a500]/90 text-[#3a2a00] text-[11px] font-black uppercase tracking-[0.12em] px-3 py-1">Proposed area · members only · {d.verify?.confirms ?? 0}/3 confirms</span></span>
            )}
            <h1 className="text-white text-4xl sm:text-6xl font-black tracking-[-0.03em] mt-3">{d.name}</h1>
            <p className="text-white/75 text-[15px] font-semibold mt-2">{[d.region, d.country].filter(Boolean).join(", ")}{lvl ? `  ·  ${lvl}` : ""}</p>
            {d.tagline && <p className="text-white/80 text-[17px] mt-4 max-w-[620px] leading-relaxed">{d.tagline}</p>}
            <div className="mt-5 inline-flex rounded-xl bg-white/10 backdrop-blur px-4 py-3"><RatingHeadline np7={d.np7} member={d.member} accent={chrome.eyebrow} /></div>
          </div>
        </header>

        <SpotguideProvider destId={d.id} initialLoggedIn={loggedIn}>
          <div className="max-w-[1000px] mx-auto px-6 sm:px-8 py-10 sm:py-14 space-y-10">
            {d.intro && <p className="text-[16.5px] text-[#3f5158] leading-relaxed max-w-[680px] whitespace-pre-line">{d.intro}</p>}

            {/* Destination photo strip — its own gallery, or (when empty) the
                photos from its spots, so a destination is never photo-bare. */}
            {(() => {
              const spotShots = [
                ...d.spots.map((s) => s.hero_image).filter(Boolean),
                ...d.spots.flatMap((s) => (s.photos ?? []).map((p) => p.url)),
              ] as string[];
              const photos = Array.from(new Set((d.gallery.length ? d.gallery : spotShots).filter(Boolean)))
                .filter((u) => u !== heroPoster).slice(0, 12);
              if (photos.length === 0) return null;
              return (
                <section className="-mx-6 sm:-mx-8 px-6 sm:px-8">
                  <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {photos.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={url} src={url} alt={`${d.name} windsurfing`} loading="lazy"
                        className="h-40 sm:h-52 w-auto shrink-0 rounded-xl object-cover border border-[#ece3d3]" />
                    ))}
                  </div>
                  {d.gallery.length === 0 && <p className="text-[11.5px] text-[#b3a994] mt-2">Photos from this destination&apos;s spots.</p>}
                </section>
              );
            })()}

            {/* The destination, rated */}
            <section>
              <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac] mb-3">The destination</h2>
              <div className="space-y-3">
                {(d.np7 > 0 || d.member.count > 0) && (
                  <div className="rounded-2xl border border-[#ece3d3] bg-white p-5">
                    <RatingBreakdown criteria={DESTINATION_CRITERIA} np7Ratings={d.np7_ratings} member={d.member} />
                  </div>
                )}
                <DestinationRater criteria={DESTINATION_CRITERIA} accent={chrome.accent} defaults={d.np7_ratings} />
              </div>
            </section>

            {/* Ride it with NP7 — where a trip exists for this destination */}
            {flags.showExperience && d.trips.length > 0 && (
              <section>
                <div className="rounded-2xl overflow-hidden text-white" style={{ background: "linear-gradient(135deg,#f47b20,#00afdb)" }}>
                  <div className="p-6 sm:p-7">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/80">Ride it with us</p>
                    <h3 className="text-2xl font-black tracking-[-0.02em] mt-1">Sail {d.name} on an NP7 trip</h3>
                    <p className="text-white/85 text-[14px] mt-1.5 max-w-[560px]">Guided by Nico Prien (GER-7) and the crew — coaching, the best spots, and everything handled.</p>
                    <div className="flex flex-wrap gap-2.5 mt-4">
                      {d.trips.map((t) => (
                        <Link key={t.id} href={`/experience/${t.slug}`} className="inline-flex items-center gap-1.5 bg-white text-[#00374a] font-bold text-[13.5px] rounded-full px-4 py-2.5 hover:-translate-y-0.5 transition-transform">
                          {t.title}
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Topic cluster: magazine stories that mention this destination */}
            {d.articles.length > 0 && (
              <section>
                <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac] mb-3">Stories about {d.name}</h2>
                <div className="grid sm:grid-cols-3 gap-4">
                  {d.articles.map((a) => (
                    <Link key={a.slug} href={`/blog/${a.slug}`}
                      className="group flex flex-col rounded-2xl overflow-hidden bg-white border border-[#f0e6d6] hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(0,55,74,0.10)] transition-all">
                      {a.cover_image && <div className="aspect-video bg-cover bg-center" style={{ backgroundImage: `url('${a.cover_image}')` }} />}
                      <div className="p-4">
                        {a.category && <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#b0791e]">{a.category}</p>}
                        <p className="text-[14.5px] font-extrabold text-[#00374a] leading-snug mt-0.5 group-hover:underline">{a.title}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* The spots — metered for anonymous visitors, full for members */}
            <section>
              <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac] mb-3">The spots <span className="text-[#c3b9a6]">({d.spots.length})</span></h2>
              {d.spots.length === 0 ? (
                <p className="text-[14px] text-[#6a7a80]">Spots for {d.name} are coming soon.</p>
              ) : (
                <>
                  {(() => {
                    const pts = d.spots.filter((s) => s.lat != null && s.lng != null)
                      .map((s) => {
                        // Each pin carries the spot's OWN rating (NP7's if set,
                        // else the member average) — same rule as the index map.
                        const spotRating = s.np7 > 0 ? s.np7 : s.member.overall;
                        return {
                          lat: s.lat as number, lng: s.lng as number, name: s.name, destSlug: d.slug ?? "", verification: s.verification,
                          ...(spotRating > 0 ? { spotRating, spotRatingKind: (s.np7 > 0 ? "np7" : "member") as "np7" | "member", spotRatingCount: s.member.count } : {}),
                        };
                      });
                    return pts.length > 0 ? <div className="mb-5"><SpotMap spots={pts} cluster height={340} /></div> : null;
                  })()}
                  <MeteredContent accent={chrome.accent} spotCount={d.spots.length} destName={d.name}>
                    <SpotsList spots={d.spots} accent={chrome.accent} />
                  </MeteredContent>
                </>
              )}
            </section>

            {/* Community: verify pending member spots + corrections, then add your own */}
            <VerifySpots destId={d.id} accent={chrome.accent} />
            <VerifyEdits destId={d.id} accent={chrome.accent} />
            <section>
              <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac] mb-3">Contribute</h2>
              <AddSpot destId={d.id} destName={d.name} accent={chrome.accent} />
            </section>
            {/* Rider-proposed area: the verification ladder sits at the very bottom —
                3 confirms (or a verified first spot, or NP7) make the area official. */}
            {d.status === "draft" && d.verify && (
              <VerifyDestination destId={d.id} name={d.name} initial={d.verify} isOwn={d.submitted_by === viewerId} accent={chrome.accent} />
            )}
          </div>
        </SpotguideProvider>
      </main>
      <BlogFooter section={section} showExperience={flags.showExperience} showHardware={flags.showHardware} />
    </>
  );
}
