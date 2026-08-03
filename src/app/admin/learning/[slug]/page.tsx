"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { courseColor, courseProgress, readingTime, type LearningCourse, type LearningLesson } from "@/lib/learning";
import { LessonBody } from "../lesson-body";

type LessonRow = LearningLesson & { completed: boolean };
type Payload = { course: LearningCourse; lessons: LessonRow[] };

export default function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/learning/read?course=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="py-16 text-center text-sm admin-faint">Loading…</div>;
  if (!data?.course) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm admin-faint mb-3">That course isn&apos;t published.</p>
        <Link href="/admin/learning" className="text-sm text-[var(--admin-accent)] font-semibold">← Back to the Academy</Link>
      </div>
    );
  }

  const { course, lessons } = data;
  const color = courseColor(course.icon);
  const p = courseProgress(lessons.map((l) => ({ ...l, completed: l.completed })));
  // Where "Start"/"Continue" lands: the first thing they haven't ticked off.
  const next = lessons.find((l) => !l.completed) ?? lessons[0];

  return (
    <div className="max-w-3xl">
      <Link href="/admin/learning" className="inline-flex items-center gap-1.5 text-xs admin-faint mb-4 hover:text-[var(--admin-accent)] transition-colors">
        ← Academy
      </Link>

      <div className="rounded-xl p-5 sm:p-6 mb-6" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)", borderTop: `3px solid ${color}` }}>
        <h1 className="text-2xl font-bold admin-heading mb-1.5">{course.title}</h1>
        {course.summary && <p className="text-sm admin-muted mb-4">{course.summary}</p>}

        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--admin-active)" }}>
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${p.pct}%`, backgroundColor: color }} />
          </div>
          <span className="text-xs font-semibold shrink-0" style={{ color: p.done ? color : "var(--admin-text-faint)" }}>
            {p.done}/{p.total}
          </span>
        </div>
        <p className="text-[11px] admin-faint">
          {p.total} lesson{p.total !== 1 ? "s" : ""}
          {readingTime(lessons) > 0 && ` · about ${readingTime(lessons)} minutes end to end`}
        </p>

        {course.description && (
          <div className="mt-5 pt-5" style={{ borderTop: "1px solid var(--admin-border)" }}>
            <LessonBody html={course.description} />
          </div>
        )}

        {next && (
          <Link
            href={`/admin/learning/${course.slug}/${next.slug}`}
            className="mt-5 inline-flex admin-btn admin-btn-primary"
            style={{ backgroundColor: color, color: "#0a0a0a" }}
          >
            {p.done === 0 ? "Start" : p.done === p.total ? "Read again" : "Continue"} · {next.title}
          </Link>
        )}
      </div>

      {lessons.length === 0 ? (
        <p className="py-12 text-center text-sm admin-faint">No lessons in here yet.</p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          {lessons.map((l, i) => (
            <Link
              key={l.id}
              href={`/admin/learning/${course.slug}/${l.slug}`}
              className="flex items-center gap-3 px-4 py-3.5 transition-colors"
              style={{ borderBottom: i < lessons.length - 1 ? "1px solid var(--admin-border)" : undefined }}
            >
              <span
                className="w-6 h-6 shrink-0 grid place-items-center rounded-full text-[10px] font-bold"
                style={l.completed
                  ? { backgroundColor: color, color: "#0a0a0a" }
                  : { border: "1px solid var(--admin-border-strong)", color: "var(--admin-text-faint)" }}
              >
                {l.completed ? "✓" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium admin-heading">{l.title}</span>
                {l.summary && <span className="block text-xs admin-faint truncate">{l.summary}</span>}
              </span>
              <span className="text-[11px] admin-faint shrink-0">{l.minutes} min</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
