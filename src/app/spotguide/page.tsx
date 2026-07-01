import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getSpotguideDestinations, getAllSpotguidePoints } from "@/lib/spotguide-data";
import { levelRangeLabel } from "@/lib/spotguide";
import { SpotMap } from "@/components/spotguide/spot-map";
import { resolveSection, SECTION_CHROME } from "@/lib/blog-section";
import { SectionHeader } from "@/components/shared/section-header";
import { BlogFooter } from "@/components/blog/blog-footer";
import { RatingHeadline } from "@/components/spotguide/rating-panel";
import { ContributeSpot } from "@/components/spotguide/contribute-spot";
import { flags } from "@/lib/flags";

export const metadata: Metadata = {
  title: "Spotguide — NP7",
  description: "Honest windsurf spot guides, rated by NP7 and the crew. Real conditions, the forecast that works, and where to ride — destination by destination.",
};
export const revalidate = 60;

export default async function SpotguideIndex() {
  const section = resolveSection((await cookies()).get("np7_section")?.value);
  const chrome = SECTION_CHROME[section];
  const [dests, points] = await Promise.all([getSpotguideDestinations(), getAllSpotguidePoints()]);

  // One pin per DESTINATION (centroid of its spots) so nearby spots don't overlap
  // when zoomed out — the destination page shows the individual spots.
  const byDest = new Map<string, { latSum: number; lngSum: number; n: number; name: string }>();
  for (const p of points) {
    const d = byDest.get(p.destSlug) ?? { latSum: 0, lngSum: 0, n: 0, name: p.destName };
    d.latSum += p.lat; d.lngSum += p.lng; d.n += 1;
    byDest.set(p.destSlug, d);
  }
  const destPins = [...byDest.entries()].map(([destSlug, d]) => ({
    lat: d.latSum / d.n, lng: d.lngSum / d.n, name: d.name, destName: `${d.n} spot${d.n === 1 ? "" : "s"}`, destSlug, verification: "np7",
  }));

  return (
    <>
      <SectionHeader />
      <main className="bg-[#fff7ec] min-h-[100svh]">
        {/* hero */}
        <header className="relative overflow-hidden" style={{ background: chrome.heroBackground }}>
          <div className="h-1" style={{ background: chrome.stripe }} />
          <div className="max-w-[1100px] mx-auto px-6 sm:px-8 pt-16 pb-20 sm:pt-20 sm:pb-24 text-center">
            <p className="text-[12px] font-black uppercase tracking-[0.2em] mb-3" style={{ color: chrome.eyebrow }}>The Spotguide</p>
            <h1 className="text-white text-4xl sm:text-6xl font-black tracking-[-0.03em]">Where to ride</h1>
            <p className="text-white/70 text-[16px] sm:text-[18px] mt-4 max-w-[560px] mx-auto leading-relaxed">
              Honest spot guides — rated by NP7 and the crew. Real conditions, the forecast that actually works, and the spots worth your time.
            </p>
            {/* jump to the other magazine sections */}
            <nav className="mt-7 flex flex-wrap items-center justify-center gap-2 text-[13px] font-bold">
              <span className="rounded-full px-3.5 py-1.5 text-[#00374a]" style={{ backgroundColor: chrome.eyebrow }}>Spotguide</span>
              <Link href="/blog?world=hardware" className="rounded-full px-3.5 py-1.5 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 transition-colors">Gear</Link>
              <Link href="/blog?world=technique" className="rounded-full px-3.5 py-1.5 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 transition-colors">Technique</Link>
              <Link href="/blog" className="rounded-full px-3.5 py-1.5 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 transition-colors">All stories</Link>
            </nav>
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
              {destPins.length > 0 && (
                <div className="mb-10">
                  <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac] mb-3">Where we ride <span className="text-[#c3b9a6]">({destPins.length} destination{destPins.length === 1 ? "" : "s"} · {points.length} spots)</span></h2>
                  <SpotMap spots={destPins} height={460} linkLabel="Explore the spots →" />
                </div>
              )}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {dests.map((d) => {
                const lvl = levelRangeLabel(d.level_min, d.level_max);
                return (
                  <Link key={d.id} href={`/spotguide/${d.slug}`}
                    className="group flex flex-col rounded-2xl overflow-hidden bg-white border border-[#f0e6d6] hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(0,55,74,0.10)] transition-all">
                    <div className="relative aspect-[16/10] bg-cover bg-center bg-[#e9eef0]" style={{ backgroundImage: d.hero_image ? `url('${d.hero_image}')` : undefined }}>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                      <div className="absolute left-4 bottom-3 right-4">
                        <h2 className="text-white text-[20px] font-black tracking-[-0.02em] leading-tight">{d.name}</h2>
                        <p className="text-white/80 text-[12.5px] font-semibold">{[d.region, d.country].filter(Boolean).join(", ")}</p>
                      </div>
                    </div>
                    <div className="p-4 flex flex-col gap-2.5">
                      <RatingHeadline np7={d.np7} member={d.member} accent={chrome.accent} />
                      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[12px] font-semibold text-[#6a7a80]">
                        <span>{d.spotCount} spot{d.spotCount === 1 ? "" : "s"}</span>
                        {lvl && <><span className="text-[#d8cdbb]">·</span><span>{lvl}</span></>}
                      </div>
                    </div>
                  </Link>
                );
              })}
              </div>

              <div className="mt-10">
                <h2 className="text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac] mb-3">Contribute</h2>
                <ContributeSpot destinations={dests.map((d) => ({ id: d.id, name: d.name }))} accent={chrome.accent} />
              </div>
            </>
          )}
        </div>
      </main>
      <BlogFooter section={section} showExperience={flags.showExperience} showHardware={flags.showHardware} />
    </>
  );
}
