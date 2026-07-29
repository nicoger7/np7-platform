import Link from "next/link";
import type { Metadata } from "next";
import { supabase, createAdminClient } from "@/lib/supabase";
import { HardwareHeader } from "@/components/hardware/hardware-header";
import { FinSelector, type SelectorFin } from "@/components/hardware/fin-selector";
import { variantSizeCm } from "@/lib/hardware/fin-selector";
import { Reveal } from "@/components/experience/reveal";
import { NP7_LOGO } from "@/components/experience/ocean-header";
import { GRAIN, PINK, sandGrainOverlay, carbonWeave } from "@/components/hardware/theme";

export const metadata: Metadata = {
  title: { absolute: "Fins — NP7 Hardware" },
  description: "Slalom fins shaped, foiled and sanded on the bench by Nico Prien (GER-7) — and a selector that dials the right size to your board, sail and wind.",
};

export const revalidate = 60;

type FinProduct = {
  id: string;
  name: string;
  slug: string | null;
  price: number | null;
  currency: string | null;
  subtitle: string | null;
  images: string[] | null;
  selector_tuning: unknown;
};

type FinMedia = { hero: string | null; alt: string | null; focus: string | null; stats: { label: string; value: string }[] };

function FinGlyph() {
  return (
    <svg width="150" height="150" viewBox="0 0 120 120" fill="none" className="opacity-90 transition-transform duration-500 group-hover:scale-105 group-hover:-rotate-2">
      <g stroke="#141412" strokeWidth="1.6">
        <path d="M40 24 C44 22 92 30 88 40 C80 64 60 86 44 98 C40 70 38 44 40 24 Z" />
        <path d="M44 34 C56 40 70 44 80 42" strokeDasharray="2 6" opacity="0.5" />
      </g>
    </svg>
  );
}

