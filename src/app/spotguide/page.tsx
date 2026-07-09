import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getSpotguideDestinations, getAllSpotguidePoints } from "@/lib/spotguide-data";
import { MagazineTabs } from "@/components/blog/magazine-tabs";
import { SpotMap } from "@/components/spotguide/spot-map";
import { resolveSection, SECTION_CHROME } from "@/lib/blog-section";
import { SectionHeader } from "@/components/shared/section-header";
import { BlogFooter } from "@/components/blog/blog-footer";
import { SpotguideBrowser } from "@/components/spotguide/spotguide-browser";
import { ContributeSpot } from "@/components/spotguide/contribute-spot";
import { cdnImage } from "@/lib/img";
import { flags } from "@/lib/flags";

export const metadata: Metadata = {
  title: "Windsurf Spotguide",
  description: "Honest windsurf spot guides, rated by NP7 and the crew. Real conditions, the forecast that works, and where to ride — destination by destination.",
  alternates: { canonical: "/spotguide" },
};
export const revalidate = 60;

export default async function SpotguideIndex() {
  // Cookie only when Hardware is live — cookies() would opt this page out of ISR.
  const section = flags.showHardware ? resolveSection((await cookies()).get("np7_section")?.value) : "experience";
  const chrome = SECTION_CHROME[section];
  const [dests, points] = await Promise.all([getSpotguideDestinations(), getAllSpotguidePoints()]);
  // All real spot points, clustered by the map itself: zoomed out a destination
  // reads as ONE branded bubble (count + name), zooming in splits into spots —
  // scales to hundreds of spots without a dot-soup.

  // Enrich each pin with its destination's headline (thumb · rating · #spots ·
  // level) so tapping a pin shows real info in the popup, not just a link.
  const destBySlug = new Map(dests.map((d) => [d.slug, d]));
  const mapPoints = points.map((p) => {
    const d = destBySlug.get(p.destSlug);
    if (!d) return p;
    const level = d.level_min && d.level_max && d.level_min !== d.level_max
      ? `${d.level_min}–${d.level_max}`
      : d.level_min || d.level_max || null;
    return {
      ...p,
      thumb: d.hero_image ? cdnImage(d.hero_image, { width: 360 }) : null,
      rating: d.np7 > 0 ? d.np7 : d.member.count > 0 ? d.member.overall : 0,
      ratingKind: (d.np7 > 0 ? "np7" : "member") as "np7" | "member",
      spotCount: d.spotCount,
      level,
    };
  });

  return (
    <>
      <SectionHeader />
      <main className="bg-[#fff7ec] min-h-[100svh]">
        {/* hero — SAME shell as the magazine (bg image, left align, shared tab bar)
            so switching Spotguide ⇄ Gear ⇄ Technique never shifts the pills */}
        <header className="relative text-white pt-16 pb-12 overflow-hidden" style={{ background: chrome.heroBackground }}>
          <div className="absolute inset-0 bg-cover bg-center opacity-20 mix-blend-luminosity" style={{ backgroundImage: "url('/cdn/assets/hero/windsurf-hero-poster.jpg')" }} aria-hidden />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent 45%, rgba(0,20,29,0.55) 100%)" }} aria-hidden />
          <div className="relative max-w-[1200px] mx-auto px-6 sm:px-8">
            <p className="text-[11px] font-bold tracking-[0.25em] mb-3" style={{ color: chrome.eyebrow }}>THE SPOTGUIDE</p>
            <h1 className="text-4xl sm:text-6xl font-black tracking-[-0.03em]">Where to ride</h1>
            <span className="block h-1.5 w-28 rounded-full mt-4" style={{ background: chrome.stripe }} />
            <p className="mt-5 text-[16px] sm:text-[18px] text-white/70 max-w-[600px] leading-relaxed">
              Honest spot guides — rated by NP7 and the crew. Real conditions, the forecast that actually works, and the spots worth your time.
            </p>
            <div className="mt-8">
              <MagazineTabs active="spotguide" accent={chrome.accent} onAccent={chrome.onAccent} />
            </div>
          </div>
        </header>

        <div className="max-w-[1100px] mx-auto px-6 sm:px-8 py-12 sm:py-16">
          {dests.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-[17px] font-bold text-[#00374a]">The guide is being built.</p>
              <p className="text-[14px] text-[#6a7a80] mt-1">Check back soon — spots are on the way.</p>
            </div>
          ) : (
            <>
              {/* Lead with contribution while the guide is young — it matters more than browsing right now. */}
              <div className="mb-10">
                <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac] mb-1">Help build the guide</h2>
                <p className="text-[13.5px] text-[#6a7a80] mb-3">Know a spot — or a whole destination we don&apos;t cover yet? Add it. Members verify it before it goes public.</p>
                <ContributeSpot destinations={dests.map((d) => ({ id: d.id, name: d.name }))} accent={chrome.accent} />
              </div>

              {points.length > 0 && (
                <div className="mb-10">
                  <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac] mb-3">Where we ride <span className="text-[#c3b9a6]">({dests.length} destination{dests.length === 1 ? "" : "s"} · {points.length} spots)</span></h2>
                  <SpotMap spots={mapPoints} cluster height={460} linkLabel="Explore the spots →" />
                </div>
              )}
              <SpotguideBrowser dests={dests} accent={chrome.accent} />
            </>
          )}
        </div>
      </main>
      <BlogFooter section={section} showExperience={flags.showExperience} showHardware={flags.showHardware} />
    </>
  );
}
