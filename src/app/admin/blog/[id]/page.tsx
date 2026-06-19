"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ImagePickerModal from "@/components/image-picker-modal";

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function BlogEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState(false);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [category, setCategory] = useState("");
  const [author, setAuthor] = useState("Nico Prien");
  const [coverImage, setCoverImage] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/blog/${id}`)
      .then((r) => r.json())
      .then((p) => {
        if (!p || p.error) return;
        setTitle(p.title ?? "");
        setSlug(p.slug ?? "");
        // Freeze the slug once a post is published (its URL is live — a later
        // title edit must not silently change it) or once it's been hand-edited.
        setSlugTouched(
          p.status === "published" ||
            (Boolean(p.slug) && !p.slug.startsWith("untitled-") && p.slug !== slugify(p.title ?? ""))
        );
        setCategory(p.category ?? "");
        setAuthor(p.author ?? "Nico Prien");
        setCoverImage(p.cover_image ?? "");
        setExcerpt(p.excerpt ?? "");
        setContent(p.content ?? "");
        setStatus(p.status === "published" ? "published" : "draft");
        setPublishedAt(p.published_at ?? null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  function onTitleChange(value: string) {
    setTitle(value);
    // Never re-derive the slug for a published post — that would break its live
    // URL. Auto-sync only applies to untouched drafts.
    if (!slugTouched && status !== "published") setSlug(slugify(value));
  }

  async function save(nextStatus?: "draft" | "published") {
    const effectiveStatus = nextStatus ?? status;
    setSaving(true);
    setError("");
    setSaved(false);
    const effectivePublishedAt =
      effectiveStatus === "published" && !publishedAt ? new Date().toISOString() : publishedAt;
    const res = await fetch(`/api/admin/blog/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        slug: slug || slugify(title) || `untitled-${Date.now()}`,
        category: category || null,
        author,
        cover_image: coverImage || null,
        excerpt: excerpt || null,
        content,
        status: effectiveStatus,
        published_at: effectivePublishedAt,
      }),
    });
    if (res.ok) {
      const p = await res.json();
      setStatus(effectiveStatus);
      setPublishedAt(p.published_at ?? effectivePublishedAt);
      setSlug(p.slug ?? slug);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to save");
    }
    setSaving(false);
  }

  async function remove() {
    if (!confirm("Delete this post? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/blog/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/admin/blog");
    else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to delete");
    }
  }

  if (loading) return <div className="p-8 text-sm admin-faint">Loading…</div>;

  return (
    <div className="p-6 sm:p-8 max-w-[860px] mx-auto pb-28">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Link href="/admin/blog" className="text-xs admin-faint hover:admin-heading">← Blog</Link>
          <h1 className="text-2xl font-bold admin-heading mt-1">{title || "Untitled post"}</h1>
          <p className="text-sm admin-muted mt-0.5">
            {status === "published" ? "Live on the public blog" : "Draft · not visible publicly"}
          </p>
        </div>
        {status === "published" && slug && (
          <Link href={`/experience/blog/${slug}`} target="_blank" className="shrink-0 text-[12px] font-semibold text-[#0aa3c7] hover:underline">View live ↗</Link>
        )}
      </div>

      <div className="space-y-7">
        <Section title="Title">
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="e.g. Five days of flat water — the Bonaire trip report"
            className="admin-input w-full px-4 py-3 rounded-lg border text-[16px] font-semibold outline-none"
          />
        </Section>

        <Section title="Slug" hint="The post URL. Generated from the title — edit to override.">
          <div className="flex items-center gap-2">
            <span className="text-[13px] admin-faint shrink-0">/experience/blog/</span>
            <input
              value={slug}
              onChange={(e) => {
                setSlug(slugify(e.target.value) || e.target.value);
                setSlugTouched(true);
              }}
              placeholder="post-slug"
              className="admin-input flex-1 px-3 py-2 rounded-md border text-sm outline-none font-mono"
            />
            <button
              type="button"
              onClick={() => {
                setSlug(slugify(title));
                setSlugTouched(false);
              }}
              className="shrink-0 px-3 py-2 rounded-md text-[12px] font-semibold admin-border border admin-muted hover:admin-heading transition-colors"
            >
              ↻ From title
            </button>
          </div>
        </Section>

        <div className="grid sm:grid-cols-2 gap-5">
          <Section title="Category" hint="e.g. Trip report, Technique, Gear, News.">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Trip report"
              className="admin-input w-full px-4 py-2.5 rounded-lg border text-sm outline-none"
            />
          </Section>
          <Section title="Author">
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="admin-input w-full px-4 py-2.5 rounded-lg border text-sm outline-none"
            />
          </Section>
        </div>

        <Section title="Cover image" hint="Used on the blog index card and as the post hero.">
          {coverImage ? (
            <div className="relative aspect-[21/9] rounded-xl overflow-hidden admin-border border max-w-[480px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverImage} alt="" className="w-full h-full object-cover" />
              <div className="absolute top-2 right-2 flex gap-1.5">
                <button onClick={() => setPicker(true)} className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-black/60 text-white hover:bg-black/80">Change</button>
                <button onClick={() => setCoverImage("")} className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-black/60 text-white hover:bg-red-500">Remove</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPicker(true)}
              className="aspect-[21/9] max-w-[480px] w-full rounded-xl border-2 border-dashed admin-border grid place-items-center admin-muted hover:admin-heading hover:border-[#0aa3c7] transition-colors"
            >
              <span className="flex flex-col items-center gap-1.5 text-[13px] font-semibold">
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>
                Choose image
              </span>
            </button>
          )}
        </Section>

        <Section title="Excerpt" hint="Short teaser for the blog index and search engines. 1–2 sentences.">
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            rows={3}
            placeholder="What this post is about, in a sentence or two…"
            className="admin-input w-full px-4 py-3 rounded-lg border text-sm outline-none resize-y"
          />
        </Section>

        <Section
          title="Content"
          hint="Markdown supported: ## heading, ### subheading, **bold**, *italic*, [link](https://…), ![photo](image-url), - bullet list, 1. numbered list, > quote, --- divider. Blank line starts a new paragraph."
        >
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={22}
            placeholder={"The week started with 25 knots…\n\n## Day one\n\nWe rigged early and…"}
            className="admin-input w-full px-4 py-3 rounded-lg border text-sm outline-none resize-y leading-relaxed"
          />
        </Section>

        <Section title="Danger zone">
          <button
            onClick={remove}
            className="px-4 py-2 rounded-lg text-[12px] font-bold border border-red-400/40 text-red-400 hover:bg-red-500/10 transition-colors"
          >
            Delete post
          </button>
        </Section>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 admin-surface border-t admin-border">
        <div className="max-w-[860px] mx-auto px-6 sm:px-8 py-3 flex items-center justify-end gap-3">
          {error && <span className="text-[13px] text-red-400 mr-auto">{error}</span>}
          {saved && <span className="text-[13px] text-green-400 mr-auto">Saved ✓</span>}
          {status === "published" ? (
            <button
              onClick={() => save("draft")}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg text-[13px] font-bold admin-border border admin-muted hover:admin-heading disabled:opacity-50 transition-colors"
            >
              Unpublish
            </button>
          ) : (
            <button
              onClick={() => save("published")}
              disabled={saving}
              className="px-5 py-2.5 rounded-lg text-[13px] font-bold border border-[#0aa3c7]/50 text-[#0aa3c7] hover:bg-[#0aa3c7]/10 disabled:opacity-50 transition-colors"
            >
              Publish
            </button>
          )}
          <button
            onClick={() => save()}
            disabled={saving}
            className="px-6 py-2.5 rounded-lg text-[13px] font-bold bg-[#0aa3c7] text-white hover:bg-[#0aa3c7]/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : status === "published" ? "Save & update" : "Save draft"}
          </button>
        </div>
      </div>

      {picker && (
        <ImagePickerModal
          onSelect={(url) => {
            setCoverImage(url);
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[15px] font-bold admin-heading">{title}</h2>
      {hint ? <p className="text-xs admin-faint mb-3 mt-0.5">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}
