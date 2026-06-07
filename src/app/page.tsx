const STORAGE = "https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/assets";

const experiences = [
  {
    title: "NP7 Turkey Experience",
    location: "Alaçatı, Turkey",
    dates: "Aug 17–23, 2026",
    status: "last-spots" as const,
    statusLabel: "Last spots",
    url: "https://surfcenter-experience.com/event/np7-turkey-experience-2026/",
  },
  {
    title: "NP7 Bonaire — Week 1",
    location: "Bonaire, Caribbean",
    dates: "Nov 30 – Dec 6, 2026",
    status: "available" as const,
    statusLabel: "Available",
    url: "https://surfcenter-experience.com/event/np7-bonaire-experience-2026-30nov-to-6dec/",
  },
  {
    title: "NP7 Bonaire — Week 2",
    location: "Bonaire, Caribbean",
    dates: "Dec 7–13, 2026",
    status: "fully-booked" as const,
    statusLabel: "Fully booked",
    url: "https://surfcenter-experience.com/event/np7-bonaire-experience-2026-7-to-14-december/",
  },
  {
    title: "NP7 Bonaire — Week 3",
    location: "Bonaire, Caribbean",
    dates: "Dec 14–20, 2026",
    status: "available" as const,
    statusLabel: "Available",
    url: "https://surfcenter-experience.com/event/np7-bonaire-experience-2026-14-to-20-december/",
  },
];

const products = [
  {
    title: "NP7 Rockstar Fin",
    category: "Windsurf Fin",
    status: "out-of-stock" as const,
    statusLabel: "Out of stock",
    url: "https://surf-center.com/de/np7-rockstar-fin",
  },
];

const statusColors = {
  available: { dot: "bg-green-500", text: "text-green-400", bg: "bg-green-500/10" },
  "last-spots": { dot: "bg-amber-500", text: "text-amber-400", bg: "bg-amber-500/10" },
  "fully-booked": { dot: "bg-red-500", text: "text-red-400", bg: "bg-red-500/10" },
  "out-of-stock": { dot: "bg-red-500", text: "text-red-400", bg: "bg-red-500/10" },
};

export default function HomePage() {
  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background photo */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url('${STORAGE}/photos/hero-bg.jpg')`,
        }}
      />
      {/* Gradient fade — soft vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0.55)_50%,rgba(0,0,0,0.8)_100%)]" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-[1200px] mx-auto px-6 py-16">
        {/* Top: NP7 logo */}
        <div className="flex justify-center mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${STORAGE}/logos/np7-logo.png`}
            alt="NP7"
            className="h-14 w-auto invert opacity-90"
          />
        </div>

        {/* Three boxes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* ── Hardware box (LEFT) ── */}
          <div className="bg-gradient-to-br from-[#111]/80 to-[#1a1a2e]/80 backdrop-blur-xl border border-white/[0.1] rounded-2xl p-7 hover:border-white/[0.2] transition-all duration-300">
            <div className="mb-5 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${STORAGE}/logos/np7-logo.png`}
                alt="NP7 Hardware"
                className="h-9 w-auto mx-auto mb-1 invert"
              />
              <p className="text-xs text-white/40">Windsurf fins</p>
            </div>

            <div className="space-y-2.5">
              {products.map((product) => {
                const colors = statusColors[product.status];
                return (
                  <a
                    key={product.title}
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.06] rounded-xl p-3.5 transition-all duration-200 group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white group-hover:text-white/90 truncate">
                          {product.title}
                        </h3>
                        <p className="text-[11px] text-white/35 mt-0.5">
                          {product.category}
                        </p>
                      </div>
                      <div className={`flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full ${colors.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                        <span className={`text-[10px] font-bold ${colors.text} whitespace-nowrap`}>
                          {product.statusLabel}
                        </span>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>

          {/* ── Experience box (CENTER) ── */}
          <div className="bg-gradient-to-br from-[#0a3d5c]/80 to-[#0aa3c7]/30 backdrop-blur-xl border border-[#0aa3c7]/20 rounded-2xl p-7 hover:border-[#0aa3c7]/40 transition-all duration-300">
            <div className="mb-5 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${STORAGE}/logos/np7-experience-logo.png`}
                alt="NP7 Experience"
                className="h-28 w-auto mx-auto mb-1"
              />
              <p className="text-xs text-white/40">Windsurfing travel experiences</p>
            </div>

            <div className="space-y-2.5">
              {experiences.map((exp) => {
                const colors = statusColors[exp.status];
                return (
                  <a
                    key={exp.title}
                    href={exp.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.06] rounded-xl p-3.5 transition-all duration-200 group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white group-hover:text-white/90 truncate">
                          {exp.title}
                        </h3>
                        <p className="text-[11px] text-white/35 mt-0.5">
                          {exp.location} &middot; {exp.dates}
                        </p>
                      </div>
                      <div className={`flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full ${colors.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                        <span className={`text-[10px] font-bold ${colors.text} whitespace-nowrap`}>
                          {exp.statusLabel}
                        </span>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>

          {/* ── Nico Prien box (RIGHT) ── */}
          <a
            href="https://nicoprien.de"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-gradient-to-br from-[#1a1a2e]/80 to-[#2d1b4e]/60 backdrop-blur-xl border border-white/[0.1] rounded-2xl p-7 hover:border-white/[0.2] transition-all duration-300 group block"
          >
            <div className="text-center">
              {/* Profile photo */}
              <div
                className="w-28 h-28 mx-auto rounded-full bg-cover bg-center bg-white/10 mb-4 border-2 border-white/20 group-hover:border-white/40 transition-all"
                style={{
                  backgroundImage: `url('${STORAGE}/photos/nico-profile.png')`,
                }}
              />
              <h3 className="text-xl font-black text-white mb-1 tracking-[-0.02em]">Nico Prien</h3>
              <p className="text-xs text-white/40 mb-4">GER-7 &middot; Professional Windsurfer</p>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/50 group-hover:text-white/80 transition-colors">
                nicoprien.de
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M7 17L17 7M17 7H7M17 7v10" /></svg>
              </div>
            </div>
          </a>

        </div>

        {/* Bottom */}
        <div className="mt-8 text-center">
          <p className="text-[11px] text-white/20 tracking-wide">
            &copy; 2026 NP7 GmbH &middot; Nico Prien &middot; GER-7
          </p>
        </div>
      </div>
    </main>
  );
}
