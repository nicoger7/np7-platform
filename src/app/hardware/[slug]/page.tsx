import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabase, createAdminClient } from "@/lib/supabase";
import { HardwareHeader } from "@/components/hardware/hardware-header";
import { BuyBox, type BuyVariant } from "@/components/hardware/buy-box";
import { FindYourFit } from "@/components/hardware/find-your-fit";
import { EnquireForm } from "@/components/hardware/enquire-form";
import { Reveal } from "@/components/experience/reveal";
import { NP7_LOGO } from "@/components/experience/ocean-header";
import { getTemplate } from "@/lib/hardware/templates";
import type { ModuleKey } from "@/lib/hardware/templates";
import type { Product, ProductContent, SpecRow, FitSegment } from "@/lib/hardware/types";
import { LIME, PINK, BONE, INK, INK_SOFT, SAND, SAND_DEEP, sandGrainOverlay } from "@/components/hardware/theme";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data } = await sb
    .from("hw_products")
    .select("name,description")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!data) return { title: { absolute: "Product not found — NP7 Hardware" } };
  return {
    title: { absolute: `${data.name} — NP7 Hardware` },
    description: data.description ?? `${data.name} — custom windsurf hardware by NP7`,
  };
}

function fmtPrice(price: number | null, currency: string): string | null {
  if (price == null) return null;
  const symbol = currency === "EUR" || !currency ? "€" : `${currency} `;
  return `${symbol}${price.toLocaleString("en-US")}`;
}

/* ─── Module components (server-renderable, defined locally) ─── */

