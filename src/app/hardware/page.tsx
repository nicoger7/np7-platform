import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { WorkshopHero } from "@/components/hardware/workshop-hero";
import { HardwareHeader } from "@/components/hardware/hardware-header";
import { NP7_LOGO } from "@/components/experience/ocean-header";
import { Reveal } from "@/components/experience/reveal";

export const metadata: Metadata = {
  title: "NP7 Hardware — Custom Windsurf Boards & Fins",
  description:
    "Custom windsurf boards and fins, shaped on the bench by Nico Prien (GER-7). Carbon, hand-finished, built to ride.",
};

export const revalidate = 60;

const PINK = "#ff2e88";
const LIME = "#c6ff3a";

type Product = {
  name: string;
  slug: string | null;
  category: string;
  type: "board" | "fin";
  price: number;
  specs: string[];
  accent: string;
  stock?: string;
};

/* placeholder catalogue — wired to hw_products when populated. Boards & fins only. */
const FALLBACK_PRODUCTS: Product[] = [
  { name: "NP7 Freeride 120", slug: null, category: "Board", type: "board", price: 2490, specs: ["120 L", "247 cm", "Carbon"], accent: LIME, stock: "In stock" },
  { name: "NP7 Slalom 110", slug: null, category: "Board", type: "board", price: 2990, specs: ["110 L", "227 cm", "Pre-preg"], accent: PINK, stock: "Made to order" },
  { name: "NP7 Wave 92", slug: null, category: "Board", type: "board", price: 2690, specs: ["92 L", "228 cm", "Carbon"], accent: LIME, stock: "In stock" },
  { name: "Slalom Fin 38", slug: null, category: "Fin", type: "fin", price: 189, specs: ["38 cm", "Tuttle", "G10"], accent: PINK, stock: "In stock" },
  { name: "Wave Fin 22", slug: null, category: "Fin", type: "fin", price: 119, specs: ["22 cm", "US Box"], accent: LIME, stock: "In stock" },
  { name: "Weed Fin 30", slug: null, category: "Fin", type: "fin", price: 149, specs: ["30 cm", "Power Box"], accent: PINK, stock: "In stock" },
];

const CATEGORIES = [
  { name: "Boards", tag: "Freeride · Slalom · Wave", accent: LIME },
  { name: "Fins", tag: "Slalom · Wave · Weed", accent: PINK },
  { name: "Custom", tag: "Shaped to your specs", accent: "#ffae3a" },
];

const STATS = [
  { n: "Hand", label: "Shaped on the bench" },
  { n: "Carbon", label: "Pre-preg layups" },
  { n: "GER-7", label: "Tested by Nico" },
  { n: "1-of-1", label: "Custom builds" },
];

const MARQUEE = "CUSTOM SHAPED · CARBON · HAND-FINISHED · FINS & BOARDS · MADE IN GERMANY · GER-7 · ";

function BoardGlyph({ accent }: { accent: string }) {
  return (
    <svg width="118" height="118" viewBox="0 0 120 120" fill="none" className="opacity-90 transition-transform duration-500 group-hover:scale-105">
      <g stroke={accent} strokeWidth="1.6">
        <path d="M60 10 C42 38 38 80 60 110 C82 80 78 38 60 10 Z" />
        <line x1="60" y1="24" x2="60" y2="98" strokeDasharray="2 6" opacity="0.5" />
        <line x1="50" y1="74" x2="70" y2="74" opacity="0.45" />
      </g>
    </svg>
  );
}
function FinGlyph({ accent }: { accent: string }) {
  return (
    <svg width="118" height="118" viewBox="0 0 120 120" fill="none" className="opacity-90 transition-transform duration-500 group-hover:scale-105">
      <g stroke={accent} strokeWidth="1.6">
        <path d="M40 24 C44 22 92 30 88 40 C80 64 60 86 44 98 C40 70 38 44 40 24 Z" />
        <path d="M44 34 C56 40 70 44 80 42" strokeDasharray="2 6" opacity="0.5" />
      </g>
    </svg>
  );
}

