import Link from "next/link";
import type { Metadata } from "next";
import { flags } from "@/lib/flags";
import { LaunchLanding } from "./_launch-landing";

export const metadata: Metadata = {
  // absolute → the "%s · NP7" root template doesn't append a second "NP7".
  title: { absolute: "NP7 — Windsurf trips, spots & gear" },
  description:
    "Two worlds, one passion. NP7 Experience — premium watersports travel. NP7 Hardware — custom boards & fins.",
};

import { cdn } from "@/lib/cdn";
import { createAdminClient } from "@/lib/supabase";

const NP7_LOGO = cdn('logos/np7-logo.png');
const NP7_EXPERIENCE_LOGO = cdn('logos/np7-experience-logo.png');
const EXP_PHOTO =
  "https://media.np-seven.com/experiences/np7-alacati/people/alacati-group-photo.jpg";

const Arrow = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default async function LandingPage() {
  // Admin copy (Admin → Website → Homepage, site_settings `home_page`).
  // Shipped strings are the floor — a missing row changes nothing.
  const copy = await (async () => {
    const d = {
      expEyebrow: "TRAVEL · COACHING · COMMUNITY",
      expTagline: "Premium windsurf trips around the planet.",
      expCta: "Enter Experience",
      expPhoto: EXP_PHOTO,
      hwEyebrow: "BOARDS · FINS · CUSTOM",
      hwTagline: "Custom boards & fins — shaped on the bench, finished by hand.",
      hwCta: "Enter Hardware",
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createAdminClient() as any;
      const { data } = await db.from("site_settings").select("value").eq("key", "home_page").maybeSingle();
      const v = (data?.value ?? {}) as Partial<typeof d>;
      return { ...d, ...Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string" && x.trim())) } as typeof d;
    } catch {
      return d;
    }
  })();
  // Until a public world is live (production), keep the existing brand splash + a small
  // member-login link, exactly as production looks today. Once SHOW_EXPERIENCE /
  // SHOW_HARDWARE is on, the new internal landing below takes over.
  if (!flags.showExperience && !flags.showHardware) return <LaunchLanding showBlog={flags.showBlog} />;
  return (
    <main className="relative w-full h-[100svh] flex flex-col overflow-hidden md:flex-row bg-black">
      {/* ---------------------------------------------------------------- */}
      {/* EXPERIENCE — ocean                                                */}
      {/* ---------------------------------------------------------------- */}
      <Link
        href="/experience"
        aria-label="Enter NP7 Experience"
        className="group relative flex flex-col items-center justify-center basis-0 grow transition-all duration-500 ease-out md:hover:grow-[1.45] overflow-hidden motion-reduce:transition-none"
      >
        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-[1.2s] ease-out group-hover:scale-105 group-active:scale-105" style={{ backgroundImage: `url('${copy.expPhoto}')` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#00374a]/95 via-[#00374a]/55 to-[#00374a]/60 transition-colors duration-500 group-hover:from-[#00374a]/85 group-hover:via-[#00374a]/40 group-active:from-[#00374a]/85 group-active:via-[#00374a]/40" />
        {/* sun-to-sea accent wash */}
        <div className="absolute inset-0 opacity-60 mix-blend-soft-light" style={{ background: "linear-gradient(180deg, rgba(255,196,46,0.25), transparent 45%, rgba(0,175,219,0.3))" }} />

        <div className="relative z-10 w-full flex flex-col items-center justify-center text-center px-8 py-10 md:py-24">
          <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.3em] text-white/70 mb-4 md:mb-7">{copy.expEyebrow}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={NP7_EXPERIENCE_LOGO} alt="NP7 Experience" className="w-[175px] sm:w-[300px] lg:w-[340px] h-auto drop-shadow-[0_6px_30px_rgba(0,0,0,0.5)] mb-4 md:mb-7" />
          <p className="text-[14px] sm:text-[17px] text-white/80 max-w-[320px] mb-6 md:mb-9 font-medium">{copy.expTagline}</p>
          <span className="inline-flex items-center gap-2 px-6 py-3 md:px-7 md:py-3.5 rounded-full text-[13.5px] font-bold text-[#00374a] bg-white shadow-[0_8px_30px_rgba(255,255,255,0.2)] group-hover:gap-3.5 group-active:gap-3.5 transition-all">
            {copy.expCta} <Arrow />
          </span>
        </div>
      </Link>

      {/* ---------------------------------------------------------------- */}
      {/* HARDWARE — workshop                                               */}
      {/* ---------------------------------------------------------------- */}
      <Link
        href="/hardware"
        aria-label="Enter NP7 Hardware"
        style={{ boxShadow: "-26px 0 55px rgba(0,0,0,0.45)" }}
        className="group relative flex flex-col items-center justify-center basis-0 grow transition-all duration-500 ease-out md:hover:grow-[1.45] overflow-hidden motion-reduce:transition-none"
      >
        <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% -10%, #26241f 0%, #161618 40%, #0a0a0c 100%)" }} />
        {/* carbon weave */}
        <div className="absolute inset-0 opacity-[0.6]" style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 2px, transparent 2px 8px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.03) 0 2px, transparent 2px 8px)" }} />
        {/* neon floor wash — intensifies on hover/press */}
        <div className="absolute inset-0 opacity-70 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-500" style={{ background: "radial-gradient(70% 50% at 50% 115%, rgba(255,46,136,0.3), transparent 70%)" }} />

        <div className="relative z-10 w-full flex flex-col items-center justify-center text-center px-8 py-10 md:py-24">
          <span className="font-mono text-[10px] sm:text-[11px] font-bold tracking-[0.3em] text-white/45 mb-4 md:mb-7">{copy.hwEyebrow}</span>
          <h2 className="text-[44px] sm:text-7xl lg:text-[88px] font-black tracking-[-0.03em] uppercase text-white leading-[0.9]" style={{ textShadow: "0 4px 30px rgba(0,0,0,0.6)" }}>
            Hardware
          </h2>
          {/* veredelung stripe */}
          <div className="flex items-center gap-1.5 mt-4 mb-5 md:mt-5 md:mb-7">
            <span className="h-1.5 w-14 rounded-full" style={{ background: "#c6ff3a", boxShadow: "0 0 14px #c6ff3a" }} />
            <span className="h-1.5 w-5 rounded-full" style={{ background: "#ff2e88", boxShadow: "0 0 14px #ff2e88" }} />
          </div>
          <p className="text-[14px] sm:text-[17px] text-white/65 max-w-[320px] mb-6 md:mb-9 font-medium">{copy.hwTagline}</p>
          <span className="inline-flex items-center gap-2 px-6 py-3 md:px-7 md:py-3.5 rounded-full text-[13.5px] font-bold text-black bg-[#c6ff3a] shadow-[0_0_30px_rgba(198,255,58,0.4)] group-hover:gap-3.5 group-active:gap-3.5 transition-all">
            {copy.hwCta} <Arrow />
          </span>
        </div>
      </Link>

      {/* master brand — sits in the desktop center seam; hidden on the mobile split
          (each half already carries its own brand, and it would collide up top) */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 hidden md:flex flex-col items-center pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={NP7_LOGO} alt="NP7" className="h-6 w-auto invert drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]" />
      </div>

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-5 text-[11px] text-white/40">
        <span>© 2026 NP7 GmbH</span>
      </div>
    </main>
  );
}
