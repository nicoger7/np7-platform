"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { effectiveCanEdit } from "@/lib/access";
import { useAccess } from "@/lib/use-access";
import { courseColor, freshness, type LearningCourse } from "@/lib/learning";

type CourseRow = LearningCourse & {
  owner_name: string | null;
  lessons: number;
  published: number;
  minutes: number;
};

const GRID = "1fr 90px 92px 110px 130px 76px";

/**
 * The author's list.
 *
 * Sorted by the course's own order rather than by staleness, because at three
 * courses a "maintenance queue" would be theatre — but the freshness dot is
 * here, using the Launch check's colour language, so a track nobody has looked
 * at since spring says so out loud instead of quietly rotting.
 */
export default function ManageCoursesPage() {
  const router = useRouter();
  const access = useAccess();
  const [rows, setRows] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const canAuthor = !!access && effectiveCanEdit(access, "/api/admin/learning/courses");

  const load = useCallback(() => {
    fetch(`/api/admin/learning/courses${showArchived ? "?archived=1" : ""}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { setRows(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [showArchived]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!newTitle.trim()) return;
    setCreating(true); setError("");
    const res = await fetch("/api/admin/learning/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    if (res.ok) {
      const c = await res.json();
      router.push(`/admin/learning/manage/${c.id}`);
      return;
    }
    setError((await res.json().catch(() => ({}))).error || "Couldn't create that course.");
    setCreating(false);
  }

  async function move(i: number, dir: -1 | 1) {
    const next = [...rows];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
    await fetch("/api/admin/learning/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "course", ids: next.map((c) => c.id) }),
    });
  }

  async function archive(c: CourseRow) {
    if (!confirm(`Archive "${c.title}"?\n\nIts lessons go with it. Nobody loses their reading history, and you can bring it back from the Archived filter.`)) return;
    const res = await fetch(`/api/admin/learning/courses/${c.id}`, { method: "DELETE" });
    if (res.ok) load(); else setError((await res.json().catch(() => ({}))).error || "Couldn't archive that.");
  }

  async function restore(c: CourseRow) {
    const res = await fetch(`/api/admin/learning/courses/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: true }),
    });
    if (res.ok) load(); else setError((await res.json().catch(() => ({}))).error || "Couldn't restore that.");
  }

  if (access && !canAuthor) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm admin-muted mb-3">You can read the Academy, but editing it isn&apos;t part of your role.</p>
        <Link href="/admin/learning" className="text-sm text-[var(--admin-accent)] font-semibold">← Back to the Academy</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <Link href="/admin/learning" className="text-xs admin-faint hover:text-[var(--admin-accent)] transition-colors">← Academy</Link>
          <h1 className="text-2xl font-bold admin-heading mt-1 mb-1">Manage courses</h1>
          <p className="text-sm admin-muted">
            Write it down once. The next time you walk somebody through something, that walk-through belongs here.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input
          className="px-3 py-2 admin-input border rounded-lg text-sm flex-1 min-w-[200px] max-w-xs"
          placeholder="New course title…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") create(); }}
        />
        <button onClick={create} disabled={!newTitle.trim() || creating} className="admin-btn admin-btn-primary">
          {creating ? "Creating…" : "Add course"}
        </button>
        <button onClick={() => setShowArchived((s) => !s)} className="admin-btn admin-btn-ghost ml-auto">
          {showArchived ? "Active courses" : "Archived"}
        </button>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-lg text-sm text-red-400" style={{ border: "1px solid var(--admin-border)" }}>{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-sm admin-faint">{showArchived ? "Nothing archived." : "No courses yet."}</p>
      ) : (
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="gap-3 px-5 py-3 admin-surface" style={{ display: "grid", gridTemplateColumns: GRID, borderBottom: "1px solid var(--admin-border)" }}>
            {["Course", "Lessons", "Status", "Owner", "Freshness", ""].map((h, i) => (
              <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>
          {rows.map((c, i) => {
            const f = freshness(c.reviewed_at, c.review_every_days);
            return (
              <div key={c.id} className="gap-3 px-5 py-3 group" style={{ display: "grid", gridTemplateColumns: GRID, borderBottom: "1px solid var(--admin-border)" }}>
                <span className="flex items-center gap-2.5 min-w-0 self-center">
                  <span className="w-1.5 h-6 rounded-full shrink-0" style={{ backgroundColor: courseColor(c.icon) }} />
                  <Link href={`/admin/learning/manage/${c.id}`} className="text-sm font-medium admin-heading truncate hover:text-[var(--admin-accent)] transition-colors">
                    {c.title}
                  </Link>
                  {c.required && <span className="admin-badge shrink-0">Path</span>}
                </span>
                <span className="text-xs admin-muted self-center">
                  {c.published}
                  {c.lessons > c.published && <span className="admin-faint"> / {c.lessons}</span>}
                </span>
                <span className={`text-xs self-center ${c.status === "published" ? "text-green-400" : "admin-faint"}`}>
                  {c.status === "published" ? "Published" : "Draft"}
                </span>
                <span className="text-xs admin-muted self-center truncate">{c.owner_name ?? "—"}</span>
                <span className="flex items-center gap-1.5 self-center min-w-0" title={f.label}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                  <span className="text-[11px] admin-faint truncate">{f.label}</span>
                </span>
                <span className="flex items-center gap-1 self-center justify-end">
                  {showArchived ? (
                    <button onClick={() => restore(c)} className="text-[11px] text-[var(--admin-accent)] font-semibold">Restore</button>
                  ) : (
                    <>
                      <button onClick={() => move(i, -1)} disabled={i === 0} className="text-xs admin-faint disabled:opacity-25 hover:text-[var(--admin-accent)]" title="Move up">↑</button>
                      <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="text-xs admin-faint disabled:opacity-25 hover:text-[var(--admin-accent)]" title="Move down">↓</button>
                      <button onClick={() => archive(c)} className="text-xs admin-faint hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" title="Archive">✕</button>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs admin-faint max-w-2xl leading-relaxed">
        Keep lessons under five minutes — the long ones are the ones nobody finishes. And write the step
        (&ldquo;open Bookings, hit Confirm&rdquo;) rather than pasting a screenshot: the admin moves, screenshots don&apos;t.
      </p>
    </div>
  );
}