export default async function FinsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data } = await sb
    .from("hw_products")
    .select("id,name,slug,category,price,currency,subtitle,images,selector_tuning")
    .eq("status", "published")
    .ilike("category", "%fin%")
    .order("name");
  const fins = (data ?? []) as FinProduct[];

  // size variants + page content (photos, specs) — service role, same
  // server-side pattern as the product page
  const sizesByProduct: Record<string, number[]> = {};
  const mediaByProduct: Record<string, FinMedia> = {};
  if (fins.length > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = createAdminClient() as any;
      const { data: variants } = await admin
        .from("hw_variants")
        .select("product_id,name,attributes")
        .in("product_id", fins.map((f) => f.id))
        .is("archived_at", null);
      for (const v of (variants ?? []) as { product_id: string; name: string | null; attributes: Record<string, unknown> | null }[]) {
        const cm = variantSizeCm(v.name, v.attributes);
        if (cm != null) (sizesByProduct[v.product_id] ??= []).push(cm);
      }
      for (const k of Object.keys(sizesByProduct)) sizesByProduct[k].sort((a, b) => a - b);
      const { data: contents } = await admin
        .from("hw_product_content")
        .select("product_id,tile_image,tile_focus,hero_image,hero_focus,gallery,spec_rows")
        .in("product_id", fins.map((f) => f.id));
      for (const c of (contents ?? []) as { product_id: string; tile_image: string | null; tile_focus: string | null; hero_image: string | null; hero_focus: string | null; gallery: unknown; spec_rows: unknown }[]) {
        const gallery = (Array.isArray(c.gallery) ? c.gallery : []).filter((g): g is string => typeof g === "string" && !!g);
        const stats = (Array.isArray(c.spec_rows) ? c.spec_rows : [])
          .filter((r): r is { label: string; value: string } => !!r && typeof (r as { label?: unknown }).label === "string" && typeof (r as { value?: unknown }).value === "string")
          .slice(0, 3);
        mediaByProduct[c.product_id] = {
          hero: c.tile_image || c.hero_image || null,
          alt: gallery[0] || null,
          focus: (c.tile_image ? c.tile_focus : c.tile_focus || c.hero_focus) || null,
          stats,
        };
      }
    } catch { /* variants/media stay empty — the page degrades honestly */ }
  }

  const selectorFins: SelectorFin[] = fins.map((f) => ({
    name: f.name,
    slug: f.slug,
    price: f.price != null ? Number(f.price) : null,
    sizes: sizesByProduct[f.id] ?? [],
    tuning: f.selector_tuning ?? null,
  }));

  return (
    <div className="hardware-root bg-[#0c0c0e] text-white">
      <HardwareHeader />

      {/* HERO — fresh off the bench, dust still in the air */}
      <section className="relative overflow-hidden pt-36 pb-20 sm:pt-44 sm:pb-28" style={carbonWeave}>
        {/* sanding-dust clouds drifting off the blank */}
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 60% 45% at 78% 30%, rgba(228,228,224,0.14), transparent 65%), radial-gradient(ellipse 40% 30% at 62% 75%, rgba(228,228,224,0.07), transparent 60%)" }} />
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ backgroundImage: GRAIN, opacity: 0.16 }} />
        <div className="relative max-w-[1200px] mx-auto px-6 sm:px-8">
          <p className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase mb-4" style={{ color: PINK }}>// FINS — THE QUIVER</p>
          <h1 className="text-5xl sm:text-7xl font-black tracking-[-0.03em] uppercase leading-[0.95] max-w-[720px]">
            Shaped<br />to bite.
          </h1>
          <p className="mt-6 text-[16px] sm:text-[18px] text-white/60 max-w-[520px] font-medium">
            Cut, foiled and wet-sanded on the bench — the dust barely settled. Every fin tested at GER-7 race pace before it ships.
          </p>
          <div className="mt-8">
            <a href="#selector" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-[14px] font-bold text-black hover:-translate-y-0.5 transition-all" style={{ backgroundColor: "#c6ff3a" }}>
              Find your fin →
            </a>
          </div>
          {/* disciplines — slalom rides first, the rest is in the shaping queue */}
          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <span className="px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] text-black bg-white">Slalom</span>
            <span className="px-4 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.12em] text-white/30 border border-white/12">Freerace — in the queue</span>
          </div>
        </div>
      </section>

      {/* THE RANGE — sanded primer, shop tiles from the live catalogue */}
      <section id="range" className="relative py-16 sm:py-24" style={{ background: "#e4e4e0" }}>
        <div aria-hidden className="absolute inset-0 pointer-events-none" style={sandGrainOverlay} />
        <div className="relative max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal>
            <div className="flex items-end justify-between gap-4 mb-10">
              <div>
                <p className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase text-[rgba(20,20,18,0.45)]">// SLALOM</p>
                <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.02em] uppercase text-[#141412] mt-2">The range</h2>
              </div>
              <span className="text-[12px] text-[rgba(20,20,18,0.45)]">{fins.length} fin{fins.length !== 1 ? "s" : ""}</span>
            </div>
          </Reveal>

          {fins.length === 0 ? (
            <p className="text-[15px] text-[rgba(20,20,18,0.55)]">The first fins are on the bench — check back shortly.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {fins.map((f, i) => (
                <Reveal key={f.id} delay={i * 80}>
                  <Link href={f.slug ? `/hardware/${f.slug}` : "#"} className="group block rounded-2xl overflow-hidden bg-white border border-[rgba(20,20,18,0.1)] hover:-translate-y-1 hover:shadow-[0_24px_50px_rgba(20,20,18,0.14)] transition-all">
                    <div className="relative h-[300px] grid place-items-center bg-[#efeeea] overflow-hidden">
                      <div aria-hidden className="absolute inset-0" style={{ backgroundImage: GRAIN, opacity: 0.12 }} />
                      {(() => {
                        const m = mediaByProduct[f.id];
                        const primary = (f.images && f.images[0]) || m?.hero || null;
                        if (!primary) return <FinGlyph />;
                        // one photo, gentle zoom — the stats strip is the hover payoff
                        // eslint-disable-next-line @next/next/no-img-element
                        return <img src={primary} alt={f.name} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" style={{ objectPosition: m?.focus || "center" }} />;
                      })()}
                      <span className="absolute top-4 left-4 text-[10px] font-bold tracking-[0.2em] uppercase text-[rgba(20,20,18,0.4)]">Slalom</span>
                      {/* key stats surface on hover */}
                      {(mediaByProduct[f.id]?.stats.length ?? 0) > 0 && (
                        <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-400 bg-[#141412]/88 backdrop-blur-sm px-4 py-3 grid grid-cols-3 gap-2">
                          {mediaByProduct[f.id].stats.map((s) => (
                            <div key={s.label} className="min-w-0">
                              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/45 truncate">{s.label}</p>
                              <p className="text-[12px] font-bold text-white truncate">{s.value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      <p className="text-[17px] font-black text-[#141412] tracking-[-0.01em]">{f.name}</p>
                      {f.subtitle && <p className="text-[12.5px] text-[rgba(20,20,18,0.55)] mt-0.5 line-clamp-1">{f.subtitle}</p>}
                      {(sizesByProduct[f.id]?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {sizesByProduct[f.id].map((s) => (
                            <span key={s} className="px-2 py-0.5 rounded font-mono text-[11px] font-bold text-[rgba(20,20,18,0.6)] border border-[rgba(20,20,18,0.18)]">{s}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-4">
                        <span className="text-[18px] font-black text-[#141412]">{f.price != null ? `€${Number(f.price).toLocaleString("en-US")}` : "—"}</span>
                        <span className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-[rgba(20,20,18,0.5)] group-hover:text-[#141412] transition-colors">View →</span>
                      </div>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* FIN SELECTOR — the tool bench */}
      <section id="selector" className="relative py-16 sm:py-24" style={carbonWeave}>
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal>
            <FinSelector fins={selectorFins} />
          </Reveal>
        </div>
      </section>

      {/* footer — same chrome as the rest of the hardware world */}
      <footer className="border-t border-white/10 bg-black py-10">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-white/40">
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/" aria-label="NP7 home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={NP7_LOGO} alt="NP7" className="h-5 w-auto invert opacity-70 hover:opacity-100 transition-opacity" />
            </Link>
            <span className="whitespace-nowrap">© 2026 NP7 HARDWARE · GER-7</span>
          </div>
          <div className="flex flex-wrap justify-center sm:justify-end gap-x-5 gap-y-2 uppercase tracking-wider">
            <Link href="/hardware" className="hover:text-[#c6ff3a] transition-colors">Hardware</Link>
            <Link href="/widerruf" className="text-white/70 underline underline-offset-2 hover:text-[#c6ff3a] transition-colors normal-case">Withdraw from contract</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
