import type { Metadata } from "next";
import { getSpotguideDestinations, getAllSpotguidePoints } from "@/lib/spotguide-data";
import { MagazineTabs } from "@/components/blog/magazine-tabs";
import { SectionHeader } from "@/components/shared/section-header";
import { SECTION_VARS } from "@/components/shared/section-world";
import { BlogFooter } from "@/components/blog/blog-footer";
import { SpotguideBrowser } from "@/components/spotguide/spotguide-browser";
import { ProposedAreas } from "@/components/spotguide/proposed-areas";
import { ContributeSpot } from "@/components/spotguide/contribute-spot";
import { cdnImage } from "@/lib/img";
import { flags } from "@/lib/flags";

export const metadata: Metadata = {
  title: "Windsurf Spotguide",
  description: "Honest windsurf spot guides, rated by NP7 and the crew. Real conditions, the forecast that works, and where to ride — destination by destination.",
  alternates: { canonical: "/spotguide" },
};
export const revalidate = 3600;

export default async function SpotguideIndex() {
  // Neither `?from=` nor the np7_section cookie is read here — both are request
  // APIs, and either one costs this page its ISR entry. The world is settled in
  // the browser instead (section-world.tsx), so the chrome is CSS variables.
  const chrome = SECTION_VARS;
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
      toVerifyCount: d.toVerifyCount,
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
          {/* real crew photo (high-res), not the video screengrab */}
          {/* focal point held low (the crew sit in the lower third) so wide, short
              heroes don't crop to empty sky and strand them at the bottom edge */}
          <div className="absolute inset-0 bg-cover opacity-30" style={{ backgroundImage: "url('https://media.np-seven.com/experiences/np7-bonaire/people/groups-hot-water-2025.jpg')", backgroundPosition: "center 68%" }} aria-hidden />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,20,29,0.25) 0%, transparent 40%, rgba(0,20,29,0.6) 100%)" }} aria-hidden />
          <div className="relative max-w-[1200px] mx-auto px-6 sm:px-8">
            <p className="text-[11px] font-bold tracking-[0.25em] mb-3" style={{ color: chrome.eyebrow }}>THE SPOTGUIDE · A COMMUNITY PROJECT</p>
            <h1 className="text-4xl sm:text-6xl font-black tracking-[-0.03em]">Where to ride</h1>
            <span className="block h-1.5 w-28 rounded-full mt-4" style={{ background: chrome.stripe }} />
            <p className="mt-5 text-[16px] sm:text-[18px] text-white/75 max-w-[640px] leading-relaxed">
              The windsurf community, mapping its world. Riders everywhere sharing the spots they know best — home waters, honest ratings, and the local knowledge no forecast app can give you. Explore it, then add yours.
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
                <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac] mb-3">Where we ride <span className="text-[#c3b9a6]">({dests.length} destination{dests.length === 1 ? "" : "s"} · {points.filter((p) => p.verification !== "pending").length} spots{points.some((p) => p.verification === "pending") ? ` · ${points.filter((p) => p.verification === "pending").length} to verify` : ""})</span></h2>
              )}
              {/* no `section` — it only fed a `?from=` on the outgoing links, and
                  this page no longer knows the reader's world. The destination
                  pages fall back to the cookie, which is the same answer. */}
              <SpotguideBrowser dests={dests} accent={chrome.accent} mapSpots={mapPoints} />
            </>
          )}
          {/* members-only: rider-proposed areas awaiting their 3 confirms */}
          <ProposedAreas accent={chrome.accent} />
        </div>
      </main>
      {/* the footer's own background comes from a server-picked section; the
          wrapper lets the browser's world win instead (section-world.tsx) */}
      <div className="np7-section-footer">
        <BlogFooter showExperience={flags.showExperience} showHardware={flags.showHardware} />
      </div>
    </>
  );
}
