import Link from "next/link";

/**
 * Holding landing for the soft launch: the existing public brand splash (the same
 * one that's been on production), whose tiles link OUT to the current external sites
 * — so it reveals nothing about the new internal Experience/Hardware pages — plus a
 * small Member login button in the corner. Shown until a public world goes live.
 */

const STORAGE = "/cdn/assets";

const experiences = [
  { title: "NP7 Turkey Experience", location: "Alaçatı, Turkey", dates: "Aug 17–23, 2026", status: "last-spots" as const, statusLabel: "Last spots", url: "https://surfcenter-experience.com/event/np7-turkey-experience-2026/" },
  { title: "NP7 Bonaire — Week 1", location: "Bonaire, Caribbean", dates: "Nov 30 – Dec 6, 2026", status: "available" as const, statusLabel: "Available", url: "https://surfcenter-experience.com/event/np7-bonaire-experience-2026-30nov-to-6dec/" },
  { title: "NP7 Bonaire — Week 2", location: "Bonaire, Caribbean", dates: "Dec 7–13, 2026", status: "fully-booked" as const, statusLabel: "Fully booked", url: "https://surfcenter-experience.com/event/np7-bonaire-experience-2026-7-to-14-december/" },
  { title: "NP7 Bonaire — Week 3", location: "Bonaire, Caribbean", dates: "Dec 14–20, 2026", status: "available" as const, statusLabel: "Available", url: "https://surfcenter-experience.com/event/np7-bonaire-experience-2026-14-to-20-december/" },
];

const products = [
  { title: "NP7 Rockstar Fin", category: "Windsurf Fin", status: "out-of-stock" as const, statusLabel: "Out of stock", url: "https://surf-center.com/de/np7-rockstar-fin" },
];

const statusColors = {
  available: { dot: "bg-green-500", text: "text-green-400", bg: "bg-green-500/15" },
  "last-spots": { dot: "bg-amber-400", text: "text-amber-300", bg: "bg-amber-400/15" },
  "fully-booked": { dot: "bg-red-500", text: "text-red-400", bg: "bg-red-500/15" },
  "out-of-stock": { dot: "bg-red-500", text: "text-red-400", bg: "bg-red-500/15" },
};

const boxStyle = {
  background: "linear-gradient(135deg, rgba(11,30,46,0.85) 0%, rgba(8,122,149,0.3) 100%)",
  backdropFilter: "blur(20px)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
};

const itemBg = "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)";

export function LaunchLanding({ showBlog = false }: { showBlog?: boolean }) {
  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background photo */}
      <div className="absolute inset-0 bg-cover bg-center bg-[#0b1e2e]" style={{ backgroundImage: `url('${STORAGE}/hero/windsurf-hero-poster.jpg')` }} />
      {/* Fade: transparent top → black bottom */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 10%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.8) 70%, rgba(0,0,0,1) 100%)" }} />

      {/* Spotguide — the flagship public feature during the soft launch (top-left,
          mirrors the member-login pill). Hidden until SHOW_BLOG=true. */}
      {showBlog && (
        <Link
          href="/spotguide"
          className="absolute top-5 left-5 z-20 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/70 hover:text-white bg-white/10 hover:bg-white/[0.18] border border-white/15 rounded-full px-3.5 py-1.5 backdrop-blur-md transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
          Spotguide
        </Link>
      )}

      {/* Small member login — corner */}
      <Link
        href="/account/login"
        className="absolute top-5 right-5 z-20 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/70 hover:text-white bg-white/10 hover:bg-white/[0.18] border border-white/15 rounded-full px-3.5 py-1.5 backdrop-blur-md transition-colors"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>
        Member login
      </Link>

      {/* Content */}
      <div className="relative z-10 w-full max-w-[1200px] mx-auto px-6 py-16">
        <div className="flex justify-center mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${STORAGE}/logos/np7-logo.png`} alt="NP7" className="h-14 w-auto invert drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Hardware */}
          <div className="rounded-2xl p-7 transition-all duration-300 border border-white/10 hover:border-white/20 flex flex-col" style={boxStyle}>
            <div className="h-[80px] flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${STORAGE}/logos/np7-logo.png`} alt="NP7 Hardware" className="h-10 w-auto invert" />
            </div>
            <p className="text-xs text-white/50 text-center mt-3 mb-5">Windsurf hardware</p>
            <div className="space-y-2.5 flex-1">
              {products.map((product) => {
                const colors = statusColors[product.status];
                return (
                  <a key={product.title} href={product.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl p-3.5 transition-all duration-200 group border border-white/[0.08] hover:border-white/[0.15]" style={{ background: itemBg }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white group-hover:text-[#0aa3c7] truncate transition-colors">{product.title}</h3>
                        <p className="text-[11px] text-white/40 mt-0.5">{product.category}</p>
                      </div>
                      <div className={`flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full ${colors.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                        <span className={`text-[10px] font-bold ${colors.text} whitespace-nowrap`}>{product.statusLabel}</span>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>

          {/* Experience */}
          <div className="rounded-2xl p-7 transition-all duration-300 border border-white/10 hover:border-white/20 flex flex-col" style={boxStyle}>
            <div className="h-[80px] flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${STORAGE}/logos/np7-experience-logo.png`} alt="NP7 Experience" className="h-[72px] w-auto" />
            </div>
            <p className="text-xs text-white/50 text-center mt-3 mb-5">Windsurfing travel experiences</p>
            <div className="space-y-2.5 flex-1">
              {experiences.map((exp) => {
                const colors = statusColors[exp.status];
                return (
                  <a key={exp.title} href={exp.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl p-3.5 transition-all duration-200 group border border-white/[0.08] hover:border-white/[0.15]" style={{ background: itemBg }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white group-hover:text-[#0aa3c7] truncate transition-colors">{exp.title}</h3>
                        <p className="text-[11px] text-white/40 mt-0.5">{exp.location} &middot; {exp.dates}</p>
                      </div>
                      <div className={`flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full ${colors.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                        <span className={`text-[10px] font-bold ${colors.text} whitespace-nowrap`}>{exp.statusLabel}</span>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>

          {/* Nico Prien */}
          <a href="https://nicoprien.com" target="_blank" rel="noopener noreferrer" className="rounded-2xl p-7 transition-all duration-300 group border border-white/10 hover:border-white/20 flex flex-col" style={boxStyle}>
            <div className="h-[80px] flex items-center justify-center">
              <div className="w-[72px] h-[72px] rounded-full bg-cover bg-center bg-white/10 border-2 border-white/20 group-hover:border-[#0aa3c7]/60 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.2)]" style={{ backgroundImage: `url('${STORAGE}/photos/nico-profile.png')` }} />
            </div>
            <p className="text-xs text-white/50 text-center mt-3 mb-5">GER-7 · Professional Windsurfer</p>
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <h3 className="text-xl font-black text-white mb-3 tracking-[-0.02em]">Nico Prien</h3>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0aa3c7]/70 group-hover:text-[#0aa3c7] transition-colors">
                nicoprien.com
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M7 17L17 7M17 7H7M17 7v10" /></svg>
              </div>
            </div>
          </a>
        </div>

        <div className="mt-8 text-center">
          <p className="text-[11px] text-white/20 tracking-wide">&copy; 2026 NP7 GmbH &middot; Nico Prien &middot; GER-7</p>
          <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-white/25">
            <a href="/impressum" className="hover:text-white/50 transition-colors">Impressum</a>
            <a href="/privacy" className="hover:text-white/50 transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-white/50 transition-colors">Terms</a>
          </div>
        </div>
      </div>
    </main>
  );
}
