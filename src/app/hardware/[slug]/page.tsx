import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { HardwareHeader } from "@/components/hardware/hardware-header";
import { FindYourFit } from "@/components/hardware/find-your-fit";
import { EnquireForm } from "@/components/hardware/enquire-form";
import { Reveal } from "@/components/experience/reveal";
import { NP7_LOGO } from "@/components/experience/ocean-header";
import { getTemplate } from "@/lib/hardware/templates";
import type { ModuleKey } from "@/lib/hardware/templates";
import type { Product, ProductContent, SpecRow, FitSegment } from "@/lib/hardware/types";
import { HW_ACCENT } from "@/lib/hardware/types";

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
            background: `radial-gradient(ellipse at 60% 40%, ${HW_ACCENT}18, transparent 60%), #0c0c0e`,
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
              style={{ color: HW_ACCENT }}
            >
              {content.tagline}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4 mt-6">
            {price && (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black" style={{ color: HW_ACCENT }}>
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
              style={{ backgroundColor: HW_ACCENT }}
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

  return (
    <section className="py-16 sm:py-24">
      <div className="max-w-[1100px] mx-auto px-6 sm:px-8">
        <Reveal className="max-w-[760px]">
          <p
            className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase mb-3"
            style={{ color: HW_ACCENT }}
          >
            // OVERVIEW
          </p>
          <p className="text-[17px] sm:text-[19px] text-white/75 leading-relaxed whitespace-pre-line">
            {text}
          </p>
        </Reveal>
        {highlights.length > 0 && (
          <Reveal>
            <div className="flex flex-wrap gap-2 mt-8">
              {highlights.map((h) => (
                <span
                  key={h}
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white/85 px-3.5 py-1.5 rounded-full border border-white/10 bg-white/[0.06]"
                >
                  <span style={{ color: HW_ACCENT }}>✦</span>
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

  return (
    <section className="py-16 sm:py-24 border-y border-white/10 bg-[#0a0a0c]">
      <div className="max-w-[1100px] mx-auto px-6 sm:px-8">
        <Reveal>
          <p
            className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase mb-8"
            style={{ color: HW_ACCENT }}
          >
            // SPECS
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-white/[0.07] rounded-2xl overflow-hidden border border-white/10">
            {allRows.map((row) => (
              <div key={row.label} className="bg-[#0c0c0e] p-5">
                <span className="block font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/35 mb-1">
                  {row.label}
                </span>
                <span className="block text-[16px] font-extrabold text-white">{row.value}</span>
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
            className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase mb-3"
            style={{ color: HW_ACCENT }}
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

function BuyModule({ product }: { product: Product }) {
  const price = fmtPrice(product.price, product.currency ?? "EUR");
  const compareAt = fmtPrice(product.compare_at_price, product.currency ?? "EUR");
  const stockLabel =
    product.stock_count == null
      ? null
      : product.stock_count > 0
        ? `${product.stock_count} in stock`
        : "Sold out";

  return (
    <section id="buy" className="scroll-mt-20 py-20 sm:py-32 bg-[#0a0a0c] border-t border-white/10">
      <div className="max-w-[760px] mx-auto px-6 sm:px-8">
        <Reveal>
          <p
            className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase mb-3"
            style={{ color: HW_ACCENT }}
          >
            // BUY
          </p>
          <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.02em] text-white mb-6">
            {product.name}
          </h2>
          {price && (
            <div className="flex items-baseline gap-3 mb-8">
              <span className="text-4xl font-black" style={{ color: HW_ACCENT }}>
                {price}
              </span>
              {compareAt && (
                <span className="text-[17px] text-white/35 line-through">{compareAt}</span>
              )}
              {stockLabel && (
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-white/40 ml-2">
                  {stockLabel}
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-start gap-4">
            {/* Primary CTA — disabled */}
            <button
              disabled
              className="px-8 py-4 rounded-full text-[14px] font-bold text-black/60 cursor-not-allowed"
              style={{ backgroundColor: `${HW_ACCENT}55` }}
              title="Online checkout coming soon"
            >
              Checkout coming soon
            </button>

            {/* Secondary — enquire */}
            <EnquireForm productId={product.id} productName={product.name} />
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

  function renderModule(key: ModuleKey) {
    switch (key) {
      case "hero":
        return <HeroModule key="hero" product={product!} content={content} />;
      case "overview":
        return <OverviewModule key="overview" content={content} />;
      case "find_your_fit":
        return (
          <div key="find_your_fit" className="bg-[#0c0c0e] text-white">
            <FindYourFit segments={content?.find_your_fit ?? []} accent={HW_ACCENT} />
          </div>
        );
      case "specs":
        return <SpecsModule key="specs" product={product!} content={content} />;
      case "gallery":
        return <GalleryModule key="gallery" content={content} />;
      case "buy":
        return <BuyModule key="buy" product={product!} />;
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
