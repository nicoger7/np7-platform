import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { getPortalUser } from "@/lib/auth";
import { getCommunityAuthors, type AuthorBadge } from "@/lib/portal-data";
import { flags } from "@/lib/flags";
import { cdnImage } from "@/lib/img";
import {
  getTemplate,
  worldTheme,
  fieldsForSlot,
  fieldHasValue,
  asText,
  type TemplateData,
} from "@/lib/blog-templates";
import { SectionHeader } from "@/components/shared/section-header";
import { BlogFooter } from "@/components/blog/blog-footer";
import { BlogCard, type CardPost, fmtDate, readTime } from "@/components/blog/blog-card";
import { PostFacts } from "@/components/blog/post-facts";
import { PostBlocks } from "@/components/blog/post-blocks";
import { GuideNotes } from "@/components/blog/guide-notes";
import { type SpotNote } from "@/components/blog/spots-accordion";
import { PostBody, splitForTeaser } from "@/components/blog/post-body";
import { SignupGate } from "@/components/blog/signup-gate";
import { jsonLdScript } from "@/lib/json-ld";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

/**
 * Prerender the freely-readable posts so they serve from the CDN instead of
 * costing a full server render per hit (they were `no-store` in production —
 * `revalidate` above was dead code because the render always reached a request
 * API). Admin writes call revalidatePath, so publishing is still immediate.
 *
 * Members-only posts are LEFT OUT, and must stay out — a gated render belongs
 * to one reader and would otherwise land in the shared cache. But leaving them
 * out does NOT make them dynamic, which an earlier comment here claimed: with
 * `dynamicParams` at its default an unlisted slug still renders through the
 * STATIC path, and the conditional `getPortalUser()` below (it reads cookies)
 * bails that render out to `revalidate: 0`, which Next turns into a thrown
 * "Page changed from static to dynamic at runtime" — a 500, not a per-request
 * render. /spotguide/proposed/[slug] is the shape that works: a separate,
 * force-dynamic route for the reader-specific variant. It has never fired only
 * because the single gated post published so far carries the legacy `spotguide`
 * template, and that redirects out below before the read — the next gated post
 * on any other template 500s.
 */
export async function generateStaticParams() {
  const { data } = await supabase
    .from("exp_blog_posts")
    .select("slug, template")
    .eq("status", "published")
    .eq("members_only", false);
  return ((data ?? []) as { slug: string; template: string | null }[])
    // the legacy spotguide template redirects to /spotguide/… — nothing to cache
    .filter((p) => p.slug && p.template !== "spotguide")
    .map((p) => ({ slug: p.slug }));
}

