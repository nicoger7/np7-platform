import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getSpotguideDestinations } from "@/lib/spotguide-data";
import { levelRangeLabel } from "@/lib/spotguide";
import { resolveSection, SECTION_CHROME } from "@/lib/blog-section";
import { SectionHeader } from "@/components/shared/section-header";
import { BlogFooter } from "@/components/blog/blog-footer";
import { RatingHeadline } from "@/components/spotguide/rating-panel";
import { flags } from "@/lib/flags";

export const metadata: Metadata = {
  title: "Spotguide — NP7",
  description: "Honest windsurf spot guides, rated by NP7 and the crew. Real conditions, the forecast that works, and where to ride — destination by destination.",
};
export const revalidate = 60;

export default async function SpotguideIndex() {
  const section = resolveSection((await cookies()).get("np7_section")?.value);
  const chrome = SECTION_CHROME[section];
  const dests = await getSpotguideDestinations();

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
          </div>
        </header>

        <div className="max-w-[1100px] mx-auto px-6 sm:px-8 py-12 sm:py-16">
          {dests.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-[17px] font-bold text-[#00374a]">The guide is being built.</p>
              <p className="text-[14px] text-[#6a7a80] mt-1">Check back soon — spots are on the way.</p>
            </div>
          ) : (
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
          )}
        </div>
      </main>
      <BlogFooter section={section} showExperience={flags.showExperience} showHardware={flags.showHardware} />
    </>
  );
}
