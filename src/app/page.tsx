import Link from "next/link";

export default function LandingPage() {
  return (
    <>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#111]/95 backdrop-blur-lg">
        <div className="max-w-[1200px] mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white text-[#111] w-9 h-9 rounded-[9px] flex items-center justify-center text-[13px] font-black">
              NP7
            </div>
            <span className="text-xs font-bold tracking-[0.3em] text-white">NP-SEVEN</span>
          </div>
          <nav className="hidden md:flex gap-8">
            <Link href="/experience" className="text-xs font-medium text-white/50 hover:text-white transition-colors tracking-wide">Experience</Link>
            <Link href="/hardware" className="text-xs font-medium text-white/50 hover:text-white transition-colors tracking-wide">Hardware</Link>
            <Link href="#" className="text-xs font-medium text-white/50 hover:text-white transition-colors tracking-wide">About</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="min-h-screen flex items-center justify-center bg-[#111] relative overflow-hidden">
        {/* Grid background */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
            backgroundSize: "80px 80px",
          }}
        />
        {/* Glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,rgba(10,163,199,0.1)_0%,transparent_60%)]" />

        <div className="relative z-10 text-center px-8 pt-24 pb-16 max-w-[960px]">
          <p className="text-[11px] font-bold tracking-[0.25em] text-[#0aa3c7] mb-7">
            NICO PRIEN &middot; GER-7
          </p>
          <h1 className="text-5xl sm:text-7xl lg:text-[88px] font-black text-white leading-[1.0] tracking-[-0.04em] mb-6">
            Two worlds.<br />
            One <span className="text-[#0aa3c7]">passion.</span>
          </h1>
          <p className="text-[17px] text-white/40 max-w-[440px] mx-auto mb-16 font-normal">
            Premium watersports travel and custom board engineering — under one roof.
          </p>

          {/* World cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-[780px] mx-auto">
            <Link href="/experience" className="group relative rounded-2xl overflow-hidden aspect-[3/2] block">
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.08]"
                style={{ backgroundImage: "url('https://surfcenter-experience.com/wp-content/uploads/2025/01/53724070151_54cd73586b_k-1536x1024.jpg')" }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/5" />
              <div className="absolute bottom-0 left-0 right-0 p-7 z-10">
                <span className="inline-block text-[9px] font-extrabold tracking-[0.25em] px-2.5 py-1 rounded bg-white/15 text-white mb-2.5">EXPERIENCE</span>
                <h2 className="text-2xl font-extrabold text-white mb-1.5 tracking-[-0.02em]">NP7 Experience</h2>
                <p className="text-[13px] text-white/65 mb-3.5">Travel, coaching, and riding around the world.</p>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white tracking-[0.06em] uppercase group-hover:gap-3 transition-all">
                  Explore
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </span>
              </div>
            </Link>

            <Link href="/hardware" className="group relative rounded-2xl overflow-hidden aspect-[3/2] block">
              <div
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.08]"
                style={{ backgroundImage: "url('https://surfcenter-experience.com/wp-content/uploads/2025/11/Balz_Muller-5.jpg')" }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/5" />
              <div className="absolute bottom-0 left-0 right-0 p-7 z-10">
                <span className="inline-block text-[9px] font-extrabold tracking-[0.25em] px-2.5 py-1 rounded bg-white/15 text-white mb-2.5">HARDWARE</span>
                <h2 className="text-2xl font-extrabold text-white mb-1.5 tracking-[-0.02em]">NP7 Hardware</h2>
                <p className="text-[13px] text-white/65 mb-3.5">Custom boards and foils, built for performance.</p>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white tracking-[0.06em] uppercase group-hover:gap-3 transition-all">
                  Discover
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-[#111] px-8 pb-24">
        <div className="max-w-[600px] mx-auto grid grid-cols-3 text-center gap-8 border-t border-white/[0.08] pt-12">
          <div>
            <div className="text-[32px] font-black text-white tracking-[-0.02em]">8+</div>
            <div className="text-[10px] font-semibold text-white/30 tracking-[0.15em] uppercase mt-1">Destinations</div>
          </div>
          <div>
            <div className="text-[32px] font-black text-white tracking-[-0.02em]">200+</div>
            <div className="text-[10px] font-semibold text-white/30 tracking-[0.15em] uppercase mt-1">Happy Sailors</div>
          </div>
          <div>
            <div className="text-[32px] font-black text-white tracking-[-0.02em]">GER-7</div>
            <div className="text-[10px] font-semibold text-white/30 tracking-[0.15em] uppercase mt-1">Since Day One</div>
          </div>
        </div>
      </section>
    </>
  );
}