type Post = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  cover_image: string | null;
  cover_focus?: string | null;
  category: string | null;
  author: string | null;
  template: string | null;
  template_data: TemplateData | null;
  world: string | null;
  members_only: boolean | null;
  published_at: string | null;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data: raw } = await supabase
    .from("exp_blog_posts").select("*")
    .eq("slug", slug).eq("status", "published").maybeSingle();
  const data = raw as unknown as Post | null;
  if (!data) return { title: "Post not found" };
  const description = data.excerpt || `${data.title} — stories, guides & reviews from the NP7 crew.`;
  return {
    // bare title — the root layout template appends "· NP7"
    title: data.title,
    description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: "article",
      title: data.title,
      description,
      url: `/blog/${slug}`,
      ...(data.published_at ? { publishedTime: data.published_at } : {}),
      ...(data.cover_image ? { images: [{ url: data.cover_image, alt: data.title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: data.title,
      description,
      ...(data.cover_image ? { images: [data.cover_image] } : {}),
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const { data: raw } = await supabase
    .from("exp_blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  const post = raw as unknown as Post | null;
  if (!post) notFound();

  const template = getTemplate(post.template);
  const theme = worldTheme(post.world);
  const data: TemplateData = (post.template_data && typeof post.template_data === "object" ? post.template_data : {}) as TemplateData;

  // The old magazine spotguide template is superseded by the structured /spotguide
  // section — send these to the real destination page so there's ONE spotguide.
  if (post.template === "spotguide") {
    const dn = asText(data.destinationName);
    const slug = dn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    redirect(slug ? `/spotguide/${slug}` : "/spotguide");
  }

  // Only a gated post needs to know WHO is reading. Resolving the member on a
  // free post read cookies() for a value the gate below can never use
  // (`members_only === false` ⇒ never gated), and that one call opted every
  // post out of ISR. Skipping it is what makes the free posts cacheable — and
  // keeping it for gated posts is what keeps THEM out of the shared cache.
  const member = post.members_only === false ? null : await getPortalUser().catch(() => null);
  const gated = post.members_only !== false && !member;

  const heroFields = fieldsForSlot(template, "hero");
  const kicker = heroFields[0] && fieldHasValue(heroFields[0], data) ? asText(data[heroFields[0].key]) : "";
  const subtitle =
    (heroFields[1] && fieldHasValue(heroFields[1], data) ? asText(data[heroFields[1].key]) : "") || post.excerpt || "";
  const chip = post.category?.trim() || (template.id === "standard" ? "Article" : template.label);

  const ctaUrl = asText(data.ctaUrl);
  const ctaLabel = asText(data.ctaLabel) || template.cta?.defaultLabel || "Learn more";

  // related — newest other published posts (same world first)
  const REL_COLS = "slug,title,excerpt,cover_image,template,world,category,published_at,members_only,content";
  const fetchRelated = (cols: string) =>
    supabase.from("exp_blog_posts").select(cols).eq("status", "published").neq("id", post.id).order("published_at", { ascending: false }).limit(6);
  // cover_focus ships with migration 071 — fall back until applied
  let { data: relRaw } = await fetchRelated(REL_COLS + ",cover_focus");
  if (!relRaw) ({ data: relRaw } = await fetchRelated(REL_COLS));
  // topical first: same category beats same world beats recency — the reader
  // who just finished a gear piece wants more gear, not whatever's newest
  const related = ((relRaw ?? []) as unknown as CardPost[])
    .sort((a, b) =>
      (Number(b.category === post.category) - Number(a.category === post.category)) ||
      (Number(b.world === post.world) - Number(a.world === post.world)))
    .slice(0, 3);

  // Topic cluster: if this article talks about a destination we cover, link
  // its spotguide page right under the story (readers get the next step;
  // Google sees the article ↔ destination cluster).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allDests } = await (supabase as any).from("destinations")
    .select("name, slug, region, country").eq("spotguide_status", "published");
  const hay = `${post.title ?? ""} ${post.excerpt ?? ""} ${typeof post.content === "string" ? post.content : ""}`.toLowerCase();
  const clusterDest = ((allDests ?? []) as { name: string; slug: string; region: string | null; country: string | null }[])
    .find((d) => d.name && d.name.length > 3 && hay.includes(d.name.toLowerCase())) ?? null;

  const teaserSplit = splitForTeaser(post.content ?? "", 2);

  // approved member notes for this post, grouped by spot name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: noteRows } = await (supabase as any)
    .from("exp_blog_spot_notes")
    .select("spot_name, author_name, body, contact_id")
    .eq("blog_post_id", post.id)
    .eq("status", "approved")
    .order("created_at", { ascending: true });
  type NoteRow = { spot_name: string; author_name: string | null; body: string; contact_id: string | null };
  const rows = (noteRows ?? []) as NoteRow[];
  // enrich with the author's opted-in community profile (service-role projection)
  const authors: Record<string, AuthorBadge> = await getCommunityAuthors(rows.map((n) => n.contact_id), "spot_notes").catch(() => ({}));
  const notesBySpot: Record<string, SpotNote[]> = {};
  for (const n of rows) {
    const a = n.contact_id ? authors[n.contact_id] : undefined;
    (notesBySpot[n.spot_name] ??= []).push({
      author_name: n.author_name, body: n.body,
      displayName: a?.displayName ?? null, username: a?.username ?? null, avatarUrl: a?.avatarUrl ?? null, initials: a?.initials ?? null,
      level: a?.level ?? null, levelVerified: a?.levelVerified ?? false, skills: a?.skills ?? [],
    });
  }

  return (
    <>
      {/* Article schema — authorship is the E-E-A-T signal (Nico = real pro athlete) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            description: post.excerpt ?? undefined,
            image: post.cover_image ?? undefined,
            datePublished: post.published_at ?? undefined,
            mainEntityOfPage: `https://www.np-seven.com/blog/${post.slug}`,
            author: {
              "@type": "Person",
              name: post.author || "Nico Prien",
              url: "https://nicoprien.com",
              sameAs: [
                "https://nicoprien.com",
                "https://www.youtube.com/@Nico_GER7",
                "https://www.instagram.com/nico_ger7/",
              ],
            },
            publisher: {
              "@type": "Organization",
              name: "NP7",
              url: "https://www.np-seven.com",
              logo: { "@type": "ImageObject", url: "https://www.np-seven.com/icons/favicon-96.png" },
            },
          }),
        }}
      />
      <SectionHeader />

      {/* ---------------------------------------------------------------- HERO */}
      <section className="relative text-white overflow-hidden" style={{ backgroundColor: theme.deep }}>
        {post.cover_image && (
          <div className="absolute inset-0 bg-cover" style={{ backgroundImage: `url('${cdnImage(post.cover_image, { width: 1600 })}')`, backgroundPosition: post.cover_focus || "center" }} />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: post.cover_image
              ? `linear-gradient(to top, ${theme.deep} 6%, ${theme.deep}d9 45%, ${theme.deep}73 100%)`
              : `radial-gradient(120% 90% at 50% -10%, ${theme.accent}33, transparent 60%)`,
          }}
        />
        <div className="relative max-w-[800px] mx-auto px-6 sm:px-8 pt-28 pb-14 sm:pt-32 sm:pb-16">
          <Link href="/blog" className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-white/70 hover:text-white transition-colors mb-6">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
            All stories
          </Link>

          <div className="flex items-center gap-2.5 mb-4">
            <span className="text-[11px] font-bold px-3 py-1.5 rounded-full" style={{ backgroundColor: theme.accent, color: theme.accentInk }}>
              {chip}
            </span>
            {kicker && <span className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-white/70">{kicker}</span>}
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] leading-[1.05] drop-shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
            {post.title}
          </h1>
          {subtitle && <p className="mt-4 text-[17px] sm:text-[20px] text-white/85 font-medium leading-relaxed max-w-[640px]">{subtitle}</p>}

          <p className="mt-6 text-[13px] font-semibold text-white/65">
            {post.author || "NP7 Crew"} · {fmtDate(post.published_at)} · {readTime(post.content)} read
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- BODY */}
      <article className="bg-white">
        <div className="max-w-[760px] mx-auto px-6 sm:px-8 pb-4">
          <PostFacts template={template} theme={theme} data={data} />

          {/* lead — always public */}
          {post.excerpt && (
            <p className="text-[19px] sm:text-[21px] font-medium text-[#00374a]/85 leading-relaxed mb-9">
              {post.excerpt}
            </p>
          )}

          {gated ? (
            <>
              <div className="relative max-h-[420px] overflow-hidden">
                <PostBody content={teaserSplit.teaser} />
              </div>
              <SignupGate accent={theme.accent} />
            </>
          ) : (
            <div className="space-y-12 pb-16">
              {post.content && <PostBody content={post.content} />}
              <PostBlocks template={template} theme={theme} data={data} slug={slug} notesBySpot={notesBySpot} />

              <GuideNotes blogPostId={post.id} slug={slug} accent={theme.accent} />

              {ctaUrl && (
                <div className="rounded-3xl p-8 sm:p-10 text-center text-white" style={{ background: `linear-gradient(160deg, ${theme.accent}, ${theme.deep})` }}>
                  <Link
                    href={ctaUrl}
                    className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-[14px] font-bold bg-white transition-all hover:-translate-y-0.5"
                    style={{ color: theme.accentInk }}
                  >
                    {ctaLabel}
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </article>

      {/* ------------------------------------------------- TOPIC CLUSTER LINK */}
      {clusterDest && (
        <section className="max-w-[760px] mx-auto px-6 sm:px-8 pb-14 -mt-2">
          <Link href={`/spotguide/${clusterDest.slug}`}
            className="group flex items-center justify-between gap-4 rounded-2xl border border-[#e6ddca] bg-white px-6 py-5 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(0,55,74,0.10)] transition-all">
            <div>
              <p className="text-[10.5px] font-black uppercase tracking-[0.18em] text-[#b0791e]">In the Spotguide</p>
              <p className="text-[17px] font-black text-[#00374a] mt-0.5">{clusterDest.name}</p>
              <p className="text-[12.5px] font-semibold text-[#6a7a80]">{[clusterDest.region, clusterDest.country].filter(Boolean).join(", ")} — conditions, season, spots &amp; local tips</p>
            </div>
            <span className="shrink-0 text-[#00afdb] font-black group-hover:translate-x-0.5 transition-transform">→</span>
          </Link>
        </section>
      )}

      {/* ---------------------------------------------------------------- MORE */}
      {related.length > 0 && (
        <section className="bg-[#fff7ec] py-16 sm:py-20 border-t border-[#ece3d3]">
          <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
            <div className="flex items-end justify-between gap-4 mb-8">
              <h2 className="text-2xl sm:text-3xl font-black tracking-[-0.03em] text-[#00374a]">More stories</h2>
              <Link href="/blog" className="shrink-0 text-[13px] font-bold transition-colors" style={{ color: theme.accent }}>All stories →</Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {related.map((p) => <BlogCard key={p.slug} post={p} />)}
            </div>
          </div>
        </section>
      )}

      {/* the footer's own background comes from a server-picked section; the
          wrapper lets the browser's world win instead (section-world.tsx) */}
      <div className="np7-section-footer">
        <BlogFooter showExperience={flags.showExperience} showHardware={flags.showHardware} />
      </div>
    </>
  );
}