export default async function HardwarePage() {
  const { data } = await supabase
    .from("hw_products")
    .select("name,slug,category,price,year,specs")
    .eq("status", "published");

  const dbProducts = (data ?? []) as Array<{ name: string; slug: string | null; category: string | null; price: number | null; specs: unknown }>;
  const products: Product[] =
    dbProducts.length > 0
      ? dbProducts.map((p, i) => ({
          name: p.name,
          slug: p.slug ?? null,
          category: p.category ?? "Board",
          type: /fin/i.test(p.category ?? "") ? "fin" : "board",
          price: p.price ?? 0,
          specs: Array.isArray(p.specs) ? (p.specs as string[]).slice(0, 3) : [],
          accent: i % 2 === 0 ? LIME : PINK,
        }))
      : FALLBACK_PRODUCTS;

  return (
    <div className="bg-[#0c0c0e] text-white">
      <HardwareHeader />

      {/* HERO — workshop */}
      <WorkshopHero>
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
          <Reveal from="none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={NP7_LOGO} alt="NP7" className="h-11 sm:h-14 w-auto invert opacity-95 mb-5" style={{ filter: "invert(1) drop-shadow(0 4px 18px rgba(0,0,0,0.6))" }} />
          </Reveal>
          <Reveal from="up" delay={100}>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-[-0.03em] uppercase" style={{ textShadow: "0 4px 30px rgba(0,0,0,0.6)" }}>
              Hardware
            </h1>
          </Reveal>
          {/* veredelung stripe */}
          <Reveal from="none" delay={150}>
            <div className="flex items-center gap-1.5 mt-4 mb-6">
              <span className="h-1.5 w-16 rounded-full" style={{ background: LIME, boxShadow: `0 0 14px ${LIME}` }} />
              <span className="h-1.5 w-6 rounded-full" style={{ background: PINK, boxShadow: `0 0 14px ${PINK}` }} />
            </div>
          </Reveal>
          <Reveal from="up" delay={200}>
            <p className="text-[16px] sm:text-[19px] text-white/65 max-w-[520px] font-medium">
              Custom windsurf boards &amp; fins — shaped on the bench by Nico Prien, finished by hand.
            </p>
          </Reveal>
          <Reveal from="up" delay={280}>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="#products" className="px-7 py-4 rounded-full text-[14px] font-bold text-black bg-[#c6ff3a] hover:-translate-y-0.5 transition-all">
                Shop the range
              </Link>
              <Link href="#workshop" className="px-7 py-4 rounded-full text-[14px] font-bold text-white border border-white/25 hover:border-white/60 transition-all">
                Inside the workshop
              </Link>
            </div>
          </Reveal>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/35 animate-bounce">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </div>
        </div>
      </WorkshopHero>

      {/* MARQUEE */}
      <div className="relative overflow-hidden border-y border-white/10 bg-black py-3">
        <div className="marquee-track whitespace-nowrap font-mono text-[12.5px] font-bold tracking-[0.22em] uppercase text-white/55">
          {[0, 1].map((k) => (<span key={k}>{MARQUEE.repeat(3)}</span>))}
        </div>
        <style>{`@keyframes mq{from{transform:translateX(0)}to{transform:translateX(-50%)}}.marquee-track{display:inline-block;animation:mq 34s linear infinite}@media (prefers-reduced-motion:reduce){.marquee-track{animation:none}}`}</style>
      </div>

      {/* CATEGORIES */}
      <section className="max-w-[1200px] mx-auto px-6 sm:px-8 py-20 sm:py-28">
        <Reveal className="mb-12">
          <p className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase text-white/40 mb-3">// THE RANGE</p>
          <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.02em]">Boards &amp; fins</h2>
        </Reveal>
        <div className="grid sm:grid-cols-3 gap-5">
          {CATEGORIES.map((c, i) => (
            <Reveal key={c.name} delay={i * 90}>
              <Link href="#products" className="group relative block rounded-2xl border border-white/10 bg-[#141416] p-8 h-[200px] overflow-hidden hover:border-white/25 transition-colors">
                <span className="absolute -bottom-7 -right-2 text-[120px] font-black leading-none opacity-[0.05] select-none" aria-hidden>{i + 1}</span>
                <div className="relative">
                  <span className="block w-10 h-1 rounded-full mb-5" style={{ background: c.accent }} />
                  <h3 className="text-2xl font-black tracking-[-0.01em]">{c.name}</h3>
                  <p className="font-mono text-[12px] text-white/45 mt-2">{c.tag}</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* PRODUCTS — shop + showcase */}
      <section id="products" className="scroll-mt-20 relative py-20 sm:py-28 border-y border-white/10 bg-[#0a0a0c]">
        <div className="absolute inset-0 opacity-[0.5]" style={{ backgroundImage: "repeating-linear-gradient(45deg,rgba(255,255,255,0.02) 0 2px,transparent 2px 8px)" }} aria-hidden />
        <div className="relative max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal className="flex items-end justify-between mb-12 gap-4">
            <div>
              <p className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase text-white/40 mb-3">// SHOP</p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.02em]">The range</h2>
            </div>
            <span className="font-mono text-[12px] text-white/40 hidden sm:block">{products.length} products</span>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {products.map((p, i) => {
              const cardInner = (
                <div className="group relative rounded-2xl border border-white/10 bg-[#141416] overflow-hidden hover:-translate-y-1 transition-all duration-300 h-full">
                  <div className="relative h-44 grid place-items-center bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.05),transparent_70%)]">
                    {p.type === "fin" ? <FinGlyph accent={p.accent} /> : <BoardGlyph accent={p.accent} />}
                    <span className="absolute top-3 left-3 font-mono text-[10px] uppercase tracking-[0.15em] text-white/40">{p.category}</span>
                    {p.stock && <span className="absolute top-3 right-3 font-mono text-[10px] text-white/35">{p.stock}</span>}
                  </div>
                  <div className="p-5 border-t border-white/10">
                    <h3 className="text-lg font-extrabold tracking-[-0.01em] mb-3">{p.name}</h3>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {p.specs.map((s) => (
                        <span key={s} className="font-mono text-[10.5px] px-2 py-1 rounded bg-white/[0.05] text-white/55 border border-white/10">{s}</span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-black" style={{ color: p.accent }}>€{p.price.toLocaleString("en-US")}</span>
                      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-white/45 group-hover:text-white transition-colors">
                        VIEW
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </span>
                    </div>
                  </div>
                  <span className="absolute inset-x-0 bottom-0 h-[2px] scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" style={{ background: p.accent }} />
                </div>
              );
              return (
                <Reveal key={p.name} delay={(i % 3) * 80} as="article">
                  {p.slug ? (
                    <Link href={`/hardware/${p.slug}`} className="block h-full">
                      {cardInner}
                    </Link>
                  ) : (
                    cardInner
                  )}
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* WORKSHOP story */}
      <section id="workshop" className="scroll-mt-20 max-w-[1200px] mx-auto px-6 sm:px-8 py-24 sm:py-32">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-20 items-center">
          <Reveal from="left">
            <div className="relative rounded-3xl border border-white/10 bg-[#121214] p-8 sm:p-10 overflow-hidden">
              <div className="absolute inset-0 opacity-[0.5]" style={{ backgroundImage: "repeating-linear-gradient(45deg,rgba(255,255,255,0.025) 0 2px,transparent 2px 8px),repeating-linear-gradient(-45deg,rgba(255,255,255,0.025) 0 2px,transparent 2px 8px)" }} aria-hidden />
              <div className="relative grid grid-cols-2 gap-6">
                {STATS.map((s) => (
                  <div key={s.label}>
                    <div className="text-3xl sm:text-4xl font-black tracking-[-0.02em]" style={{ color: LIME }}>{s.n}</div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-white/45 mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal from="right">
            <div>
              <p className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase text-white/40 mb-3">// THE WORKSHOP</p>
              <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.02em] mb-6 leading-[1.05]">Shaped on the bench.<br />Not stamped in a mould.</h2>
              <p className="text-[16px] text-white/55 leading-relaxed mb-4">Every NP7 board and fin starts with a session and a sketch. Nico rides, tests and refines, then shapes and hand-finishes each piece — carbon dust, sweat and all.</p>
              <p className="text-[16px] text-white/55 leading-relaxed mb-8">Raw performance, finished with the details that make it yours. No committees, no compromises.</p>
              <Link href="#products" className="inline-block px-7 py-4 rounded-full text-[14px] font-bold text-black bg-[#c6ff3a] hover:-translate-y-0.5 transition-all">Shop the range</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CUSTOM CTA */}
      <section className="relative border-t border-white/10 py-24 overflow-hidden bg-[#0a0a0c]">
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 120%, rgba(255,46,136,0.12), transparent 60%)" }} aria-hidden />
        <div className="relative max-w-[640px] mx-auto px-6 text-center">
          <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.02em] mb-5">Build yours.</h2>
          <p className="text-[17px] text-white/55 mb-9">Your weight, your style, your spots. Tell us how you ride and we&apos;ll shape it.</p>
          <Link href="#" className="inline-block px-8 py-4 rounded-full text-[14px] font-bold text-black bg-[#c6ff3a] hover:-translate-y-0.5 transition-all">Start a custom build</Link>
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
            <Link href="/experience" className="hover:text-[#c6ff3a] transition-colors">Experience</Link>
            <Link href="#" className="hover:text-[#c6ff3a] transition-colors">Instagram</Link>
            <Link href="#" className="hover:text-[#c6ff3a] transition-colors">YouTube</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
