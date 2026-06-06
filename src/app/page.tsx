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
    url: "https://surf-center.com/np7-rockstar",
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
          backgroundImage:
            `url('${STORAGE}/photos/hero-bg.jpg')`,
        }}
      />
      {/* Dark fade overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/70 to-black/80" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-[1100px] mx-auto px-6 py-16">
        {/* Top: NP7 logo */}
        <div className="flex justify-center mb-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${STORAGE}/logos/np7-logo-white.png`}
            alt="NP7"
            className="h-16 w-auto opacity-90"
          />
        </div>

        {/* Two boxes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ── Experience box ── */}
          <div className="bg-white/[0.07] backdrop-blur-xl border border-white/[0.12] rounded-2xl p-8 hover:bg-white/[0.1] transition-all duration-300">
            {/* Experience header */}
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-black text-white tracking-[-0.02em] mb-1">NP7 Experience</h2>
              <p className="text-sm text-white/40">Windsurfing travel experiences</p>
            </div>

            {/* Experience list */}
            <div className="space-y-3">
              {experiences.map((exp) => {
                const colors = statusColors[exp.status];
                return (
                  <a
                    key={exp.title}
                    href={exp.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] rounded-xl p-4 transition-all duration-200 group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-[15px] font-bold text-white group-hover:text-white/90 truncate">
                          {exp.title}
                        </h3>
                        <p className="text-xs text-white/40 mt-0.5">
                          {exp.location} &middot; {exp.dates}
                        </p>
                      </div>
                      <div className={`flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full ${colors.bg}`}>
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

          {/* ── Hardware box ── */}
          <div className="bg-white/[0.07] backdrop-blur-xl border border-white/[0.12] rounded-2xl p-8 hover:bg-white/[0.1] transition-all duration-300">
            {/* Hardware header */}
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-black text-white tracking-[-0.02em] mb-1">NP7 Hardware</h2>
              <p className="text-sm text-white/40">Custom boards &amp; fins</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${STORAGE}/logos/np7-rockstar-logo-white.png`}
                alt="NP7 Rockstar"
                className="h-12 w-auto mx-auto mt-4 opacity-70"
              />
            </div>

            {/* Product list */}
            <div className="space-y-3">
              {products.map((product) => {
                const colors = statusColors[product.status];
                return (
                  <a
                    key={product.title}
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] rounded-xl p-4 transition-all duration-200 group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-[15px] font-bold text-white group-hover:text-white/90 truncate">
                          {product.title}
                        </h3>
                        <p className="text-xs text-white/40 mt-0.5">
                          {product.category}
                        </p>
                      </div>
                      <div className={`flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full ${colors.bg}`}>
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

            {/* Coming soon filler */}
            <div className="mt-6 text-center py-8 border border-dashed border-white/[0.1] rounded-xl">
              <p className="text-sm text-white/25 font-medium">More products coming soon</p>
            </div>
          </div>
        </div>

        {/* Bottom: social / tagline */}
        <div className="mt-10 text-center">
          <p className="text-xs text-white/25 tracking-wide">
            &copy; 2026 NP7 GmbH &middot; Nico Prien &middot; GER-7
          </p>
        </div>
      </div>
    </main>
  );
}
