import Link from "next/link";
import { getTemplate, worldTheme } from "@/lib/blog-templates";
import { cdnImage } from "@/lib/img";

export type CardPost = {
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image: string | null;
  template: string | null;
  world: string | null;
  category: string | null;
  published_at: string | null;
  members_only?: boolean | null;
  content?: string | null;
};

export function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function readTime(content: string | null | undefined) {
  const words = (content ?? "").split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 220))} min`;
}

function teaser(p: CardPost) {
  if (p.excerpt) return p.excerpt;
  const plain = (p.content ?? "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/[#>*`_-]/g, "").trim();
  return plain.slice(0, 150);
}

/** Standard blog grid card. Template chip + cover, tinted by the post's world. */
export function BlogCard({ post }: { post: CardPost }) {
  const tpl = getTemplate(post.template);
  const theme = worldTheme(post.world);
  const chip = tpl.id === "standard" ? post.category || "Article" : tpl.label;

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group block bg-white rounded-[18px] overflow-hidden border border-[#f0e6d6] hover:-translate-y-1.5 hover:shadow-[0_24px_50px_rgba(0,55,74,0.12)] transition-all duration-300 h-full"
    >
      <div
        className="relative h-[200px] bg-[#e9eef0] bg-cover bg-center overflow-hidden"
        style={{ backgroundImage: post.cover_image ? `url('${cdnImage(post.cover_image, { width: 800 })}')` : `linear-gradient(160deg, ${theme.accent}, ${theme.deep})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
        <span
          className="absolute top-3 left-3 inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full backdrop-blur-md"
          style={{ backgroundColor: "rgba(255,255,255,0.9)", color: theme.accentInk }}
        >
          {chip}
        </span>
        {post.members_only && (
          <span className="absolute top-3 right-3 grid place-items-center w-7 h-7 rounded-full bg-black/35 text-white backdrop-blur-md" title="Members">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          </span>
        )}
      </div>
      <div className="p-6">
        <p className="text-[12px] font-semibold mb-1.5" style={{ color: theme.accent }}>
          {fmtDate(post.published_at)} · {readTime(post.content)} read
        </p>
        <h3 className="text-xl font-extrabold tracking-[-0.02em] text-[#00374a] mb-2.5 group-hover:opacity-80 transition-opacity">
          {post.title}
        </h3>
        <p className="text-[14px] text-[#6a7a80] leading-relaxed line-clamp-2">{teaser(post)}</p>
      </div>
    </Link>
  );
}
