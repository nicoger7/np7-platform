import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getSpotguideDestination } from "@/lib/spotguide-data";
import { getPortalUser } from "@/lib/auth";
import { levelRangeLabel, DESTINATION_CRITERIA } from "@/lib/spotguide";
import { resolveSection, SECTION_CHROME } from "@/lib/blog-section";
import { SectionHeader } from "@/components/shared/section-header";
import { BlogFooter } from "@/components/blog/blog-footer";
import { RatingHeadline, RatingBreakdown } from "@/components/spotguide/rating-panel";
import { SpotsList } from "@/components/spotguide/spots-list";
import { SpotguideProvider } from "@/components/spotguide/spotguide-provider";
import { CriteriaRater } from "@/components/spotguide/raters";
import { MeteredContent } from "@/components/spotguide/metered-content";
import { AddSpot } from "@/components/spotguide/add-spot";
import { VerifySpots } from "@/components/spotguide/verify-spots";
import { SpotMap } from "@/components/spotguide/spot-map";
import { flags } from "@/lib/flags";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const d = await getSpotguideDestination(slug);
  if (!d) return { title: "Spotguide — NP7" };
  return {
    title: `${d.name} windsurf spotguide — NP7`,
    description: d.tagline ?? `Windsurf spots in ${d.name}, rated by NP7 and the crew — conditions, wind windows and the forecast that actually works.`,
  };
}

// Personalised (login-aware gate), so render per request.
export const dynamic = "force-dynamic";

export default async function SpotguideDestinationPage({ params }: Props) {
  const { slug } = await params;
  const d = await getSpotguideDestination(slug);
  if (!d) notFound();

  const [user, store] = await Promise.all([getPortalUser().catch(() => null), cookies()]);
  const loggedIn = !!user;
  const section = resolveSection(store.get("np7_section")?.value);
  const chrome = SECTION_CHROME[section];
  const lvl = levelRangeLabel(d.level_min, d.level_max);

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
      <SectionHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="bg-[#fff7ec] min-h-[100svh]">
        {/* hero */}
        <header className="relative overflow-hidden" style={{ background: chrome.heroBackground }}>
          <div className="h-1" style={{ background: chrome.stripe }} />
          {d.hero_image && <div className="absolute inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage: `url('${d.hero_image}')` }} />}
          <div className="relative max-w-[1000px] mx-auto px-6 sm:px-8 pt-12 pb-14 sm:pt-16 sm:pb-16">
            <Link href="/spotguide" className="text-[12px] font-bold text-white/70 hover:text-white transition-colors">← Spotguide</Link>
            <h1 className="text-white text-4xl sm:text-6xl font-black tracking-[-0.03em] mt-3">{d.name}</h1>
            <p className="text-white/75 text-[15px] font-semibold mt-2">{[d.region, d.country].filter(Boolean).join(", ")}{lvl ? `  ·  ${lvl}` : ""}</p>
            {d.tagline && <p className="text-white/80 text-[17px] mt-4 max-w-[620px] leading-relaxed">{d.tagline}</p>}
            <div className="mt-5 inline-flex rounded-xl bg-white/10 backdrop-blur px-4 py-3"><RatingHeadline np7={d.np7} member={d.member} accent={chrome.eyebrow} /></div>
          </div>
        </header>

        <SpotguideProvider destId={d.id} initialLoggedIn={loggedIn}>
          <div className="max-w-[1000px] mx-auto px-6 sm:px-8 py-10 sm:py-14 space-y-10">
            {d.intro && <p className="text-[16.5px] text-[#3f5158] leading-relaxed max-w-[680px] whitespace-pre-line">{d.intro}</p>}

            {/* The destination, rated */}
            <section>
              <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac] mb-3">The destination</h2>
              <div className="space-y-3">
                {(d.np7 > 0 || d.member.count > 0) && (
                  <div className="rounded-2xl border border-[#ece3d3] bg-white p-5">
                    <RatingBreakdown criteria={DESTINATION_CRITERIA} np7Ratings={d.np7_ratings} member={d.member} />
                  </div>
                )}
                <CriteriaRater target="destination" id={d.id} criteria={DESTINATION_CRITERIA} accent={chrome.accent} />
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

            {/* The spots — metered for anonymous visitors, full for members */}
            <section>
              <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac] mb-3">The spots <span className="text-[#c3b9a6]">({d.spots.length})</span></h2>
              {d.spots.length === 0 ? (
                <p className="text-[14px] text-[#6a7a80]">Spots for {d.name} are coming soon.</p>
              ) : (
                <>
                  {(() => {
                    const pts = d.spots.filter((s) => s.lat != null && s.lng != null)
                      .map((s) => ({ lat: s.lat as number, lng: s.lng as number, name: s.name, destSlug: d.slug ?? "", verification: s.verification }));
                    return pts.length > 0 ? <div className="mb-5"><SpotMap spots={pts} height={340} /></div> : null;
                  })()}
                  <MeteredContent gated={!loggedIn} accent={chrome.accent}>
                    <SpotsList spots={d.spots} accent={chrome.accent} />
                  </MeteredContent>
                </>
              )}
            </section>

            {/* Community: verify pending member spots, then add your own */}
            <VerifySpots destId={d.id} accent={chrome.accent} />
            <section>
              <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac] mb-3">Contribute</h2>
              <AddSpot destId={d.id} destName={d.name} accent={chrome.accent} />
            </section>
          </div>
        </SpotguideProvider>
      </main>
      <BlogFooter section={section} showExperience={flags.showExperience} showHardware={flags.showHardware} />
    </>
  );
}
