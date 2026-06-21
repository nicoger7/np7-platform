import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { flags } from "@/lib/flags";
import { getTemplate, worldTheme, asSpots, parseCoords } from "@/lib/blog-templates";
import { AllSpotsMap, type SpotPoint } from "@/components/blog/all-spots-map";
import { resolveSection, SECTION_CHROME } from "@/lib/blog-section";
import { SectionHeader } from "@/components/shared/section-header";
import { BlogFooter } from "@/components/blog/blog-footer";
import { BlogCard, type CardPost, fmtDate, readTime } from "@/components/blog/blog-card";

export const metadata: Metadata = {
  title: "Magazine — NP7",
  description:
    "Spotguides, gear reviews, technique guides and stories from the water — by Nico Prien (GER-7) and the NP7 crew.",
};

export const revalidate = 60;

type Props = { searchParams: Promise<{ world?: string; from?: string }> };

const TABS = [
  { key: "", label: "All" },
  { key: "experience", label: "Travel" },
  { key: "hardware", label: "Gear" },
  { key: "technique", label: "Technique" },
];

function teaser(p: CardPost) {
  if (p.excerpt) return p.excerpt;
  const plain = (p.content ?? "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/[#>*`_-]/g, "").trim();
  return plain.slice(0, 200);
}

export default async function BlogIndexPage({ searchParams }: Props) {
  const { world, from } = await searchParams;
  const activeWorld =
    world === "experience" || world === "hardware" || world === "technique" ? world : "";

  // Chrome follows the world you arrived from: the `?from=` the header link
  // carries wins, then the np7_section cookie, then the default (experience).
  const section = resolveSection(from ?? (await cookies()).get("np7_section")?.value);
  const chrome = SECTION_CHROME[section];

  let query = supabase
    .from("exp_blog_posts")
    .select("slug,title,excerpt,cover_image,template,world,category,published_at,members_only,content")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (activeWorld) query = query.eq("world", activeWorld);

  const { data } = await query;
  const posts = (data ?? []) as unknown as CardPost[];
  const [featured, ...rest] = posts;

  // Every spot from every spotguide → the "Where we ride" map (Travel tab only).
  const showMap = activeWorld === "experience";
  let spotPoints: SpotPoint[] = [];
  if (showMap) {
    const { data: sg } = await supabase
      .from("exp_blog_posts")
      .select("slug,title,template_data")
      .eq("status", "published")
      .eq("template", "spotguide");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spotPoints = ((sg ?? []) as any[]).flatMap((p) => {
      const td = (p.template_data && typeof p.template_data === "object" ? p.template_data : {}) as Record<string, unknown>;
      const region = typeof td.region === "string" ? td.region : undefined;
      const dest = typeof td.destinationName === "string" && td.destinationName ? td.destinationName : p.title;
      return asSpots(td.spots)
        .map((s): SpotPoint | null => {
          const c = parseCoords(s.coords);
          return c ? { lat: c.lat, lng: c.lng, spot: s.name || dest, title: dest, slug: p.slug, region } : null;
        })
        .filter((x): x is SpotPoint => x !== null);
    });
  }

  return (
    <>
      <SectionHeader />

      {/* ---------------------------------------------------------------- HERO */}
      <section className="relative text-white pt-16 pb-12 overflow-hidden" style={{ background: chrome.heroBackground }}>
        <div className="relative max-w-[1200px] mx-auto px-6 sm:px-8">
          <p className="text-[11px] font-bold tracking-[0.25em] mb-3" style={{ color: chrome.eyebrow }}>FROM THE WATER & THE WORKSHOP</p>
          <h1 className="text-4xl sm:text-6xl font-black tracking-[-0.03em]">The NP7 Magazine</h1>
          <span className="block h-1.5 w-28 rounded-full mt-4" style={{ background: chrome.stripe }} />
          <p className="mt-5 text-[16px] sm:text-[18px] text-white/70 max-w-[600px]">
            Spotguides, gear reviews, technique guides and stories — written between sessions by Nico and the crew.
          </p>

          {/* world filter tabs */}
          <div className="mt-8 inline-flex items-center gap-1 p-1 rounded-full bg-white/10 backdrop-blur-sm">
            {TABS.map((t) => {
              const active = activeWorld === t.key;
              return (
                <Link
                  key={t.key}
                  href={t.key ? `/blog?world=${t.key}` : "/blog"}
                  scroll={false}
                  className={`px-5 py-2 rounded-full text-[13px] font-bold transition-colors ${active ? "" : "text-white/70 hover:text-white"}`}
                  style={active ? { backgroundColor: chrome.accent, color: chrome.onAccent } : undefined}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- POSTS */}
      <section className="bg-[#fff7ec] pt-12 sm:pt-14 pb-24 min-h-[40vh]">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          {showMap && spotPoints.length > 0 && (
            <div className="mb-12">
              <div className="flex items-end justify-between gap-4 mb-4">
                <div>
                  <p className="text-[11px] font-bold tracking-[0.22em] text-[#f47b20]">WHERE WE RIDE</p>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-[-0.03em] text-[#00374a]">Every spot in the magazine</h2>
                </div>
                <span className="text-[13px] font-semibold text-[#8a9aa0] shrink-0">{spotPoints.length} spot{spotPoints.length === 1 ? "" : "s"}</span>
              </div>
              <AllSpotsMap points={spotPoints} />
            </div>
          )}
          {posts.length === 0 ? (
            <p className="text-center text-[#5a6b72] py-20">No stories here yet — check back soon.</p>
          ) : (
            <>
              {/* featured — newest in this filter */}
              <FeaturedCard post={featured} />

              {rest.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
                  {rest.map((p) => <BlogCard key={p.slug} post={p} />)}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <BlogFooter section={section} showExperience={flags.showExperience} showHardware={flags.showHardware} />
    </>
  );
}

function FeaturedCard({ post }: { post: CardPost }) {
  const tpl = getTemplate(post.template);
  const theme = worldTheme(post.world);
  const chip = tpl.id === "standard" ? post.category || "Article" : tpl.label;

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group grid md:grid-cols-2 bg-white rounded-[22px] overflow-hidden border border-[#f0e6d6] hover:-translate-y-1.5 hover:shadow-[0_24px_50px_rgba(0,55,74,0.12)] transition-all duration-300"
    >
      <div
        className="relative h-[260px] md:h-full min-h-[320px] bg-[#e9eef0] bg-cover bg-center overflow-hidden"
        style={{ backgroundImage: post.cover_image ? `url('${post.cover_image}')` : `linear-gradient(160deg, ${theme.accent}, ${theme.deep})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        <span className="absolute top-4 left-4 text-[11px] font-bold px-3 py-1.5 rounded-full backdrop-blur-md" style={{ backgroundColor: "rgba(255,255,255,0.9)", color: theme.accentInk }}>
          {chip}
        </span>
      </div>
      <div className="p-8 sm:p-10 flex flex-col justify-center">
        <p className="text-[12px] font-semibold mb-2.5" style={{ color: theme.accent }}>
          {fmtDate(post.published_at)} · {readTime(post.content)} read
        </p>
        <h2 className="text-2xl sm:text-[32px] font-black tracking-[-0.02em] leading-[1.12] text-[#00374a] mb-4 group-hover:opacity-80 transition-opacity">
          {post.title}
        </h2>
        <p className="text-[15px] text-[#6a7a80] leading-relaxed line-clamp-3 mb-6">{teaser(post)}</p>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-bold transition-all group-hover:gap-2.5" style={{ color: theme.accent }}>
          Read the story
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </span>
      </div>
    </Link>
  );
}
