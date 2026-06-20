import Link from "next/link";
import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { OceanHeader } from "@/components/experience/ocean-header";
import { OceanFooter } from "@/components/experience/ocean-footer";
import { WaveDivider } from "@/components/experience/wave-divider";
import { Reveal } from "@/components/experience/reveal";

export const metadata: Metadata = {
  title: "Blog — NP7 Experience",
  description:
    "Trip reports, technique tips and stories from the water — by Nico Prien (GER-7) and the NP7 crew.",
};

export const revalidate = 60;

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

function teaser(post: Post) {
  if (post.excerpt) return post.excerpt;
  // fall back to the first paragraph-ish chunk of the body, stripped of markdown
  const plain = (post.content ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/[#>*`_-]/g, "")
    .trim();
  return plain.slice(0, 180);
}

export default async function BlogIndexPage() {
  const { data } = await supabase
    .from("exp_blog_posts")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  const posts = (data ?? []) as unknown as Post[];
  const [featured, ...rest] = posts;

  return (
    <>
      <OceanHeader bookHref="/experience#experiences" />

      {/* ---------------------------------------------------------------- */}
      {/* HERO — deep ocean strip                                           */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative bg-[#00374a] text-white pt-36 pb-16 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, #8fe6f2 0, transparent 40%), radial-gradient(circle at 80% 70%, #00afdb 0, transparent 45%)" }} />
        <div className="relative max-w-[1200px] mx-auto px-6 sm:px-8">
          <Reveal>
            <p className="text-[11px] font-bold tracking-[0.25em] text-[#8fe6f2] mb-3">FROM THE WATER</p>
            <h1 className="text-4xl sm:text-6xl font-black tracking-[-0.03em]">The NP7 Blog</h1>
            <p className="mt-4 text-[16px] sm:text-[18px] text-white/70 max-w-[560px]">
              Trip reports, technique tips and stories from the crew — written between sessions.
            </p>
          </Reveal>
        </div>
      </section>

      <WaveDivider topColor="#fff7ec" bottomColor="#00374a" />

      {/* ---------------------------------------------------------------- */}
      {/* POSTS                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="bg-[#fff7ec] pt-4 pb-24">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-8">
          {posts.length === 0 ? (
            <p className="text-center text-[#5a6b72] py-20">Stories are being written — check back soon.</p>
          ) : (
            <>
              {/* featured — newest post */}
              <Reveal>
                <Link
                  href={`/experience/blog/${featured.slug}`}
                  className="group grid md:grid-cols-2 bg-white rounded-[22px] overflow-hidden border border-[#f0e6d6] hover:-translate-y-1.5 hover:shadow-[0_24px_50px_rgba(0,55,74,0.12)] transition-all duration-300 mb-12"
                >
                  <div
                    className="relative h-[260px] md:h-full min-h-[300px] bg-[#e9eef0] bg-cover bg-center overflow-hidden"
                    style={{ backgroundImage: featured.cover_image ? `url('${featured.cover_image}')` : "linear-gradient(160deg,#00afdb,#00374a)" }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    {featured.category && (
                      <span className="absolute top-4 left-4 text-[11px] font-bold px-3 py-1.5 rounded-full bg-white/85 text-[#00374a] backdrop-blur-md">
                        {featured.category}
                      </span>
                    )}
                  </div>
                  <div className="p-8 sm:p-10 flex flex-col justify-center">
                    <p className="text-[12px] font-semibold text-[#00afdb] mb-2.5">
                      {fmtDate(featured.published_at)} · {readTime(featured.content)}
                    </p>
                    <h2 className="text-2xl sm:text-[32px] font-black tracking-[-0.02em] leading-[1.12] text-[#00374a] mb-4 group-hover:text-[#00afdb] transition-colors">
                      {featured.title}
                    </h2>
                    <p className="text-[15px] text-[#6a7a80] leading-relaxed line-clamp-3 mb-6">{teaser(featured)}</p>
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#00afdb] group-hover:gap-2.5 transition-all">
                      Read the story
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </span>
                  </div>
                </Link>
              </Reveal>

              {/* the rest */}
              {rest.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {rest.map((post, i) => (
                    <Reveal key={post.id} delay={(i % 3) * 90} as="article">
                      <Link
                        href={`/experience/blog/${post.slug}`}
                        className="group block bg-white rounded-[18px] overflow-hidden border border-[#f0e6d6] hover:-translate-y-1.5 hover:shadow-[0_24px_50px_rgba(0,55,74,0.12)] transition-all duration-300 h-full"
                      >
                        <div
                          className="relative h-[200px] bg-[#e9eef0] bg-cover bg-center overflow-hidden"
                          style={{ backgroundImage: post.cover_image ? `url('${post.cover_image}')` : "linear-gradient(160deg,#00afdb,#00374a)" }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
                          {post.category && (
                            <span className="absolute top-3 left-3 text-[11px] font-bold px-3 py-1.5 rounded-full bg-white/85 text-[#00374a] backdrop-blur-md">
                              {post.category}
                            </span>
                          )}
                        </div>
                        <div className="p-6">
                          <p className="text-[12px] font-semibold text-[#00afdb] mb-1.5">
                            {fmtDate(post.published_at)} · {readTime(post.content)}
                          </p>
                          <h3 className="text-xl font-extrabold tracking-[-0.02em] text-[#00374a] mb-2.5 group-hover:text-[#00afdb] transition-colors">
                            {post.title}
                          </h3>
                          <p className="text-[14px] text-[#6a7a80] leading-relaxed line-clamp-2">{teaser(post)}</p>
                        </div>
                      </Link>
                    </Reveal>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <OceanFooter />
    </>
  );
}
