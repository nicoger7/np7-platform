import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { TechHero } from "@/components/hardware/tech-hero";
import { HardwareHeader } from "@/components/hardware/hardware-header";
import { NP7_LOGO } from "@/components/experience/ocean-header";
import { Reveal } from "@/components/experience/reveal";

export const metadata: Metadata = {
  title: "NP7 Hardware — Custom Windsurf & Foil Boards",
  description:
    "Custom windsurf and foil boards engineered by Nico Prien (GER-7). Built on the water, shaped for performance.",
};

export const revalidate = 60;

const NEON_PINK = "#ff2990";
const NEON_LIME = "#c2ff38";

/* placeholder catalogue — wired to hw_products when the table is populated */
type Product = {
  name: string;
  category: string;
  year: number;
  price: number;
  specs: string[];
  accent: string;
};

const FALLBACK_PRODUCTS: Product[] = [
  { name: "NP7 Foil 145", category: "Foil Board", year: 2026, price: 2890, specs: ["145 L", "228 cm", "7.2 kg"], accent: NEON_PINK },
  { name: "NP7 Foil 125", category: "Foil Board", year: 2026, price: 2690, specs: ["125 L", "222 cm", "6.8 kg"], accent: NEON_LIME },
  { name: "NP7 Freeride 135", category: "Windsurf Board", year: 2026, price: 2490, specs: ["135 L", "240 cm"], accent: NEON_LIME },
  { name: "Front Wing 980", category: "Hydrofoil Wing", year: 2026, price: 890, specs: ["980 cm²", "Carbon"], accent: NEON_PINK },
  { name: "NP7 Slalom 110", category: "Race Board", year: 2026, price: 2990, specs: ["110 L", "227 cm"], accent: NEON_PINK },
  { name: "Mast 85 Pro", category: "Foil Mast", year: 2026, price: 690, specs: ["85 cm", "Pre-preg"], accent: NEON_LIME },
];

const CATEGORIES = [
  { name: "Boards", tag: "Freeride · Slalom · Foil", accent: NEON_LIME },
  { name: "Foils", tag: "Wings · Masts · Fuselages", accent: NEON_PINK },
  { name: "Accessories", tag: "Bags · Parts · Spares", accent: "#36e0ff" },
];

const STATS = [
  { n: "100%", label: "Hand-built" },
  { n: "GER-7", label: "Tested by Nico" },
  { n: "Carbon", label: "Pre-preg layup" },
  { n: "0", label: "Committees" },
];

const MARQUEE = "CUSTOM CARBON · ENGINEERED IN GERMANY · RIDDEN BY GER-7 · BUILT TO SEND · ";

function BoardGlyph({ accent }: { accent: string }) {
  return (
    <svg width="118" height="118" viewBox="0 0 120 120" fill="none" className="opacity-90 transition-transform duration-500 group-hover:scale-110">
      <g stroke={accent} strokeWidth="2" style={{ filter: `drop-shadow(0 0 8px ${accent})` }}>
        <path d="M60 12 C40 40 36 78 60 108 C84 78 80 40 60 12 Z" />
        <line x1="60" y1="26" x2="60" y2="96" strokeDasharray="3 5" opacity="0.6" />
        <line x1="48" y1="70" x2="72" y2="70" opacity="0.5" />
      </g>
    </svg>
  );
}

