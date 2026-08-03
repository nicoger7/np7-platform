"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TEMPLATE_ORDER,
  BLOG_TEMPLATES,
  getTemplate,
  worldForTemplate,
  type BlogTemplateId,
} from "@/lib/blog-templates";
import { BlogIcon } from "@/components/blog/blog-icons";
import { BlogIntake } from "./blog-intake";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  status: string | null;
  template: string | null;
  published_at: string | null;
  updated_at: string | null;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function BlogAdminPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/admin/blog")
      .then((r) => r.json())
      .then((json) => setPosts(Array.isArray(json) ? json : []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  async function createPost(template: BlogTemplateId) {
    setCreating(true);
    const res = await fetch("/api/admin/blog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "",
        status: "draft",
        template,
        world: worldForTemplate(template),
        category: template === "standard" ? null : BLOG_TEMPLATES[template].label,
        template_data: {},
      }),
    });
    if (res.ok) {
      const post = await res.json();
      router.push(`/admin/blog/${post.id}`);
    } else {
      setCreating(false);
      setPicking(false);
    }
  }

  const filtered = posts.filter(
    (p) =>
      (p.title || "Untitled post").toLowerCase().includes(q.toLowerCase()) ||
      (p.category ?? "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="p-6 sm:p-8 max-w-[1000px] mx-auto">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold admin-heading">Magazine</h1>
          <p className="text-sm admin-muted mt-1">
            Spotguides, gear reviews, technique guides and stories for the public magazine at /blog.
            Drafts stay private until published.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2.5">
          <Link
            href="/admin/blog/notes"
            className="px-4 py-2.5 rounded-lg text-[13px] font-bold admin-border border admin-muted hover:admin-heading transition-colors"
          >
            Member notes
          </Link>
          <button
            onClick={() => setPicking(true)}
            disabled={creating}
            className="px-5 py-2.5 rounded-lg text-[13px] font-bold bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-50 transition-colors"
          >
            {creating ? "Creating…" : "+ New post"}
          </button>
        </div>
      </div>

      <div className="mt-5">
        <BlogIntake />
      </div>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search posts…"
        className="admin-input w-full sm:w-80 mb-6 px-4 py-2.5 rounded-lg border text-sm outline-none"
      />

      {loading ? (
        <p className="text-sm admin-faint">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm admin-faint">
          {posts.length === 0 ? "No posts yet — write the first one." : "No posts found."}
        </p>
      ) : (
        <div className="grid gap-2.5">
          {filtered.map((p) => {
            const tpl = getTemplate(p.template);
            return (
              <Link
                key={p.id}
                href={`/admin/blog/${p.id}`}
                className="group flex items-center justify-between gap-4 admin-surface admin-border border rounded-xl px-5 py-4 hover:border-[var(--admin-accent)] transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="font-semibold admin-heading truncate">{p.title || "Untitled post"}</span>
                    <span
                      className={`shrink-0 inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] ${
                        p.status === "published" ? "bg-green-500/15 text-green-400" : "admin-surface admin-muted"
                      }`}
                    >
                      {p.status ?? "draft"}
                    </span>
                  </div>
                  <span className="text-xs admin-faint inline-flex items-center gap-1.5 mt-0.5">
                    <BlogIcon name={tpl.icon} className="w-3.5 h-3.5" />
                    {tpl.label}
                    <span className="admin-faint">·</span>
                    {p.status === "published" ? `Published ${fmtDate(p.published_at)}` : `Edited ${fmtDate(p.updated_at)}`}
                  </span>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-bold text-[#0aa3c7] group-hover:gap-2.5 transition-all">
                  Edit post
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {picking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPicking(false)} aria-label="Close" />
          <div className="relative w-full max-w-[560px] admin-surface admin-border border rounded-2xl p-6 shadow-2xl" style={{ backgroundColor: "var(--admin-bg)" }}>
            <h2 className="text-lg font-bold admin-heading">Choose a template</h2>
            <p className="text-xs admin-muted mt-1 mb-5">Pick the kind of post — you can change it later.</p>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {TEMPLATE_ORDER.map((tid) => {
                const t = BLOG_TEMPLATES[tid];
                return (
                  <button
                    key={tid}
                    type="button"
                    disabled={creating}
                    onClick={() => createPost(tid)}
                    className="text-left rounded-xl border admin-border admin-surface p-4 hover:border-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/[0.06] disabled:opacity-50 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[#0aa3c7]"><BlogIcon name={t.icon} className="w-[18px] h-[18px]" /></span>
                      <span className="text-[13.5px] font-bold admin-heading">{t.label}</span>
                    </div>
                    <p className="text-[11.5px] admin-faint leading-snug">{t.tagline}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
