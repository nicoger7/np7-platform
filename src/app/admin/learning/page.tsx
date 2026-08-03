"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { effectiveCanEdit } from "@/lib/access";
import { useAccess } from "@/lib/use-access";
import { courseColor, courseProgress, readingTime, type CourseCard } from "@/lib/learning";

type Payload = { member: { id: string; name: string }; courses: CourseCard[] };

/**
 * The academy's front door.
 *
 * One screen, three things on it: what you still have to read, everything there
 * is to read, and a search box. No catalogue tree, no "my learning" tab, no
 * dashboard — at this size the whole handbook fits above the fold and anything
 * else would be furniture between a coach and the answer they came for.
 */
export default function LearningHomePage() {
  const access = useAccess();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/admin/learning/read")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const courses = useMemo(() => data?.courses ?? [], [data]);
  const canAuthor = !!access && effectiveCanEdit(access, "/api/admin/learning/courses");

  const path = useMemo(() => {
    const mine = courses.filter((c) => c.for_me);
    const done = mine.reduce((n, c) => n + courseProgress(c.lessons).done, 0);
    const total = mine.reduce((n, c) => n + courseProgress(c.lessons).total, 0);
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [courses]);

  // Client-side, over titles and summaries only. Lesson bodies aren't in this
  // payload on purpose (the catalogue would double in size for a feature that,
  // at a few dozen lessons, a title match already answers). When the handbook
  // outgrows that, this becomes an ilike query — not an embedding index.
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return null;
    const out: { course: CourseCard; lesson: CourseCard["lessons"][number] }[] = [];
    for (const c of courses) {
      for (const l of c.lessons) {
        const hay = `${l.title} ${l.summary ?? ""} ${c.title}`.toLowerCase();
        if (hay.includes(needle)) out.push({ course: c, lesson: l });
      }
    }
    return out;
  }, [q, courses]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Academy</h1>
          <p className="text-sm admin-muted">
            How NP7 works — the admin, the coaching, the guests. Five minutes at a time.
          </p>
        </div>
        {canAuthor && (
          <Link href="/admin/learning/manage" className="admin-btn admin-btn-ghost self-start">
            Manage courses
          </Link>
        )}
      </div>

      {path.total > 0 && (
        <div className="mb-6 rounded-xl p-4 sm:p-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <div className="flex items-baseline justify-between gap-3 mb-2.5">
            <span className="text-sm font-bold admin-heading">Your path</span>
            <span className="text-xs admin-muted">
              {path.done} of {path.total} lesson{path.total !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--admin-active)" }}>
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${path.pct}%`, background: "var(--admin-gradient)" }} />
          </div>
          <p className="mt-2.5 text-xs admin-faint">
            {path.done === path.total
              ? "Everything on your path is read. The rest is here whenever you need it."
              : "Nothing is graded and nobody is chasing you — this is just what we'd want you to have read."}
          </p>
        </div>
      )}

      <div className="mb-5">
        <input
          className="w-full max-w-sm px-3 py-2 admin-input border rounded-lg text-sm"
          placeholder="Search lessons…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : hits ? (
        hits.length === 0 ? (
          <p className="py-12 text-center text-sm admin-faint">Nothing matches that yet.</p>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
            {hits.map(({ course, lesson }) => (
              <Link
                key={lesson.id}
                href={`/admin/learning/${course.slug}/${lesson.slug}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors"
                style={{ borderBottom: "1px solid var(--admin-border)" }}
              >
                <span className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: courseColor(course.icon) }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium admin-heading truncate">{lesson.title}</span>
                  <span className="block text-xs admin-faint truncate">{course.title} · {lesson.minutes} min</span>
                </span>
                {lesson.completed && <span className="text-xs text-green-400 shrink-0">✓</span>}
              </Link>
            ))}
          </div>
        )
      ) : courses.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm admin-faint mb-2">Nothing published yet.</p>
          {canAuthor && (
            <Link href="/admin/learning/manage" className="text-sm text-[var(--admin-accent)] font-semibold">
              The three tracks are already set up — go write the first lesson →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => {
            const p = courseProgress(c.lessons);
            const color = courseColor(c.icon);
            return (
              <Link
                key={c.id}
                href={`/admin/learning/${c.slug}`}
                className="admin-card admin-card-hover p-5 flex flex-col"
                style={{ borderTop: `3px solid ${color}` }}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h2 className="text-base font-bold admin-heading leading-snug">{c.title}</h2>
                  {c.for_me && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: `${color}22`, color }}>
                      Your path
                    </span>
                  )}
                </div>
                {c.summary && <p className="text-xs admin-muted leading-relaxed mb-4">{c.summary}</p>}

                <div className="mt-auto">
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="text-[11px] admin-faint">
                      {p.total} lesson{p.total !== 1 ? "s" : ""}
                      {readingTime(c.lessons) > 0 && ` · ~${readingTime(c.lessons)} min`}
                    </span>
                    <span className="text-[11px] font-semibold" style={{ color: p.done ? color : "var(--admin-text-faint)" }}>
                      {p.total ? `${p.done}/${p.total}` : "empty"}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--admin-active)" }}>
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${p.pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