export default async function HardwarePage() {
  const { data } = await supabase
    .from("hw_products")
    .select("name,category,price,year,specs")
    .eq("status", "published");

  const dbProducts = (data ?? []) as Array<{ name: string; category: string | null; price: number | null; year: number | null; specs: unknown }>;
  const products: Product[] =
    dbProducts.length > 0
      ? dbProducts.map((p, i) => ({
          name: p.name,
          category: p.category ?? "Hardware",
          year: p.year ?? 2026,
          price: p.price ?? 0,
          specs: Array.isArray(p.specs) ? (p.specs as string[]).slice(0, 3) : [],
          accent: i % 2 === 0 ? NEON_PINK : NEON_LIME,
        }))
      : FALLBACK_PRODUCTS;

  return (
    <div className="bg-[#070809] text-white">
      <HardwareHeader />

      {/* ---------------------------------------------------------------- */}
      {/* HERO — synthwave grid                                             */}
      {/* ---------------------------------------------------------------- */}
      <TechHero>
        {/* scrim so the wordmark separates from the neon sun/grid */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_50%_at_50%_52%,rgba(0,0,0,0.7)_0%,rgba(0,0,0,0.3)_48%,transparent_78%)]" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" aria-hidden />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
          <Reveal from="none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={NP7_LOGO} alt="NP7" className="h-12 sm:h-16 w-auto invert mb-5" style={{ filter: "invert(1) drop-shadow(0 0 18px rgba(255,255,255,0.35))" }} />
          </Reveal>
          <Reveal from="up" delay={100}>
            <h1
              className="font-mono text-4xl sm:text-6xl lg:text-7xl font-black tracking-[0.04em] uppercase"
              style={{ textShadow: `0 0 24px ${NEON_PINK}, 0 0 60px rgba(255,41,144,0.5)` }}
            >
              Hardware
            </h1>
          </Reveal>
          <Reveal from="up" delay={170}>
            <p className="mt-5 text-[16px] sm:text-[19px] text-white/70 max-w-[500px] font-medium">
              Custom windsurf &amp; foil boards, engineered on the water by Nico Prien — and built to send.
            </p>
          </Reveal>
          <Reveal from="up" delay={240}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="#products" className="px-7 py-4 rounded-full text-[14px] font-bold text-black bg-[#c2ff38] shadow-[0_0_30px_rgba(194,255,56,0.5)] hover:-translate-y-0.5 transition-all">
                Explore the range
              </Link>
              <Link href="#engineered" className="px-7 py-4 rounded-full text-[14px] font-bold text-white border border-white/30 hover:border-[#ff2990] hover:text-[#ff2990] transition-all">
                The tech
              </Link>
            </div>
          </Reveal>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/40 animate-bounce">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </div>
        </div>
      </TechHero>

      {/* MARQUEE strip */}
      <div className="relative overflow-hidden border-y border-white/10 bg-black py-3">
        <div className="marquee-track whitespace-nowrap font-mono text-[13px] font-bold tracking-[0.2em] uppercase">
          {[0, 1].map((k) => (
            <span key={k} className="mx-0 text-[#c2ff38]">
              {MARQUEE.repeat(3)}
            </span>
          ))}
        </div>
        <style>{`
          @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
          .marquee-track { display: inline-block; animation: marquee 30s linear infinite; }
          @media (prefers-reduced-motion: reduce){ .marquee-track{ animation: none; } }
        `}</style>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* CATEGORIES                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section className="max-w-[1200px] mx-auto px-6 sm:px-8 py-20 sm:py-28">
        <Reveal className="mb-12">
          <p className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase text-[#ff2990] mb-3">// THE RANGE</p>
          <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.02em]">Pick your weapon</h2>
        </Reveal>
        <div className="grid sm:grid-cols-3 gap-5">
          {CATEGORIES.map((c, i) => (
            <Reveal key={c.name} delay={i * 90}>
              <Link href="#products" className="group relative block rounded-2xl border border-white/10 bg-[#0d0e12] p-8 h-[200px] overflow-hidden hover:border-white/0 transition-colors">
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `radial-gradient(circle at 30% 20%, ${c.accent}22, transparent 60%)` }} />
                <span className="absolute -bottom-6 -right-3 text-[120px] font-black leading-none opacity-[0.07] select-none" aria-hidden>{i + 1}</span>
                <div className="relative">
                  <span className="block w-10 h-1 rounded-full mb-5" style={{ background: c.accent, boxShadow: `0 0 16px ${c.accent}` }} />
                  <h3 className="text-2xl font-black tracking-[-0.01em]">{c.name}</h3>
                  <p className="font-mono text-[12px] text-white/45 mt-2">{c.tag}</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* PRODUCTS                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section id="products" className="scroll-mt-20 relative py-20 sm:py-28 border-y border-white/10" style={{ background: "linear-gradient(180deg,#070809,#0b0c11)" }}>
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "44px 44px" }} aria-hidden />
        <div className="relative max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="flex items-end justify-between mb-12 gap-4">
            <div>
              <p className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase text-[#c2ff38] mb-3">// 2026 LINE-UP</p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.02em]">Latest gear</h2>
            </div>
            <span className="font-mono text-[12px] text-white/40 hidden sm:block">{products.length} products</span>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {products.map((p, i) => (
              <Reveal key={p.name} delay={(i % 3) * 80} as="article">
                <div className="group relative rounded-2xl border border-white/10 bg-[#0e0f13] overflow-hidden hover:-translate-y-1 transition-all duration-300 h-full" style={{ ["--ac" as string]: p.accent }}>
                  <div className="relative h-44 grid place-items-center bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.06),transparent_70%)]">
                    <BoardGlyph accent={p.accent} />
                    <span className="absolute top-3 left-3 font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">{p.category}</span>
                    <span className="absolute top-3 right-3 font-mono text-[10px] text-white/40">&apos;{String(p.year).slice(-2)}</span>
                  </div>
                  <div className="p-5 border-t border-white/10">
                    <h3 className="text-lg font-extrabold tracking-[-0.01em] mb-3">{p.name}</h3>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {p.specs.map((s) => (
                        <span key={s} className="font-mono text-[10.5px] px-2 py-1 rounded bg-white/[0.06] text-white/60 border border-white/10">{s}</span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-black" style={{ color: p.accent, textShadow: `0 0 18px ${p.accent}66` }}>€{p.price.toLocaleString("en-US")}</span>
                      <span className="font-mono text-[11px] font-bold text-white/40 group-hover:text-white transition-colors">CONFIGURE →</span>
                    </div>
                  </div>
                  <span className="absolute inset-x-0 bottom-0 h-[3px] scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" style={{ background: p.accent, boxShadow: `0 0 20px ${p.accent}` }} />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* ENGINEERED — story + stats                                        */}
      {/* ---------------------------------------------------------------- */}
      <section id="engineered" className="scroll-mt-20 max-w-[1200px] mx-auto px-6 sm:px-8 py-24 sm:py-32">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-20 items-center">
          <Reveal from="left">
            <div className="relative rounded-3xl border border-white/10 bg-[#0c0d11] p-8 sm:p-10 overflow-hidden">
              <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "28px 28px" }} aria-hidden />
              <div className="relative grid grid-cols-2 gap-6">
                {STATS.map((s) => (
                  <div key={s.label}>
                    <div className="text-3xl sm:text-4xl font-black tracking-[-0.02em]" style={{ color: NEON_LIME, textShadow: `0 0 22px ${NEON_LIME}44` }}>{s.n}</div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45 mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal from="right">
            <div>
              <p className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase text-[#ff2990] mb-3">// THE PROCESS</p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.02em] mb-6 leading-[1.05]">Designed on the water,<br />not in an office.</h2>
              <p className="text-[16px] text-white/55 leading-relaxed mb-4">Every NP7 board starts with a session. Nico rides, tests, refines — then works directly with shapers to build something that feels right. No committees, no compromises.</p>
              <p className="text-[16px] text-white/55 leading-relaxed mb-8">Pre-preg carbon layups, real-world performance, and boards that make you want to stay out longer.</p>
              <Link href="#products" className="inline-block px-7 py-4 rounded-full text-[14px] font-bold text-black bg-[#ff2990] shadow-[0_0_30px_rgba(255,41,144,0.5)] hover:-translate-y-0.5 transition-all">See the range</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* CTA                                                               */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative border-t border-white/10 py-24 overflow-hidden">
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 120%, rgba(255,41,144,0.18), transparent 60%)" }} aria-hidden />
        <div className="relative max-w-[640px] mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.02em] mb-5">Build yours.</h2>
          <p className="text-[17px] text-white/55 mb-9">Custom specs, your weight, your style. Tell us what you ride and we&apos;ll engineer it.</p>
          <Link href="#" className="inline-block px-8 py-4 rounded-full text-[14px] font-bold text-black bg-[#c2ff38] shadow-[0_0_30px_rgba(194,255,56,0.5)] hover:-translate-y-0.5 transition-all">Enquire now</Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-black py-10">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-white/40 font-mono">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="NP7 home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={NP7_LOGO} alt="NP7" className="h-5 w-auto invert opacity-70 hover:opacity-100 transition-opacity" />
            </Link>
            <span>© 2026 NP7 HARDWARE · GER-7</span>
          </div>
          <div className="flex gap-5 uppercase tracking-wider">
            <Link href="/experience" className="hover:text-[#c2ff38] transition-colors">Experience</Link>
            <Link href="#" className="hover:text-[#c2ff38] transition-colors">Instagram</Link>
            <Link href="#" className="hover:text-[#c2ff38] transition-colors">YouTube</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
