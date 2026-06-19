"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  category: string | null;
  status: string | null;
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
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/admin/blog")
      .then((r) => r.json())
      .then((json) => setPosts(Array.isArray(json) ? json : []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  async function createPost() {
    setCreating(true);
    const res = await fetch("/api/admin/blog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", slug: `untitled-${Date.now()}`, status: "draft" }),
    });
    if (res.ok) {
      const post = await res.json();
      router.push(`/admin/blog/${post.id}`);
    } else {
      setCreating(false);
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
          <h1 className="text-2xl font-bold admin-heading">Blog</h1>
          <p className="text-sm admin-muted mt-1">
            Stories, guides and trip reports for the public blog at /experience/blog.
            Drafts stay private until published.
          </p>
        </div>
        <button
          onClick={createPost}
          disabled={creating}
          className="shrink-0 px-5 py-2.5 rounded-lg text-[13px] font-bold bg-[#0aa3c7] text-white hover:bg-[#0aa3c7]/90 disabled:opacity-50 transition-colors"
        >
          {creating ? "Creating…" : "+ New post"}
        </button>
      </div>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search posts…"
        className="admin-input w-full sm:w-80 mt-5 mb-6 px-4 py-2.5 rounded-lg border text-sm outline-none"
      />

      {loading ? (
        <p className="text-sm admin-faint">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm admin-faint">
          {posts.length === 0 ? "No posts yet — write the first one." : "No posts found."}
        </p>
      ) : (
        <div className="grid gap-2.5">
          {filtered.map((p) => (
            <Link
              key={p.id}
              href={`/admin/blog/${p.id}`}
              className="group flex items-center justify-between gap-4 admin-surface admin-border border rounded-xl px-5 py-4 hover:border-[#0aa3c7] transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold admin-heading truncate">
                    {p.title || "Untitled post"}
                  </span>
                  <span
                    className={`shrink-0 inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] ${
                      p.status === "published"
                        ? "bg-green-500/15 text-green-400"
                        : "admin-surface admin-muted"
                    }`}
                  >
                    {p.status ?? "draft"}
                  </span>
                </div>
                <span className="text-xs admin-faint">
                  {p.category ? `${p.category} · ` : ""}
                  {p.status === "published" ? `Published ${fmtDate(p.published_at)}` : `Edited ${fmtDate(p.updated_at)}`}
                </span>
              </div>
              <span className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-bold text-[#0aa3c7] group-hover:gap-2.5 transition-all">
                Edit post
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
