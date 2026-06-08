import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NP7 — Nico Prien | GER-7",
  description:
    "Two worlds, one passion. NP7 Experience — premium watersports travel. NP7 Hardware — custom boards & fins.",
};

const NP7_LOGO =
  "https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/assets/logos/np7-logo.png";
const NP7_EXPERIENCE_LOGO =
  "https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/assets/logos/np7-experience-logo.png";
const EXP_PHOTO =
  "https://surfcenter-experience.com/wp-content/uploads/2025/01/53724070151_54cd73586b_k-1536x1024.jpg";

const Arrow = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default function LandingPage() {
  return (
    <main className="relative h-[100svh] w-full flex flex-col md:flex-row overflow-hidden bg-black">
      {/* ---------------------------------------------------------------- */}
      {/* EXPERIENCE — ocean                                                */}
      {/* ---------------------------------------------------------------- */}
      <Link
        href="/experience"
        aria-label="Enter NP7 Experience"
        className="group relative basis-0 grow transition-all duration-500 ease-out md:hover:grow-[1.45] overflow-hidden motion-reduce:transition-none"
      >
        <div className="absolute inset-0 bg-cover bg-center transition-transform duration-[1.2s] ease-out group-hover:scale-105" style={{ backgroundImage: `url('${EXP_PHOTO}')` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#00374a]/95 via-[#00374a]/55 to-[#00374a]/60 transition-colors duration-500 group-hover:from-[#00374a]/85 group-hover:via-[#00374a]/40" />
        {/* sun-to-sea accent wash */}
        <div className="absolute inset-0 opacity-60 mix-blend-soft-light" style={{ background: "linear-gradient(180deg, rgba(255,196,46,0.25), transparent 45%, rgba(0,175,219,0.3))" }} />

        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-8 py-24">
          <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.3em] text-white/70 mb-7">TRAVEL · COACHING · COMMUNITY</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={NP7_EXPERIENCE_LOGO} alt="NP7 Experience" className="w-[230px] sm:w-[300px] lg:w-[340px] h-auto drop-shadow-[0_6px_30px_rgba(0,0,0,0.5)] mb-7" />
          <p className="text-[15px] sm:text-[17px] text-white/80 max-w-[340px] mb-9 font-medium">Premium windsurf, wing &amp; foil trips around the planet.</p>
          <span className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-[13.5px] font-bold text-[#00374a] bg-white shadow-[0_8px_30px_rgba(255,255,255,0.2)] group-hover:gap-3.5 transition-all">
            Enter Experience <Arrow />
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
        className="group relative basis-0 grow transition-all duration-500 ease-out md:hover:grow-[1.45] overflow-hidden motion-reduce:transition-none"
      >
        <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% -10%, #26241f 0%, #161618 40%, #0a0a0c 100%)" }} />
        {/* carbon weave */}
        <div className="absolute inset-0 opacity-[0.6]" style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 2px, transparent 2px 8px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.03) 0 2px, transparent 2px 8px)" }} />
        {/* neon floor wash — intensifies on hover */}
        <div className="absolute inset-0 opacity-70 group-hover:opacity-100 transition-opacity duration-500" style={{ background: "radial-gradient(70% 50% at 50% 115%, rgba(255,46,136,0.3), transparent 70%)" }} />

        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-8 py-24">
          <span className="font-mono text-[10px] sm:text-[11px] font-bold tracking-[0.3em] text-white/45 mb-7">BOARDS · FINS · CUSTOM</span>
          <h2 className="text-5xl sm:text-7xl lg:text-[88px] font-black tracking-[-0.03em] uppercase text-white leading-[0.9]" style={{ textShadow: "0 4px 30px rgba(0,0,0,0.6)" }}>
            Hardware
          </h2>
          {/* veredelung stripe */}
          <div className="flex items-center gap-1.5 mt-5 mb-7">
            <span className="h-1.5 w-14 rounded-full" style={{ background: "#c6ff3a", boxShadow: "0 0 14px #c6ff3a" }} />
            <span className="h-1.5 w-5 rounded-full" style={{ background: "#ff2e88", boxShadow: "0 0 14px #ff2e88" }} />
          </div>
          <p className="text-[15px] sm:text-[17px] text-white/65 max-w-[340px] mb-9 font-medium">Custom boards &amp; fins — shaped on the bench, finished by hand.</p>
          <span className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-[13.5px] font-bold text-black bg-[#c6ff3a] shadow-[0_0_30px_rgba(198,255,58,0.4)] group-hover:gap-3.5 transition-all">
            Enter Hardware <Arrow />
          </span>
        </div>
      </Link>

      {/* master brand + footer link */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={NP7_LOGO} alt="NP7" className="h-6 w-auto invert drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]" />
        <span className="mt-1.5 text-[9px] font-bold tracking-[0.3em] text-white/60">NICO PRIEN · GER-7</span>
      </div>

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-5 text-[11px] text-white/40">
        <Link href="/admin" className="hover:text-white transition-colors pointer-events-auto">Admin</Link>
        <span className="text-white/20">·</span>
        <span>© 2026 NP7 GmbH</span>
      </div>
    </main>
  );
}
