"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GUIDE_NOTE_SCOPE } from "@/lib/blog-templates";

type Note = {
  id: string;
  spot_name: string;
  author_name: string | null;
  body: string;
  status: string;
  created_at: string | null;
  exp_blog_posts: { title: string; slug: string } | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function SpotNotesAdminPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "all">("pending");

  useEffect(() => {
    let active = true;
    const q = filter === "all" ? "" : `?status=${filter}`;
    fetch(`/api/admin/spot-notes${q}`)
      .then((r) => r.json())
      .then((j) => { if (active) { setNotes(Array.isArray(j) ? j : []); setLoading(false); } })
      .catch(() => { if (active) { setNotes([]); setLoading(false); } });
    return () => { active = false; };
  }, [filter]);

  async function reload() {
    const q = filter === "all" ? "" : `?status=${filter}`;
    const j = await fetch(`/api/admin/spot-notes${q}`).then((r) => r.json()).catch(() => []);
    setNotes(Array.isArray(j) ? j : []);
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/admin/spot-notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setNotes((ns) => ns.filter((n) => n.id !== id || filter === "all"));
    if (filter === "all") reload();
  }
  async function remove(id: string) {
    if (!confirm("Delete this note?")) return;
    await fetch(`/api/admin/spot-notes/${id}`, { method: "DELETE" });
    setNotes((ns) => ns.filter((n) => n.id !== id));
  }

  return (
    <div className="p-6 sm:p-8 max-w-[860px] mx-auto">
      <Link href="/admin/blog" className="text-xs admin-faint hover:admin-heading">← Magazine</Link>
      <h1 className="text-2xl font-bold admin-heading mt-1">Member notes</h1>
      <p className="text-sm admin-muted mt-1">
        Tips members submitted on guides — either on a specific spotguide spot, or as a guide-wide
        “Community tip” (shown as “Whole guide”). Approve to publish them (shown attributed), or reject.
        To fold a tip into the official guide, edit the post and reject the note.
      </p>

      <div className="flex gap-1.5 mt-5 mb-6">
        {(["pending", "approved", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold border transition-colors ${
              filter === f ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] border-[var(--admin-accent)]" : "admin-border admin-muted hover:admin-heading"
            }`}
          >
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm admin-faint">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm admin-faint">No {filter === "all" ? "" : filter} notes.</p>
      ) : (
        <div className="grid gap-2.5">
          {notes.map((n) => (
            <div key={n.id} className="admin-surface admin-border border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1.5 text-xs admin-faint">
                <span className="font-bold admin-muted">{n.author_name || "Member"}</span>
                <span>·</span>
                <span>{n.spot_name === GUIDE_NOTE_SCOPE ? "Whole guide" : n.spot_name}</span>
                <span>·</span>
                <span>{n.exp_blog_posts?.title ?? "—"}</span>
                <span>·</span>
                <span>{fmtDate(n.created_at)}</span>
                <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-bold uppercase ${n.status === "approved" ? "bg-green-500/15 text-green-400" : n.status === "rejected" ? "bg-red-500/15 text-red-400" : "admin-surface admin-muted"}`}>{n.status}</span>
              </div>
              <p className="text-sm admin-heading leading-relaxed whitespace-pre-line">{n.body}</p>
              <div className="flex items-center gap-2 mt-3">
                {n.status !== "approved" && (
                  <button onClick={() => setStatus(n.id, "approved")} className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors">Approve</button>
                )}
                {n.status !== "rejected" && (
                  <button onClick={() => setStatus(n.id, "rejected")} className="px-3 py-1.5 rounded-lg text-[12px] font-bold admin-border border admin-muted hover:admin-heading transition-colors">Reject</button>
                )}
                <button onClick={() => remove(n.id)} className="ml-auto text-[12px] font-semibold text-red-400 hover:underline">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
