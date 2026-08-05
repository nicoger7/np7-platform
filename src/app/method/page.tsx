import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MagazineTabs } from "@/components/blog/magazine-tabs";
import { SECTION_CHROME } from "@/lib/blog-section";
import { SectionHeader } from "@/components/shared/section-header";
import { BlogFooter } from "@/components/blog/blog-footer";
import { MethodContent } from "@/components/method/method-content";
import { METHOD_EYEBROW, METHOD_HEADLINE, METHOD_SUBHEAD } from "@/lib/np7-method";
import { flags } from "@/lib/flags";

export const metadata: Metadata = {
  title: "The NP7 Method",
  description:
    "Great windsurfing was never one fix on the water — it's seven things moving together. The NP7 Method is Nico Prien's proven, holistic coaching system for building the whole rider across one week by the sea.",
  alternates: { canonical: "/method" },
};
export const revalidate = 3600;

export default async function MethodPage() {
  // Built but kept OFFLINE — 404 in production until SHOW_METHOD=true.
  if (!flags.showMethod) notFound();
  const chrome = SECTION_CHROME.experience;

  return (
    <>
      <SectionHeader section="experience" />
      <main className="bg-[#fff7ec] min-h-[100svh]">
        {/* HERO — a real coaching moment behind the manifesto title */}
        <header className="relative text-white pt-16 pb-14 overflow-hidden" style={{ background: chrome.heroBackground }}>
          <div className="absolute inset-0 bg-cover opacity-25" style={{ backgroundImage: "url('https://media.np-seven.com/experiences/np7-bonaire/people/nico-board-hteory-bonaire.jpg')", backgroundPosition: "center 35%" }} aria-hidden />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,20,29,0.3) 0%, transparent 42%, rgba(0,20,29,0.55) 100%)" }} aria-hidden />
          <div className="relative max-w-[1100px] mx-auto px-6 sm:px-8">
            <p className="text-[11px] font-bold tracking-[0.25em] mb-3" style={{ color: chrome.eyebrow }}>{METHOD_EYEBROW}</p>
            <h1 className="text-4xl sm:text-6xl font-black tracking-[-0.03em] max-w-[720px] leading-[1.02]">{METHOD_HEADLINE}</h1>
            <span className="block h-1.5 w-28 rounded-full mt-4" style={{ background: chrome.stripe }} />
            <p className="mt-5 text-[15.5px] sm:text-[17px] text-white/75 max-w-[680px] leading-relaxed">{METHOD_SUBHEAD}</p>
            <div className="mt-8">
              <MagazineTabs active="technique" accent={chrome.accent} onAccent={chrome.onAccent} />
            </div>
          </div>
        </header>

        <MethodContent variant="page" />

        <BlogFooter section="experience" showExperience={flags.showExperience} showHardware={flags.showHardware} />
      </main>
    </>
  );
}