function HeroModule({
  product,
  content,
}: {
  product: Product;
  content: ProductContent | null;
}) {
  const heroImg =
    content?.hero_image?.trim() ||
    (product.images && product.images[0]) ||
    null;

  const price = fmtPrice(product.price, product.currency ?? "EUR");
  const compareAt = fmtPrice(product.compare_at_price, product.currency ?? "EUR");

  return (
    <section className="relative min-h-[82vh] flex items-end bg-[#0c0c0e] overflow-hidden">
      {heroImg ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center scale-105"
            style={{ backgroundImage: `url('${heroImg}')` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0e] via-black/40 to-black/20" />
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 60% 40%, ${PINK}16, transparent 60%), #0c0c0e`,
          }}
        />
      )}
      <div className="relative w-full max-w-[1200px] mx-auto px-6 sm:px-8 pb-16 pt-32">
        <Reveal from="up">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-white/50">
              {product.category}
            </span>
            {product.year && (
              <span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-white/35">
                · {product.year}
              </span>
            )}
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white leading-[0.96] tracking-[-0.03em] mb-3 max-w-[800px]">
            {product.name}
          </h1>
          {product.subtitle && (
            <p className="text-[17px] sm:text-[19px] text-white/60 mb-4 max-w-[620px]">
              {product.subtitle}
            </p>
          )}
          {content?.tagline && (
            <p
              className="text-[15px] font-bold mb-6 max-w-[560px]"
              style={{ color: PINK }}
            >
              {content.tagline}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4 mt-6">
            {price && (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black" style={{ color: BONE }}>
                  {price}
                </span>
                {compareAt && (
                  <span className="text-[15px] text-white/35 line-through">{compareAt}</span>
                )}
              </div>
            )}
            <a
              href="#buy"
              className="px-7 py-3.5 rounded-full text-[14px] font-bold text-black hover:-translate-y-0.5 transition-all"
              style={{ backgroundColor: LIME }}
            >
              Buy / Enquire
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function OverviewModule({ content }: { content: ProductContent | null }) {
  const text = content?.overview?.trim();
  if (!text) return null;
  const highlights = (content?.highlights ?? []).filter((h) => h?.trim());

  // Bright "sanded blank" break in the carbon — rough grain, ink type, pink heat.
  return (
    <section className="relative py-16 sm:py-24" style={{ backgroundColor: SAND, color: INK }}>
      <div className="absolute inset-0 pointer-events-none" style={sandGrainOverlay} aria-hidden />
      <div className="relative max-w-[1100px] mx-auto px-6 sm:px-8">
        <Reveal className="max-w-[760px]">
          <p
            className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase mb-3"
            style={{ color: PINK }}
          >
            // OVERVIEW
          </p>
          <p className="text-[17px] sm:text-[19px] leading-relaxed whitespace-pre-line" style={{ color: INK_SOFT }}>
            {text}
          </p>
        </Reveal>
        {highlights.length > 0 && (
          <Reveal>
            <div className="flex flex-wrap gap-2 mt-8">
              {highlights.map((h) => (
                <span
                  key={h}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-bold px-3.5 py-1.5 rounded-full"
                  style={{ border: "1px solid rgba(22,21,16,0.18)", backgroundColor: "rgba(255,255,255,0.5)", color: INK }}
                >
                  <span style={{ color: PINK }}>✦</span>
                  {h}
                </span>
              ))}
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}

function SpecsModule({
  product,
  content,
}: {
  product: Product;
  content: ProductContent | null;
}) {
  const specRows: SpecRow[] = content?.spec_rows ?? [];
  if (specRows.length === 0 && !product.category && !product.year) return null;

  // Augment with product meta if not already present
  const allRows: SpecRow[] = [...specRows];
  const hasCategory = allRows.some((r) => r.label.toLowerCase() === "category");
  const hasYear = allRows.some((r) => r.label.toLowerCase() === "year");
  if (!hasCategory && product.category) allRows.unshift({ label: "Category", value: product.category });
  if (!hasYear && product.year) allRows.push({ label: "Year", value: String(product.year) });

  if (allRows.length === 0) return null;

  // Sand bench, carbon plates: bright rough ground, dark data cells.
  return (
    <section className="relative py-16 sm:py-24" style={{ backgroundColor: SAND_DEEP, color: INK }}>
      <div className="absolute inset-0 pointer-events-none" style={sandGrainOverlay} aria-hidden />
      <div className="relative max-w-[1100px] mx-auto px-6 sm:px-8">
        <Reveal>
          <p
            className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase mb-8"
            style={{ color: PINK }}
          >
            // SPECS
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px rounded-2xl overflow-hidden"
            style={{ backgroundColor: "rgba(22,21,16,0.25)", border: "1px solid rgba(22,21,16,0.3)" }}>
            {allRows.map((row) => (
              <div key={row.label} className="bg-[#0c0c0e] p-5">
                <span className="block font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/35 mb-1">
                  {row.label}
                </span>
                <span className="block text-[16px] font-extrabold" style={{ color: BONE }}>{row.value}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function GalleryModule({ content }: { content: ProductContent | null }) {
  const imgs = (content?.gallery ?? []).filter(Boolean);
  if (imgs.length === 0) return null;

  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
        <Reveal className="mb-10">
          <p
            className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase mb-3 text-white/40"
          >
            // GALLERY
          </p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.02em] text-white">
            In the water
          </h2>
        </Reveal>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {imgs.map((src, i) => (
            <Reveal key={i} delay={(i % 4) * 70} className={i % 5 === 0 ? "col-span-2 row-span-2" : ""}>
              <div
                className="aspect-square bg-cover bg-center rounded-2xl hover:opacity-90 transition-opacity"
                style={{ backgroundImage: `url('${src}')` }}
              />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function BuyModule({ product, buyVariants, productAvailable, image }: { product: Product; buyVariants: BuyVariant[]; productAvailable: number; image: string | null }) {
  const price = fmtPrice(product.price, product.currency ?? "EUR");
  const compareAt = fmtPrice(product.compare_at_price, product.currency ?? "EUR");
  // copy adapts to the product type — no "board" wording on a fin
  const noun = /fin/i.test(product.category ?? "") ? "fin" : "board";

  return (
    <section id="buy" className="scroll-mt-20 relative py-20 sm:py-32 bg-[#0a0a0c] border-t border-white/10 overflow-hidden">
      {/* the fade — heat rising into the buy moment */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 30% 130%, ${PINK}1f, transparent 55%), radial-gradient(ellipse at 85% 140%, rgba(255,59,48,0.10), transparent 50%)` }} aria-hidden />
      <div className="relative max-w-[760px] mx-auto px-6 sm:px-8">
        <Reveal>
          <p
            className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase mb-3 text-white/40"
          >
            // BUY
          </p>
          <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.02em] text-white mb-6">
            {product.name}
          </h2>
          {price && (
            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-4xl font-black" style={{ color: BONE }}>
                {price}
              </span>
              {compareAt && (
                <span className="text-[17px] text-white/35 line-through">{compareAt}</span>
              )}
            </div>
          )}

          {/* Real add-to-cart — sizes, honest ledger availability, cart + checkout */}
          <BuyBox
            productId={product.id}
            slug={product.slug}
            name={product.name}
            currency={product.currency ?? "EUR"}
            price={product.price}
            variants={buyVariants}
            productAvailable={productAvailable}
            image={image}
            noun={noun}
          />

          <div className="mt-8">
            {/* Secondary — enquire */}
            <EnquireForm productId={product.id} productName={product.name} noun={noun} />
          </div>

          <p className="text-[13px] text-white/35 mt-5">
            Have questions? Use the enquiry form above — we respond within 24 hours.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ─── Page ─── */

export default async function HardwareProductPage({ params }: Props) {
  const { slug } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const { data: productRaw } = await sb
    .from("hw_products")
    .select("id,name,slug,subtitle,category,template,price,compare_at_price,currency,sku,stock_count,description,images,specs,status,year")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  const product = productRaw as Product | null;
  if (!product) notFound();

  // Fetch content resiliently — missing table/row is treated as empty content
  let content: ProductContent | null = null;
  try {
    const { data: rawContent } = await sb
      .from("hw_product_content")
      .select("hero_image,hero_video_url,gallery,tagline,overview,highlights,spec_rows,find_your_fit")
      .eq("product_id", product.id)
      .maybeSingle();

    if (rawContent) {
      content = {
        hero_image: rawContent.hero_image ?? null,
        hero_video_url: rawContent.hero_video_url ?? null,
        gallery: Array.isArray(rawContent.gallery) ? rawContent.gallery : [],
        tagline: rawContent.tagline ?? null,
        overview: rawContent.overview ?? null,
        highlights: Array.isArray(rawContent.highlights) ? rawContent.highlights : [],
        spec_rows: Array.isArray(rawContent.spec_rows) ? (rawContent.spec_rows as SpecRow[]) : [],
        find_your_fit: Array.isArray(rawContent.find_your_fit)
          ? (rawContent.find_your_fit as FitSegment[])
          : [],
      };
    }
  } catch {
    // table not yet created — degrade gracefully
  }

  const template = getTemplate(product.template);

  // Variants + honest availability from the stock ledger (service client —
  // RLS keeps these tables closed to the anon key). Sellable = HQ + 3PL.
  let buyVariants: BuyVariant[] = [];
  let productAvailable = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const [{ data: variants }, { data: locs }] = await Promise.all([
      admin.from("hw_variants").select("id,name,sku,rrp,lifecycle,archived_at,sort_order")
        .eq("product_id", product.id).is("archived_at", null).order("sort_order").order("name"),
      admin.from("hw_stock_locations").select("id,code").in("code", ["HQ", "3PL"]),
    ]);
    const sellableIds = (locs ?? []).map((l: { id: string }) => l.id);
    const variantIds = (variants ?? []).map((v: { id: string }) => v.id);
    const { data: levels } = variantIds.length
      ? await admin.from("hw_stock_levels").select("variant_id,location_id,on_hand,reserved").in("variant_id", variantIds)
      : { data: [] };
    const availableOf = (variantId: string) => (levels ?? [])
      .filter((lv: { variant_id: string; location_id: string }) => lv.variant_id === variantId && sellableIds.includes(lv.location_id))
      .reduce((a: number, lv: { on_hand: number; reserved: number }) => a + lv.on_hand - lv.reserved, 0);
    buyVariants = ((variants ?? []) as { id: string; name: string; sku: string; rrp: number | null; lifecycle: string }[])
      .filter((v) => !["discontinued"].includes(v.lifecycle))
      .map((v) => ({ id: v.id, name: v.name, sku: v.sku, price: v.rrp ?? product.price ?? 0, available: availableOf(v.id) }));
  } catch { /* ledger not reachable — BuyBox falls back to sold-out + enquiry */ }

  function renderModule(key: ModuleKey) {
    switch (key) {
      case "hero":
        return <HeroModule key="hero" product={product!} content={content} />;
      case "overview":
        return <OverviewModule key="overview" content={content} />;
      case "find_your_fit":
        return (
          <div key="find_your_fit" className="bg-[#0c0c0e] text-white">
            <FindYourFit segments={content?.find_your_fit ?? []} accent={LIME} />
          </div>
        );
      case "specs":
        return <SpecsModule key="specs" product={product!} content={content} />;
      case "gallery":
        return <GalleryModule key="gallery" content={content} />;
      case "buy":
        return <BuyModule key="buy" product={product!} buyVariants={buyVariants} productAvailable={productAvailable}
          image={content?.hero_image?.trim() || product!.images?.[0] || null} />;
      default:
        return null;
    }
  }

  return (
    <div className="hardware-root bg-[#0c0c0e] text-white">
      <HardwareHeader />

      {template.modules.map(renderModule)}

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black py-10">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-white/40 font-mono">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="NP7 home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={NP7_LOGO} alt="NP7" className="h-5 w-auto invert opacity-70 hover:opacity-100 transition-opacity" />
            </Link>
            <span>© 2026 NP7 HARDWARE · GER-7</span>
            <Link href="/widerruf" className="text-white/70 underline underline-offset-2 hover:text-[#c6ff3a] transition-colors normal-case">Vertrag widerrufen</Link>
          </div>
          <div className="flex items-center gap-5 uppercase tracking-wider">
            <Link href="/hardware" className="hover:text-[#c6ff3a] transition-colors">
              ← All products
            </Link>
            <Link href="/experience" className="hover:text-[#c6ff3a] transition-colors">
              Experience
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
