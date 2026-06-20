import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { OceanHeader } from "@/components/experience/ocean-header";
import { OceanFooter } from "@/components/experience/ocean-footer";
import { Reveal } from "@/components/experience/reveal";
import { PostBody } from "@/components/experience/post-body";

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
  published_at: string | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function readTime(content: string | null) {
  const words = (content ?? "").split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 220))} min read`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  // select("*") keeps this tolerant of the excerpt column not existing yet
  const { data: raw } = await supabase
    .from("exp_blog_posts").select("*")
    .eq("slug", slug).eq("status", "published").maybeSingle();
  const data = raw as unknown as Post | null;
  if (!data) return { title: "Post Not Found — NP7 Experience" };
  return {
    title: `${data.title} — NP7 Experience`,
    description: data.excerpt || `${data.title} — stories from the water by the NP7 crew.`,
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

  const { data: relatedRaw } = await supabase
    .from("exp_blog_posts")
    .select("id,title,slug,cover_image,category,published_at")
    .eq("status", "published")
    .neq("id", post.id)
    .order("published_at", { ascending: false })
    .limit(3);
  const related = (relatedRaw ?? []) as unknown as Post[];

  return (
    <>
      <OceanHeader bookHref="/experience#experiences" />

      {/* ---------------------------------------------------------------- */}
      {/* HERO                                                              */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative bg-[#00374a] text-white overflow-hidden">
        {post.cover_image && (
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${post.cover_image}')` }} />
        )}
        <div className={`absolute inset-0 ${post.cover_image ? "bg-gradient-to-t from-[#00374a] via-[#00374a]/55 to-[#00374a]/35" : "opacity-[0.05]"}`}
          style={post.cover_image ? undefined : { backgroundImage: "radial-gradient(circle at 20% 30%, #8fe6f2 0, transparent 40%), radial-gradient(circle at 80% 70%, #00afdb 0, transparent 45%)" }}
        />
        <div className="relative max-w-[840px] mx-auto px-6 sm:px-8 pt-36 pb-16 sm:pb-20">
          <Link href="/experience/blog" className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-white/70 hover:text-white transition-colors mb-6">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
            All stories
          </Link>
          {post.category && (
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#8fe6f2] uppercase mb-3">{post.category}</p>
          )}
          <h1 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] leading-[1.05] drop-shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
            {post.title}
          </h1>
          <p className="mt-5 text-[13.5px] font-semibold text-white/75">
            {post.author || "NP7 Crew"} · {fmtDate(post.published_at)} · {readTime(post.content)}
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* BODY                                                              */}
      {/* ---------------------------------------------------------------- */}
      <article className="bg-white py-14 sm:py-20">
        <div className="max-w-[720px] mx-auto px-6 sm:px-8">
          {post.excerpt && (
            <p className="text-[18px] sm:text-[20px] font-medium text-[#00374a]/80 leading-relaxed mb-8">
              {post.excerpt}
            </p>
          )}
          <PostBody content={post.content ?? ""} />
        </div>
      </article>

      {/* ---------------------------------------------------------------- */}
      {/* CTA — ride it yourself                                            */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative py-20 sm:py-24 text-white overflow-hidden" style={{ background: "linear-gradient(165deg,#00afdb,#00374a)" }}>
        <div className="max-w-[720px] mx-auto px-6 sm:px-8 text-center">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] mb-4 leading-[1.1]">Don&apos;t just read about it.</h2>
            <p className="text-[16px] text-white/75 leading-relaxed max-w-[480px] mx-auto">
              Join Nico and the crew on the water — coaching, community and everything arranged.
            </p>
            <Link href="/experience#experiences" className="inline-block mt-8 px-8 py-4 rounded-full text-[14px] font-bold text-[#00374a] bg-white hover:-translate-y-0.5 transition-all">
              Find your trip
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* MORE STORIES                                                      */}
      {/* ---------------------------------------------------------------- */}
      {related.length > 0 && (
        <section className="bg-[#fff7ec] py-16 sm:py-20">
          <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
            <Reveal className="flex items-end justify-between gap-4 mb-8">
              <h2 className="text-2xl sm:text-3xl font-black tracking-[-0.03em] text-[#00374a]">More stories</h2>
              <Link href="/experience/blog" className="shrink-0 text-[13px] font-bold text-[#00afdb] hover:underline">All stories →</Link>
            </Reveal>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {related.map((p, i) => (
                <Reveal key={p.id} delay={i * 90} as="article">
                  <Link
                    href={`/experience/blog/${p.slug}`}
                    className="group block bg-white rounded-[18px] overflow-hidden border border-[#f0e6d6] hover:-translate-y-1.5 hover:shadow-[0_24px_50px_rgba(0,55,74,0.12)] transition-all duration-300 h-full"
                  >
                    <div
                      className="relative h-[160px] bg-[#e9eef0] bg-cover bg-center"
                      style={{ backgroundImage: p.cover_image ? `url('${p.cover_image}')` : "linear-gradient(160deg,#00afdb,#00374a)" }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
                    </div>
                    <div className="p-5">
                      <p className="text-[11.5px] font-semibold text-[#00afdb] mb-1">{fmtDate(p.published_at)}</p>
                      <h3 className="text-[17px] font-extrabold tracking-[-0.01em] text-[#00374a] group-hover:text-[#00afdb] transition-colors">
                        {p.title}
                      </h3>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <OceanFooter />
    </>
  );
}
