import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { getPortalUser } from "@/lib/auth";
import { getCommunityAuthors, type AuthorBadge } from "@/lib/portal-data";
import { flags } from "@/lib/flags";
import { resolveSection } from "@/lib/blog-section";
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

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

type Post = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  cover_image: string | null;
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
  if (!data) return { title: "Post Not Found — NP7" };
  return {
    title: `${data.title} — NP7 Magazine`,
    description: data.excerpt || `${data.title} — stories, guides & reviews from the NP7 crew.`,
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
  const section = resolveSection((await cookies()).get("np7_section")?.value);
  const data: TemplateData = (post.template_data && typeof post.template_data === "object" ? post.template_data : {}) as TemplateData;

  const member = await getPortalUser().catch(() => null);
  const gated = post.members_only !== false && !member;

  const heroFields = fieldsForSlot(template, "hero");
  const kicker = heroFields[0] && fieldHasValue(heroFields[0], data) ? asText(data[heroFields[0].key]) : "";
  const subtitle =
    (heroFields[1] && fieldHasValue(heroFields[1], data) ? asText(data[heroFields[1].key]) : "") || post.excerpt || "";
  const chip = template.id === "standard" ? post.category || "Article" : template.label;

  const ctaUrl = asText(data.ctaUrl);
  const ctaLabel = asText(data.ctaLabel) || template.cta?.defaultLabel || "Learn more";

  // related — newest other published posts (same world first)
  const { data: relRaw } = await supabase
    .from("exp_blog_posts")
    .select("slug,title,excerpt,cover_image,template,world,category,published_at,members_only,content")
    .eq("status", "published")
    .neq("id", post.id)
    .order("published_at", { ascending: false })
    .limit(6);
  const related = ((relRaw ?? []) as unknown as CardPost[])
    .sort((a, b) => Number(b.world === post.world) - Number(a.world === post.world))
    .slice(0, 3);

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
      <SectionHeader />

      {/* ---------------------------------------------------------------- HERO */}
      <section className="relative text-white overflow-hidden" style={{ backgroundColor: theme.deep }}>
        {post.cover_image && (
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${cdnImage(post.cover_image, { width: 1600 })}')` }} />
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

      <BlogFooter section={section} showExperience={flags.showExperience} showHardware={flags.showHardware} />
    </>
  );
}
